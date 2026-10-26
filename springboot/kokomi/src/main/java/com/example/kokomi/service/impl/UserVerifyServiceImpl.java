package com.example.kokomi.service.impl;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.kokomi.common.ResultCode;
import com.example.kokomi.entity.User;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.mapper.UserMapper;
import com.example.kokomi.mapper.UserRoleMapper;
import com.example.kokomi.service.MailService;
import com.example.kokomi.service.UserVerifyService;
import com.example.kokomi.util.EmailCodeCache;
import com.example.kokomi.util.PermissionCache;
import com.example.kokomi.vo.VerifySendVO;

import cn.hutool.core.util.StrUtil;
import cn.hutool.core.lang.Validator;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserVerifyServiceImpl implements UserVerifyService {

    /** 验证码有效期，要和 EmailCodeCache 里的 EXPIRE_MS 一致，只用于邮件正文 */
    private static final int CODE_MINUTES = 10;
    private static final String CODE_SENT_TEXT = "验证码已发送，请查收邮件（没收到就看一眼垃圾箱）";

    /** 绑定邮箱后升级到的角色；游客之外的任何角色都不动 */
    private static final String GUEST_ROLE = "guest";
    private static final String MEMBER_ROLE = "member";

    private final UserMapper userMapper;
    private final UserRoleMapper userRoleMapper;
    private final MailService mailService;

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

    @Override
    public VerifySendVO sendCode(Long userId, String email) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new CustomerException(ResultCode.AUTHOR_ERROR, "登录状态已失效，请重新登录");
        }
        if (isVerifiedValue(user.getEmailVerified())) {
            return result(false, maskEmail(user.getEmail()), "邮箱已验证，无需重复绑定", 0, null);
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

        EmailCodeCache.Check check = EmailCodeCache.check(target, code);
        switch (check.result) {
            case OK -> {
                int rows = userMapper.bindEmail(userId, target);
                if (rows != 1) {
                    throw new CustomerException(ResultCode.SERVER_ERROR, "绑定失败，请稍后重试");
                }
                log.info("[verify] 用户 {} 绑定邮箱成功 {}", userId, maskEmail(target));
                promoteIfGuest(userId);
            }
            case WRONG -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "验证码不正确，还可以再试 " + check.remaining + " 次");
            case TOO_MANY -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "错误次数过多，验证码已作废，请重新获取");
            default -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "验证码已失效，请重新获取");
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void markVerified(Long userId) {
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
        User owner = userMapper.selectByAccount(email);
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
