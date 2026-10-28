package com.example.kokomi.service.impl;

import java.util.List;

import org.mindrot.jbcrypt.BCrypt;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.kokomi.common.ResultCode;
import com.example.kokomi.dto.PasswordDTO;
import com.example.kokomi.entity.User;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.mapper.UserMapper;
import com.example.kokomi.mapper.UserRoleMapper;
import com.example.kokomi.service.MailService;
import com.example.kokomi.service.UserVerifyService;
import com.example.kokomi.util.EmailCodeCache;
import com.example.kokomi.util.PermissionCache;
import com.example.kokomi.util.RegisterTicketCache;
import com.example.kokomi.util.RsaUtil;
import com.example.kokomi.util.UserTokenVersionCache;
import com.example.kokomi.vo.VerifySendVO;

import cn.hutool.core.util.StrUtil;
import cn.hutool.core.lang.Validator;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserVerifyServiceImpl implements UserVerifyService {

    /** 验证码有效期，要和 EmailCodeCache 里的 EXPIRE_MS 一致，只用于邮件正文 */
    private static final int CODE_MINUTES = 10;
    private static final String CODE_SENT_TEXT = "验证码已发送，请查收邮件";
    /**
     * 找回密码的发送文案。
     * <p>
     * 以前这里是条件句「如果该邮箱绑定过账号…」—— 那时候查不到账号也照样回「已发送」。
     * 现在查不到账号会直接报错（见 {@link #sendResetCode}），所以文案可以写实了。
     */
    private static final String RESET_SENT_TEXT = "重置验证码已发送，请查收邮件";

    /** 绑定邮箱后升级到的角色；游客之外的任何角色都不动 */
    private static final String GUEST_ROLE = "guest";
    private static final String MEMBER_ROLE = "member";

    private final UserMapper userMapper;
    private final UserRoleMapper userRoleMapper;
    private final MailService mailService;
    private final RsaUtil rsaUtil;
    private final ObjectMapper objectMapper;

    /** 本地开发用：SMTP 没配时，把明文验证码放进接口响应，省得去翻日志 */
    @Value("${app.mail.dev-echo:false}")
    private boolean devEcho;

    @PostConstruct
    void warnIfNotConfigured() {
        if (!mailService.isConfigured()) {
            log.warn("[mail] SMTP 未配置（spring.mail.username / password 为空）："
                    + "验证码不会真的发出去，只会打到日志。线上必须配 MAIL_USERNAME / MAIL_PASSWORD，"
                    + "否则新用户永远升不成普通用户，也就永远评论不了。");
        }
    }

    // ------------------------------------------------------------------
    // 注册发码（免登录）
    // ------------------------------------------------------------------

    /**
     * 注册前给邮箱发码。
     * <p>
     * 邮箱被占了就直接告诉用户，否则他填完码提交又失败，白等一次邮件和 60 秒倒计时。
     * 找回密码那边也是同样的口径（见 {@link #sendResetCode}）：宁可明说，
     * 也不让用户对着一封不会到的邮件干等。
     * <p>
     * 防刷靠两层：调用方（UserController 的 /register/email-code）在
     * EmailCodeCache 的同邮箱 60 秒 / 每小时 5 封 + 全站每分钟 8 封配额之内，
     * 注册接口本身还有同 IP 20 次/小时的 RegisterRateLimit。
     */
    @Override
    public VerifySendVO sendRegisterCode(String email) {
        String target = StrUtil.trimToNull(email);
        if (target == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "请填写邮箱");
        }
        if (!Validator.isEmail(target) || target.length() > 50) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "请输入正确的邮箱");
        }
        User owner = userMapper.selectByEmail(target);
        if (owner != null) {
            throw new CustomerException(ResultCode.REGISTER_ERROR, "该邮箱已被注册");
        }

        EmailCodeCache.Issue issue = EmailCodeCache.issue(target);
        if (!issue.isOk()) {
            return result(false, maskEmail(target), issue.reason, issue.retryAfter, null);
        }

        boolean configured = mailService.isConfigured();
        try {
            mailService.sendVerifyCode(target, issue.code, CODE_MINUTES);
        } catch (CustomerException e) {
            return result(false, maskEmail(target), e.getMessage(), 30, null);
        }
        if (!configured) {
            log.warn("[verify] SMTP 未配置，注册验证码：{} → {}", maskEmail(target), issue.code);
        }
        return result(true, maskEmail(target), CODE_SENT_TEXT, 60,
                (!configured && devEcho) ? issue.code : null);
    }

    /**
     * 注册第一步的后半：校验邮箱验证码，通过后发 ticket。
     * <p>
     * 用 {@link EmailCodeCache#verify} 而不是 check：这里**只验不消费**。
     * 用户验完可能压根不走第二步（关掉弹窗、先去看看别的、过几分钟再来），
     * 再打开注册框时手上只有那封邮件；如果这里把码烧了，他会看到「验证码已失效」，
     * 而邮件上明明写着 10 分钟内有效。码在有效期内随便验几次都不增加风险，
     * 建号成功时由 {@code UserServiceImpl#register} 统一清掉。
     * <p>
     * 顺序仍然把验码放在最后：邮箱已被注册时直接把话说明白（这里不玩防枚举那套），
     * 失败也不烧掉他刚收到的码。
     */
    @Override
    public String verifyRegisterEmail(String email, String code) {
        String target = StrUtil.trimToNull(email);
        if (target == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "请填写邮箱");
        }
        if (!Validator.isEmail(target) || target.length() > 50) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "请输入正确的邮箱");
        }
        if (StrUtil.isBlank(code)) {
            throw new CustomerException(ResultCode.VERIFY_CODE_ERROR, "请输入验证码");
        }

        User owner = userMapper.selectByEmail(target);
        if (owner != null) {
            throw new CustomerException(ResultCode.REGISTER_ERROR, "该邮箱已被注册");
        }

        EmailCodeCache.Check check = EmailCodeCache.verify(target, code);
        switch (check.result) {
            case OK -> {
            }
            case WRONG -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "验证码不正确，还可以再试 " + check.remaining + " 次");
            case TOO_MANY -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "错误次数过多，验证码已作废，请重新获取");
            case SUPERSEDED -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "验证码已更新，请使用最新收到的那封邮件里的验证码");
            default -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "验证码已失效，请重新获取");
        }
        // 同一邮箱验多少次都只拿同一张票（见 RegisterTicketCache#issue）：
        // 验证码现在是「只验不消费」，不提防的话一个人能靠一个码把这个接口刷成内存炸弹
        String ticket = RegisterTicketCache.issue(target);
        if (ticket == null) {
            throw new CustomerException(ResultCode.REGISTER_ERROR, "当前注册人数较多，请稍后再试");
        }
        log.info("[register] 邮箱 {} 验证通过，已发注册凭证", maskEmail(target));
        return ticket;
    }

    @Override
    public VerifySendVO sendCode(Long userId, String email) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new CustomerException(ResultCode.AUTHOR_ERROR, "登录状态已失效，请重新登录");
        }
        // 已经有验证过的邮箱了：这个接口是「补绑」用的，不要拿它当换绑（换绑要验密码）。
        // 文案要指路，否则用户只会看到一句「无需重复绑定」然后不知道去哪换。
        if (isVerifiedValue(user.getEmailVerified())) {
            return result(false, maskEmail(user.getEmail()),
                    "这个账号已经绑过邮箱了，要更换请用「换绑」", 0, null);
        }

        String target = resolveEmail(user, email);
        if (target == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "请先填写要绑定的邮箱");
        }
        ensureEmailUsable(userId, target);

        EmailCodeCache.Issue issue = EmailCodeCache.issue(target);
        if (!issue.isOk()) {
            return result(false, maskEmail(target), issue.reason, issue.retryAfter, null);
        }

        boolean configured = mailService.isConfigured();
        try {
            mailService.sendVerifyCode(target, issue.code, CODE_MINUTES);
        } catch (CustomerException e) {
            // 发信失败不算「已发送」，让前端把倒计时清掉，用户才好重试
            return result(false, maskEmail(target), e.getMessage(), 30, null);
        }

        if (!configured) {
            log.warn("[verify] SMTP 未配置，{} 的验证码是 {}（{} 分钟内有效）",
                    target, issue.code, CODE_MINUTES);
        }
        return result(true, maskEmail(target), CODE_SENT_TEXT, 60,
                (!configured && devEcho) ? issue.code : null);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void confirm(Long userId, String email, String code) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new CustomerException(ResultCode.AUTHOR_ERROR, "登录状态已失效，请重新登录");
        }
        // 幂等：已经绑过邮箱再点一次，不该报错
        if (isVerifiedValue(user.getEmailVerified())) {
            return;
        }
        String target = resolveEmail(user, email);
        if (target == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "请先填写要绑定的邮箱");
        }
        ensureEmailUsable(userId, target);

        EmailCodeCache.Check check = EmailCodeCache.verify(target, code);
        switch (check.result) {
            case OK -> {
                int rows;
                try {
                    rows = userMapper.bindEmail(userId, target);
                } catch (DuplicateKeyException e) {
                    // uk_user_email 兜底，理由同 confirmChange：并发抢同一邮箱时唯一索引会抛，
                    // 不接住就是「服务器繁忙」
                    throw new CustomerException(ResultCode.PARAM_ERROR, "该邮箱已被其他账号绑定");
                }
                if (rows != 1) {
                    throw new CustomerException(ResultCode.SERVER_ERROR, "绑定失败，请稍后重试");
                }
                // 绑成功了才作废验证码（verify 不消费，见它的注释）
                EmailCodeCache.clear(target);
                log.info("[verify] 用户 {} 绑定邮箱成功 {}", userId, maskEmail(target));
                promoteIfGuest(userId);
            }
            case WRONG -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "验证码不正确，还可以再试 " + check.remaining + " 次");
            case TOO_MANY -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "错误次数过多，验证码已作废，请重新获取");
            case SUPERSEDED -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "验证码已更新，请使用最新收到的那封邮件里的验证码");
            default -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "验证码已失效，请重新获取");
        }
    }

    /**
     * 后台「激活」：手动把邮箱标记为已验证（SMTP 抽风时的兜底）。
     * <p>
     * ⚠️ 必须先有邮箱。历史版本的坑：这个方法只写 email_verified=1、不碰 email，
     * 而它的使用场景恰恰是「这个用户没有邮箱」——结果造出 `email = NULL, email_verified = 1`
     * 的死状态：个人中心显示「未绑定」，用户点「去绑定」，服务端却回「邮箱已验证，无需重复绑定」，
     * 用户彻底没有出口，只能改库。现在邮箱为空时直接拒绝，并告诉管理员该怎么做。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void markVerified(Long userId) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "用户不存在");
        }
        if (StrUtil.isBlank(user.getEmail())) {
            throw new CustomerException(ResultCode.PARAM_ERROR,
                    "该用户还没有邮箱，没法标记为已验证 —— 让对方在「个人中心 → 账号管理」先绑定一个");
        }
        int rows = userMapper.setEmailVerified(userId);
        if (rows != 1) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "用户不存在");
        }
        // 后台点「激活」的语义就是「这人放行」：游客顺手升成普通用户，
        // 否则激活完了还是发不了评论，管理员会以为没生效。
        promoteIfGuest(userId);
    }

    @Override
    public boolean isVerified(Long userId) {
        if (userId == null) {
            return true;
        }
        User state = userMapper.selectVerifyState(userId);
        return state == null || isVerifiedValue(state.getEmailVerified());
    }

    // ------------------------------------------------------------------
    // 换绑（替代原来的「解绑」）
    // ------------------------------------------------------------------

    /**
     * 换绑第一步：验当前密码 → 给新邮箱发码。
     * <p>
     * 密码是这条链路上唯一的身份复核点。没有它，任何拿到登录态的人都能把邮箱
     * 换成自己的，再走「忘记密码」接管账号 —— 所以这一步不能省。
     */
    @Override
    public VerifySendVO sendChangeCode(Long userId, String email, String encryptedData) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new CustomerException(ResultCode.AUTHOR_ERROR, "登录状态已失效，请重新登录");
        }
        checkPassword(user, encryptedData, "换绑邮箱");

        String target = StrUtil.trimToNull(email);
        if (target == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "请填写新邮箱");
        }
        if (!Validator.isEmail(target) || target.length() > 50) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "请输入正确的邮箱");
        }
        // 换成一个一模一样的邮箱没有意义，还会白白消耗发信配额
        if (target.equalsIgnoreCase(StrUtil.nullToEmpty(user.getEmail()))) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "新邮箱和现在绑定的一样");
        }
        ensureEmailUsable(userId, target);

        EmailCodeCache.Issue issue = EmailCodeCache.issue(target);
        if (!issue.isOk()) {
            return result(false, maskEmail(target), issue.reason, issue.retryAfter, null);
        }

        boolean configured = mailService.isConfigured();
        try {
            mailService.sendVerifyCode(target, issue.code, CODE_MINUTES);
        } catch (CustomerException e) {
            return result(false, maskEmail(target), e.getMessage(), 30, null);
        }
        if (!configured) {
            log.warn("[verify] SMTP 未配置，换绑验证码：{} → {}", maskEmail(target), issue.code);
        }
        return result(true, maskEmail(target), CODE_SENT_TEXT, 60,
                (!configured && devEcho) ? issue.code : null);
    }

    /**
     * 换绑第二步：新邮箱 + 验证码。
     * <p>
     * 这里不再验密码 —— 第一步已经验过，而且验证码本身就是「这个邮箱归他」的证明。
     * 角色一概不动：换邮箱是换联系方式，不是换身份。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void confirmChange(Long userId, String email, String code) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new CustomerException(ResultCode.AUTHOR_ERROR, "登录状态已失效，请重新登录");
        }
        String target = StrUtil.trimToNull(email);
        if (target == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "请填写新邮箱");
        }
        ensureEmailUsable(userId, target);

        EmailCodeCache.Check check = EmailCodeCache.verify(target, code);
        switch (check.result) {
            case OK -> {
                String old = user.getEmail();
                int rows;
                try {
                    rows = userMapper.bindEmail(userId, target);
                } catch (DuplicateKeyException e) {
                    // uk_user_email 兜底：ensureEmailUsable 查过一遍，但两个人同时
                    // 提交同一个邮箱时应用层拦不住，唯一索引会在这里抛。
                    // 不接住的话就是 RuntimeException → 用户只看到「服务器繁忙」。
                    throw new CustomerException(ResultCode.PARAM_ERROR, "该邮箱已被其他账号绑定");
                }
                if (rows != 1) {
                    throw new CustomerException(ResultCode.SERVER_ERROR, "换绑失败，请稍后重试");
                }
                EmailCodeCache.clear(target);
                log.info("[verify] 用户 {} 换绑邮箱 {} → {}", userId, maskEmail(old), maskEmail(target));
            }
            case WRONG -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "验证码不正确，还可以再试 " + check.remaining + " 次");
            case TOO_MANY -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "错误次数过多，验证码已作废，请重新获取");
            case SUPERSEDED -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "验证码已更新，请使用最新收到的那封邮件里的验证码");
            default -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "验证码已失效，请重新获取");
        }
    }

    /**
     * 解绑邮箱。
     * <p>
     * 只做两件事：email 清空、验证位归零。**角色一个都不动** ——
     * 已经通过邮箱注册的用户是 member，解绑只是放弃「忘记密码」这条路，
     * 不该连发帖评论一起收走（发言闸门看的是权限码，跟 email_verified 无关）。
     * <p>
     * 为什么要密码：解绑 + 重新绑自己的邮箱 = 接管账号。密码是这条链路上
     * 唯一能证明「是本人在操作」的东西，不能省。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void unbind(Long userId, String encryptedData) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new CustomerException(ResultCode.AUTHOR_ERROR, "登录状态已失效，请重新登录");
        }
        // 幂等：本来就没绑，直接当成功（前端连点两下不该报错）
        if (StrUtil.isBlank(user.getEmail())) {
            return;
        }
        checkPassword(user, encryptedData, "解绑邮箱");

        String old = user.getEmail();
        int rows = userMapper.unbindEmail(userId);
        if (rows != 1) {
            throw new CustomerException(ResultCode.SERVER_ERROR, "解绑失败，请稍后重试");
        }
        log.info("[verify] 用户 {} 解绑了邮箱 {}", userId, maskEmail(old));
    }

    /**
     * 用当前密码复核身份（换绑邮箱的前置）。
     * <p>
     * 前端走的是和「修改密码」同一套 RSA：encryptedData 解出来是
     * {@code {"oldPassword": "..."}}，所以后端直接复用 PasswordDTO。
     */
    private void checkPassword(User user, String encryptedData, String action) {
        if (StrUtil.isBlank(encryptedData)) {
            // 没传密码是「请求不完整」，用参数错误(400)；
            // 传了但不对是「密码错误」(504)，前端可以据此把它落到密码输入框上
            throw new CustomerException(ResultCode.PARAM_ERROR, "请输入当前密码");
        }
        String json = rsaUtil.decrypt(encryptedData);
        if (json == null) {
            throw new CustomerException(ResultCode.RSA_DECRYPT_ERROR, "解密失败");
        }
        PasswordDTO dto;
        try {
            dto = objectMapper.readValue(json, PasswordDTO.class);
        } catch (Exception e) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "参数格式错误");
        }
        String password = StrUtil.trimToNull(dto.getOldPassword());
        if (password == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "请输入当前密码");
        }
        if (!BCrypt.checkpw(password, user.getPassword())) {
            // 文案里带上动作名，用户才知道自己是在哪一步被拦下的
            throw new CustomerException(ResultCode.UPDATE_PASSWORD_ERROR,
                    "当前密码不正确，" + action + "需要验证密码");
        }
    }

    // ------------------------------------------------------------------
    // 找回密码
    // ------------------------------------------------------------------

    @Override
    public VerifySendVO sendResetCode(String email) {
        String target = StrUtil.trimToNull(email);
        if (target == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "请输入要找回的邮箱");
        }
        if (!Validator.isEmail(target) || target.length() > 50) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "请输入正确的邮箱");
        }

        // 查不到「已验证的邮箱」就直接说，不再假装「已发送」。
        //
        // 这里的口径原来是防枚举：不管有没有账号都回同一句、只有真账号才发信。
        // 2026-10-28 改掉了，三条理由：
        //   ① 注册接口（/register/email-code）对「该邮箱已被注册」本来就是明说的
        //      （不说实话用户会一直试）。想探某个邮箱有没有账号，走注册框一步就够，
        //      这里沉默换不来任何保密，只是把防御堆在了没用的地方；
        //   ② 真实代价全落在用户身上 —— 解绑过邮箱又忘了密码的人，看到「已发送」
        //      却永远收不到邮件，也没有任何线索知道这条路已经断了，只能来问客服；
        //   ③ 原来那个「静默分支」还要调 EmailCodeCache.issue 占一次配额，
        //      被随机邮箱刷的时候会白占缓存名额（MAX_SIZE 5000）。
        // 口径仍然做了取舍：只说「没有绑定账号」，不区分「从没注册」和「解绑了」——
        // 解绑后 email 列已经清空，这两种情况在库里本来就是同一个样子，
        // 也就不会多泄露「这个邮箱曾经注册过」。
        // 文案只留主句（不再括注「解绑过…」）：拦截器会把 msg 原样弹成顶部 toast，
        // 长文案在那儿要占三行，而表单里已经有一行红字，同一句话看两遍很吵。
        User owner = userMapper.selectByVerifiedEmail(target);
        if (owner == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "该邮箱没有绑定账号");
        }

        EmailCodeCache.Issue issue = EmailCodeCache.issue(target);
        if (!issue.isOk()) {
            return result(false, maskEmail(target), issue.reason, issue.retryAfter, null);
        }

        boolean configured = mailService.isConfigured();
        try {
            mailService.sendResetCode(target, issue.code, CODE_MINUTES);
        } catch (CustomerException e) {
            return result(false, maskEmail(target), e.getMessage(), 30, null);
        }
        log.info("[reset] 用户 {} 申请重置密码，验证码已发往 {}",
                owner.getId(), maskEmail(target));
        return result(true, maskEmail(target), RESET_SENT_TEXT, 60,
                (!configured && devEcho) ? issue.code : null);
    }

    @Override
    public void verifyResetCode(String email, String code) {
        String target = StrUtil.trimToNull(email);
        if (target == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "请输入邮箱");
        }
        // 只验码：不查账号、不消费。查账号会把「这个邮箱有没有人用」提前漏给第 1 步，
        // 不消费是为了第 2 步 resetPassword 还能拿同一个码再验一次（那里失败也还能原地重试）。
        checkResetCode(target, code);
        log.info("[reset] {} 的重置码已通过校验，进入设置新密码", maskEmail(target));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void resetPassword(String email, String code, String encryptedData) {
        String target = StrUtil.trimToNull(email);
        if (target == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "请输入要找回的邮箱");
        }

        // ① 先把新密码解出来、校验完，再动验证码。
        //    「两次密码不一致」这种纯前端问题不该把码烧掉，用户得重发一封邮件。
        //    密码校验不涉及账号是否存在，所以放前面不会泄露信息。
        String newPassword = decodeNewPassword(encryptedData);

        // ② 校验验证码（错 5 次作废，见 EmailCodeCache）。
        //    用 verify：这里只验不消费 —— 校验通过但后面「这个邮箱没有账号」
        //    之类的失败还得让他能再试一次，真改成功了在末尾 clear。
        checkResetCode(target, code);

        // ③ 验证码过了才查账号 —— 反过来写的话，没验证码的人也能靠报错文案试探。
        User owner = userMapper.selectByVerifiedEmail(target);
        if (owner == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "该邮箱没有绑定账号");
        }

        String encoded = BCrypt.hashpw(newPassword, BCrypt.gensalt());
        int rows = userMapper.updatePasswordAndVersion(owner.getId(), encoded);
        if (rows != 1) {
            throw new CustomerException(ResultCode.SERVER_ERROR, "重置失败，请稍后重试");
        }
        // 密码改了 = 旧 token 全部作废（SQL 里 token_version + 1），
        // 内存里缓存的版本号也得清掉，否则拦截器还会拿旧版本放行
        UserTokenVersionCache.removeVersion(owner.getId());
        // 改完了才真正把码作废：verify 只是「验」，不作废是为了让中间任何一步
        // 失败都能原地重试，成功之后立刻清干净，避免 10 分钟内再被用一次
        EmailCodeCache.clear(target);
        log.info("[reset] 用户 {} 通过邮箱验证码重置了密码", owner.getId());
    }

    /**
     * 校验重置验证码：错 5 次作废（见 EmailCodeCache），**只验不消费**。
     * <p>
     * 第 1 步「下一步」和第 2 步提交共用这一段，保证两处的文案、剩余次数、
     * 旧码作废的语义完全一致 —— 否则用户会在两步里看到两套说法。
     */
    private void checkResetCode(String target, String code) {
        if (StrUtil.isBlank(code)) {
            throw new CustomerException(ResultCode.VERIFY_CODE_ERROR, "请输入验证码");
        }
        EmailCodeCache.Check check = EmailCodeCache.verify(target, code);
        switch (check.result) {
            case OK -> {
            }
            case WRONG -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "验证码不正确，还可以再试 " + check.remaining + " 次");
            case TOO_MANY -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "错误次数过多，验证码已作废，请重新获取");
            case SUPERSEDED -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "验证码已更新，请使用最新收到的那封邮件里的验证码");
            default -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "验证码已失效，请重新获取");
        }
    }

    /**
     * 解出并校验新密码，返回明文（调用方负责 BCrypt）。
     * 与 /user/password 用同一套 RSA，前端不用为它另写一份加密逻辑。
     */
    private String decodeNewPassword(String encryptedData) {
        String json = rsaUtil.decrypt(encryptedData);
        if (json == null) {
            throw new CustomerException(ResultCode.RSA_DECRYPT_ERROR, "解密失败");
        }
        PasswordDTO dto;
        try {
            dto = objectMapper.readValue(json, PasswordDTO.class);
        } catch (Exception e) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "参数格式错误");
        }
        String newPassword = StrUtil.trimToNull(dto.getNewPassword());
        String confirm = StrUtil.trimToNull(dto.getConfirmPassword());
        if (newPassword == null) {
            throw new CustomerException(ResultCode.UPDATE_PASSWORD_ERROR, "请输入新密码");
        }
        if (newPassword.length() < 6) {
            throw new CustomerException(ResultCode.UPDATE_PASSWORD_ERROR, "新密码至少 6 位");
        }
        if (newPassword.length() > 32) {
            throw new CustomerException(ResultCode.UPDATE_PASSWORD_ERROR, "新密码不超过 32 位");
        }
        if (!newPassword.equals(confirm)) {
            throw new CustomerException(ResultCode.UPDATE_PASSWORD_ERROR, "两次输入的新密码不一致");
        }
        return newPassword;
    }

    // ------------------------------------------------------------------
    // 内部
    // ------------------------------------------------------------------

    /**
     * 确定这次要操作的邮箱：请求里带了就用请求的，否则用账号上已经存的。
     * 都没有就返回 null（新注册的账号就是这种情况，必须让用户先填）。
     */
    private static String resolveEmail(User user, String email) {
        String target = StrUtil.trimToNull(email);
        if (target == null) {
            target = StrUtil.trimToNull(user.getEmail());
        }
        return target;
    }

    /** 格式 + 长度 + 有没有被别人占用 */
    private void ensureEmailUsable(Long userId, String email) {
        if (!Validator.isEmail(email)) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "请输入正确的邮箱");
        }
        if (email.length() > 50) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "邮箱过长");
        }
        // 只看 email 列，不看验证位：只要有人填过就该拦，别让两个人抢同一个邮箱
        User owner = userMapper.selectByEmail(email);
        if (owner != null && !owner.getId().equals(userId)) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "该邮箱已被其他账号绑定");
        }
    }

    /**
     * 只有「纯游客」（或压根没有角色的脏数据）才会被升成普通用户。
     * <p>
     * 已经挂过任何其它角色的一律不动 —— 尤其是管理员手动降级成游客的人，
     * 不该因为绑个邮箱就自己爬回普通用户。
     *
     * @return 是否发生了升级
     */
    private boolean promoteIfGuest(Long userId) {
        List<String> roles = userRoleMapper.selectRolesByUserId(userId);
        boolean onlyGuest = roles.isEmpty()
                || roles.stream().allMatch(r -> GUEST_ROLE.equals(r));
        if (!onlyGuest) {
            return false;
        }
        if (!roles.isEmpty()) {
            userRoleMapper.deleteByUserId(userId);
        }
        userRoleMapper.insertUserRole(userId, MEMBER_ROLE);
        userMapper.updatePrimaryRole(userId, MEMBER_ROLE);
        // 权限是内存缓存的，角色变了必须失效，否则这次登录依旧没有 comment:create
        PermissionCache.remove(userId);
        log.info("[verify] 用户 {} 由游客升级为普通用户", userId);
        return true;
    }

    private static boolean isVerifiedValue(Integer value) {
        return value != null && value == 1;
    }

    /** a***@qq.com —— 提示文案里不暴露完整邮箱 */
    private static String maskEmail(String email) {
        if (email == null || email.isBlank()) {
            return "";
        }
        int at = email.indexOf('@');
        if (at <= 0) {
            return email;
        }
        String name = email.substring(0, at);
        String head = name.length() <= 1 ? name : name.substring(0, 1);
        return head + "***" + email.substring(at);
    }

    private static VerifySendVO result(boolean sent, String email, String message,
            int retryAfter, String devCode) {
        VerifySendVO vo = new VerifySendVO();
        vo.setSent(sent);
        vo.setEmail(email);
        vo.setMessage(message);
        vo.setRetryAfter(retryAfter);
        vo.setDevCode(devCode);
        return vo;
    }
}
