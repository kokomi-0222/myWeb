package com.example.kokomi.service.impl;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import org.mindrot.jbcrypt.BCrypt;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.kokomi.bo.UserBO;
import com.example.kokomi.common.BanLevel;
import com.example.kokomi.common.BanText;
import com.example.kokomi.common.Result;
import com.example.kokomi.common.ResultCode;
import com.example.kokomi.dto.EncryptDataDTO;
import com.example.kokomi.dto.LoginDTO;
import com.example.kokomi.dto.PasswordDTO;
import com.example.kokomi.dto.RegisterDTO;
import com.example.kokomi.dto.RegisterFormDTO;
import com.example.kokomi.dto.UserUpdateDTO;
import com.example.kokomi.entity.User;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.mapper.RolePermissionMapper;
import com.example.kokomi.mapper.PostMapper;
import com.example.kokomi.mapper.UserMapper;
import com.example.kokomi.mapper.UserRoleMapper;
import com.example.kokomi.service.UserService;
import com.example.kokomi.vo.LoginVO;
import com.example.kokomi.vo.UserProfileVO;
import com.example.kokomi.util.CaptchaCache;
import com.example.kokomi.util.EmailCodeCache;
import com.example.kokomi.util.IpUtils;
import com.example.kokomi.util.RegisterRateLimit;
import com.example.kokomi.util.RegisterTicketCache;
import com.example.kokomi.util.LoginUserHolder;
import com.example.kokomi.util.PermissionCache;
import com.example.kokomi.util.RsaUtil;
import com.example.kokomi.util.UserTokenVersionCache;

import cn.hutool.core.lang.RegexPool;
import cn.hutool.core.util.ReUtil;
import cn.hutool.core.util.StrUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserServiceImpl implements UserService {

    /**
     * 新注册用户的角色编码 = 普通用户（member）。
     * <p>
     * 站内是三级：guest（游客）→ member（普通用户）→ vip（会员）。
     * 但**注册不再产生游客**：邮箱在注册时就必须验证通过，验证过的人直接就是普通用户
     * （能发帖能评论），所以新号一进来就能用，不存在「注册完什么都干不了」的空窗期。
     * <p>
     * guest 现在只剩两种来源：① 升级前注册、至今没绑邮箱的存量账号；
     * ② 管理员在后台手动降级。它的权限码是空的，发帖评论都会被 Service 层拦住。
     * <p>
     * 注册时会同时写入 user 的 primary_role（身份标签）和 user_role（鉴权用）两处：
     * 前者只负责显示，后者才是权限链路的起点。只写前者的话，
     * /user/info 的 permissions 会是空数组、后台用户管理页会显示「无角色」。
     */
    private static final String DEFAULT_ROLE = "member";

    /**
     * 系统生成的用户名前缀。
     * <p>
     * 用户名不由用户填写，统一是 {@code kokomi_} + 主键序号（补到 5 位），
     * 例如 {@code kokomi_00128}；id 超过 5 位自然变长（{@code kokomi_100128}），
     * 始终落在 {@code username varchar(50)} 里。
     * <p>
     * 为什么用序号而不是随机串：随机串当初是为了「不暴露注册顺序、防遍历」，
     * 但本站没有任何按用户名访问的路由（不存在 {@code /u/{username}}），
     * 别人拿不到用户名列表，这个理由不成立；id 本来就在接口返回里，也不差这一份。
     * 而序号是可读的 —— 日志里 {@code kokomi_00128} 一眼看出是谁、第几个，
     * 随机串在 journalctl 里只能当乱码看。而且 id 唯一 ⇒ 用户名必唯一，
     * 不需要「先查一次 + 撞名重试」那套逻辑。
     */
    private static final String USERNAME_PREFIX = "kokomi_";
    /** 序号补零到这个宽度（只影响观感，不限制长度） */
    private static final int USERNAME_SEQ_WIDTH = 5;

    /**
     * 后台「用户管理」的权限码。
     * <p>
     * 持有它的账号不允许自助注销：注销不可逆，最后一个管理员把自己删掉之后
     * 站里就没人能进后台了，只能去改数据库。要删必须先由别人把权限收走。
     */
    private static final String MANAGE_PERMISSION = "user:manage";

    private final UserMapper userMapper;
    private final UserRoleMapper userRoleMapper;
    private final RolePermissionMapper rolePermissionMapper;
    private final PostMapper postMapper;
    private final RsaUtil rsaUtil;
    private final ObjectMapper objectMapper;

    @Value("${app.upload-path}")
    private String uploadPath;

    @Value("${app.base-url}")
    private String baseUrl;

    /**
     * 注册限流阈值（可选）。本地联调 / 自动化验收会反复注册临时账号，
     * 默认的 20 个/小时根本不够，所以在 local 配置里放宽；线上不设这两个键，走默认。
     */
    @Value("${app.register.rate-limit-per-ip:}")
    private String rateLimitPerIp;

    @Value("${app.register.rate-limit-global:}")
    private String rateLimitGlobal;

    @jakarta.annotation.PostConstruct
    public void initRateLimit() {
        RegisterRateLimit.configure(
                StrUtil.isBlank(rateLimitPerIp) ? null : Integer.valueOf(rateLimitPerIp.trim()),
                StrUtil.isBlank(rateLimitGlobal) ? null : Integer.valueOf(rateLimitGlobal.trim()));
    }


    @Override
    public UserBO login(EncryptDataDTO encryptedDto) {
        // 验证码校验
        if (StrUtil.isBlank(encryptedDto.getCaptchaKey())
                || StrUtil.isBlank(encryptedDto.getCaptchaCode())) {
            throw new CustomerException(ResultCode.CAPTCHA_ERROR, "请输入验证码");
        }
        if (!CaptchaCache.verifyAndRemove(
                encryptedDto.getCaptchaKey(), encryptedDto.getCaptchaCode())) {
            throw new CustomerException(ResultCode.CAPTCHA_ERROR, "验证码错误或已过期");
        }
        //解密
        String json = rsaUtil.decrypt(encryptedDto.getEncryptedData());
        if (json == null) {
            throw new CustomerException(ResultCode.RSA_DECRYPT_ERROR, "解密失败");
        }
        //DTO
        LoginDTO dto;
        try {
            dto = objectMapper.readValue(json, LoginDTO.class);
        } catch (Exception e) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "参数格式错误");
        }
        //System.out.println(dto);
        // 查询用户
        User user = userMapper.selectByAccount(dto.getAccount());
        if (user == null) {
            System.out.println("账号不存在");
            throw new CustomerException(ResultCode.LOGIN_ERROR, "账号或密码不正确");
        }
        // 校验密码 String password = BCrypt.hashpw(原始明文密码, BCrypt.gensalt());
        if (!BCrypt.checkpw(dto.getPassword(), user.getPassword())) {
            throw new CustomerException(ResultCode.LOGIN_ERROR, "账号或密码不正确");
        }

        // 处罚校验放在密码之后：不让不知道密码的人探出「这个账号被处理过」
        autoReleaseIfExpired(user);
        if (BanLevel.isBanned(user.getStatus())) {
            // 封号：连登录都不给
            throw new CustomerException(ResultCode.LOGIN_ERROR,
                    BanText.loginDenied(user.getBanUntil(), user.getBanReason()));
        }
        // 禁言：允许登录，只是发不出内容。
        // 放行的同时把 status 带给前端，让它把发布框禁掉，
        // 而不是等人写完一大段才被后端拦下来。

        //转换 + 赋值角色权限
        UserBO userBO = convertToUserBO(user);
        userBO.setRoles(userRoleMapper.selectRolesByUserId(user.getId()));
        userBO.setPermissions(rolePermissionMapper.selectPermissionsByUserId(user.getId()));

        // 预热权限缓存，后续请求无需再查 DB
        PermissionCache.put(user.getId(),
                new java.util.HashSet<>(userBO.getRoles()),
                new java.util.HashSet<>(userBO.getPermissions()));
        //System.out.println(userBO);
        return userBO;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Result<LoginVO> register(RegisterFormDTO form) {
        // 注册频率兜底：正常用户碰不到（同 IP 20 个/小时），脚本刷号才会撞上。
        // 内容质量靠等级挡，这一层只挡「把 user 表刷爆」。
        if (!RegisterRateLimit.tryAcquire(IpUtils.getCurrentIP())) {
            throw new CustomerException(ResultCode.REGISTER_ERROR, "注册太频繁，请稍后再试");
        }

        // ---------------- 第一步的凭证：邮箱以 ticket 为准 ----------------
        // 注册拆成两步（见 UserController#verifyRegisterEmail）：
        //   ① 邮箱 + 验证码 → 服务端发一张 ticket（第一步只验不消费，见 EmailCodeCache#verify）；
        //   ② 凭 ticket + 密码建号。
        // 邮箱**只从 ticket 里取**，不看请求体里的 email —— 否则能「验 A 的邮箱、
        // 注册成 B 的邮箱」，那第一步就白做了。
        String ticket = StrUtil.trimToNull(form.getTicket());
        if (ticket == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "请先验证邮箱");
        }
        String email = RegisterTicketCache.peek(ticket);
        if (email == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "邮箱验证已过期，请重新验证邮箱");
        }

        // ---------------- 用户名：系统生成，不让用户填 ----------------
        // 建号后按主键拼成 kokomi_00128（见 USERNAME_PREFIX），用户填不了：
        //   ① 注册路径越短越好 ——「用户名已被占用」是最容易让人卡住重填的一步；
        //   ② 用户名不是展示名，站内显示的是 name（昵称），它只是登录/归属标识，
        //      用户点自己头像进个人中心就能看到。
        // 老前端可能还会带 form.account 上来，这里直接忽略（下面不再引用它）。

        // 邮箱是否已被注册。第一步发码时查过一次，这里再查一次 ——
        // 两次之间可能已经有人用同一个邮箱注册成功了（并发），唯一索引也会兜底。
        User emailOwner = userMapper.selectByEmail(email);
        if (emailOwner != null) {
            throw new CustomerException(ResultCode.REGISTER_ERROR, "该邮箱已被注册");
        }

        // ---------------- 密码：只加密这两项，RSA 装得下 ----------------
        String json = rsaUtil.decrypt(form.getEncryptedData());
        if (json == null) {
            throw new CustomerException(ResultCode.RSA_DECRYPT_ERROR, "解密失败");
        }
        RegisterDTO dto;
        try {
            dto = objectMapper.readValue(json, RegisterDTO.class);
        } catch (Exception e) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "参数格式错误");
        }
        if (StrUtil.hasBlank(dto.getPassword(), dto.getConfirmPassword())) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "密码、确认密码不能为空");
        }

        String password = StrUtil.trim(dto.getPassword());
        String confirmPwd = StrUtil.trim(dto.getConfirmPassword());

        // 两次密码一致
        if (!StrUtil.equals(password, confirmPwd)) {
            throw new CustomerException(ResultCode.REGISTER_ERROR, "两次密码不一致");
        }

        // 密码长度 >=6
        if (password.length() < 6) {
            throw new CustomerException(ResultCode.REGISTER_ERROR, "密码长度不能少于6位");
        }

        if (password.length() > 32) {
            throw new CustomerException(ResultCode.REGISTER_ERROR, "密码长度不能超过32位");
        }

        // 密码格式：字母+数字+下划线
        if (!ReUtil.isMatch(RegexPool.GENERAL, password)) {
            throw new CustomerException(ResultCode.REGISTER_ERROR, "密码只能包含字母、数字、下划线");
        }

        // 密码加密
        String encodePwd = BCrypt.hashpw(password, BCrypt.gensalt());

        // 入库：邮箱和验证位一起写。
        // 能走到这里说明第一步已经把邮箱验过了（ticket 就是证据），
        // 所以 email_verified 直接是 1，新号一落地就是普通用户（能发帖能评论），
        // 不存在「注册完什么都干不了」的空窗期。
        // name_color 不设 —— 它是固定色、不随主题变，深色值在暗色模式下会看不见，
        // 交给 DDL 默认的 #636161。
        User user = new User();
        user.setPassword(encodePwd);
        user.setEmail(email);
        user.setEmailVerified(1);
        user.setPrimaryRole(DEFAULT_ROLE);
        // 插入后自动获取自增 ID
        int rows;
        try {
            rows = userMapper.insert(user);
        } catch (DuplicateKeyException e) {
            // 上面的 selectByEmail 挡不住并发（双击「注册」、两台设备同时提交）：
            // 两个请求都能查到「邮箱没人用」，第二个 insert 由 uk_user_email 拦下。
            // 不接住的话 MyBatis 抛的是 RuntimeException，用户看到的是「服务器繁忙」——
            // 而实际上他第一次点击已经注册成功了，这句话只会让他以为全失败了。
            throw new CustomerException(ResultCode.REGISTER_ERROR, "该邮箱已被注册");
        }
        if(rows != 1){
            throw new CustomerException(ResultCode.REGISTER_ERROR, "用户创建失败");
        }
        Long userId = user.getId();
        // 用户名 = kokomi_ + 主键序号，昵称从它派生，然后写回。
        // 不需要查重、不需要撞名重试：id 是自增主键，天然唯一 ⇒ 用户名必唯一
        // （之前的 8 位随机串才需要「先查一次 + DuplicateKeyException 换一个」）。
        String account = usernameOf(userId);
        user.setUsername(account);
        user.setName(defaultNickname(account));
        try {
            if (userMapper.updateUsernameAndName(user) != 1) {
                throw new CustomerException(ResultCode.REGISTER_ERROR, "注册失败，请稍后重试");
            }
        } catch (DuplicateKeyException e) {
            // 理论上不可能命中（id 唯一 → 用户名必唯一）。只有一种情况会撞：
            // 历史数据里已经存在同名的 kokomi_00128（手工改库 / 外部导入）。
            // 重试同一个 id 没有意义，也不能把「用户名已被使用」甩给用户 ——
            // 他根本没填过用户名。
            log.error("[register] 用户名 {} 撞上唯一索引，请检查是否有同名历史数据", account, e);
            throw new CustomerException(ResultCode.REGISTER_ERROR, "注册失败，请稍后重试");
        }

        // 挂上默认角色：user_role 是权限链路的起点，
        // 不写这一条的话，新用户的 permissions 永远是空数组
        userRoleMapper.insertUserRole(userId, DEFAULT_ROLE);

        // 建号成功，凭证作废（不删的话 30 分钟内它还能再提交一次，
        // 虽然会被邮箱唯一索引挡下，但没必要时时去撞库）
        RegisterTicketCache.remove(ticket);
        // 第一步的邮箱验证码也一起清掉。第一步用的是「只验不消费」，
        // 码本来会活到 10 分钟自然过期；号都建好了，没必要留在内存里当第二把钥匙。
        EmailCodeCache.clear(email);

        // 注册即登录：邮箱都验证过了，账号归属已经确认，没必要再让用户输一遍密码。
        // 走 findById 而不是手动拼 BO，是为了让 roles / permissions 一次带全，
        // 否则前端刚登录那几秒会看不到发布框（权限还没进内存）。
        LoginVO vo = LoginVO.fromUserBO(findById(userId));
        log.info("[register] 新用户 {}（{}）注册成功，邮箱 {} 已验证",
                userId, account, email);
        return Result.success(vo);
    }

    /**
     * 按主键序号拼一个用户名：{@code kokomi_00128}。
     * <p>
     * 补零只为观感（长度一致、列表对齐）；id 超过 5 位就自然变长，不做截断。
     */
    private static String usernameOf(Long id) {
        return USERNAME_PREFIX + String.format("%0" + USERNAME_SEQ_WIDTH + "d", id);
    }

    /**
     * 从用户名推一个合法昵称。
     * <p>
     * 昵称的规则是「≤12 字符、只允许中文 / 英文 / 数字 / 下划线」（见 {@link #updateProfile}），
     * 而用户名未必合规，所以要清洗一遍。不这么做的话，新用户一进「账号管理」点保存
     * 就会被后端拒掉（"昵称不能包含特殊字符"），而他什么都没改。
     * <p>
     * 系统生成的 {@code kokomi_00128} 单独处理：取出序号、去掉前导零拼成
     * 「用户128」。既符合昵称规则（全是数字+汉字），也比原样截断成 "kokomi_00"
     * 好认 —— 后者用户会觉得"这网站连昵称都不会起"。
     */
    private static String defaultNickname(String account) {
        if (account != null && account.startsWith(USERNAME_PREFIX)) {
            String tail = account.substring(USERNAME_PREFIX.length());
            if (tail.matches("\\d+")) {
                // 去掉前导零：kokomi_00128 → 用户128（别给用户看「用户00128」）
                return "用户" + tail.replaceFirst("^0+(?!$)", "");
            }
        }
        String base = account == null ? "" : account;
        int at = base.indexOf('@');
        if (at > 0) {
            base = base.substring(0, at);
        }
        base = base.replaceAll("[^\\u4e00-\\u9fa5A-Za-z0-9]", "");
        if (base.isEmpty()) {
            return "心海用户";
        }
        return base.length() > 12 ? base.substring(0, 12) : base;
    }

    @Override
    public UserBO findById(Long userId) {
        // 1. 根据ID查询用户
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new CustomerException(ResultCode.REGISTER_ERROR, "用户不存在");
        }

        // 临时处罚到期就顺手解除。
        // 只在「登录」和「发内容」时解除是不够的：一个禁言的人整天挂着页面、
        // 又没打算发帖，到点了前端还显示「你已被禁言」。
        // 读用户信息是最常走的入口，补在这里，他刷新一下页面就能恢复。
        autoReleaseIfExpired(user);

        UserBO userBO = convertToUserBO(user);
        userBO.setRoles(userRoleMapper.selectRolesByUserId(user.getId()));
        userBO.setPermissions(rolePermissionMapper.selectPermissionsByUserId(user.getId()));
        return userBO;
    }

    /**
     * 临时处罚到期就顺手解除（就地改传入的 user，不重新查库）。
     * <p>
     * 登录、读用户信息、发内容这三个入口都会调一次。没有定时任务，
     * 也不用担心「到点了但没人碰这个账号」：只要他还在用，总会走到其中一个入口。
     * 永久处罚（ban_until 为 null）不会被动到。
     */
    private void autoReleaseIfExpired(User user) {
        if (!BanLevel.isPunished(user.getStatus())) {
            return;
        }
        if (user.getBanUntil() == null || !user.getBanUntil().isBefore(LocalDateTime.now())) {
            return;
        }
        userMapper.unbanUser(user.getId());
        user.setStatus(BanLevel.NORMAL);
        user.setBanUntil(null);
        user.setBanReason(null);
    }


    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateUserInfo(UserUpdateDTO dto) {
        Long userId = LoginUserHolder.getUserId();
        User oldUser = userMapper.selectById(userId);

        if (oldUser == null) {
            throw new CustomerException(ResultCode.UPDATE_USER_ERROR, "用户不存在");
        }

        // 昵称校验

        // 不能为空、不能全是空格
        if (StrUtil.isBlank(dto.getName())) {
            throw new CustomerException(ResultCode.UPDATE_USER_ERROR, "昵称不能为空或空格");
        }

        // 去空格：去除首尾空格 + 内部所有空白字符
        String name = StrUtil.trim(dto.getName()).replaceAll("\\s+", "");
        if (name.length() > 12) {
            throw new CustomerException(ResultCode.UPDATE_USER_ERROR, "昵称长度不能超过12");
        }

        // 不能包含特殊字符（只允许：中文 + 英文 + 数字）
        if (!ReUtil.isMatch("^[\\u4e00-\\u9fa5a-zA-Z0-9_]+$", name)) {
            throw new CustomerException(ResultCode.UPDATE_USER_ERROR, "昵称不能包含特殊字符，仅支持中文、英文、数字");
        }

        // 个性签名校验
        if (StrUtil.isNotBlank(dto.getSignature())) {
            String  signature = StrUtil.trim(dto.getSignature());
            if (signature.length() > 100) {
                throw new CustomerException(ResultCode.UPDATE_USER_ERROR, "个性签名长度不能超过100");
            }
        }


        // 最终要保存的头像（默认使用前端传的）
        String finalAvatar = dto.getAvatar();

        // 头像迁移
        if (dto.getAvatar() != null && dto.getAvatar().contains("/temp/")) {
            try {
                // 1. 截取文件名
                String fileName = dto.getAvatar().substring(dto.getAvatar().lastIndexOf("/") + 1);

                // 2. 源路径 & 目标路径
                Path tempPath = Paths.get(uploadPath + "temp/" + fileName);
                Path destPath = Paths.get(uploadPath + "avatars/" + fileName);

                // 3. 确保目标目录存在
                Files.createDirectories(destPath.getParent());

                // 4. 真正移动（replaceExisting = 覆盖）
                Files.move(tempPath, destPath, StandardCopyOption.REPLACE_EXISTING);

                // 5. 拼接完整可访问地址
                finalAvatar = baseUrl + "/upload/avatars/" + fileName;

                // 删除旧头像
                if (oldUser.getAvatar() != null) {
                    try {
                        String oldFileName = oldUser.getAvatar().substring(oldUser.getAvatar().lastIndexOf("/") + 1);
                        Path oldPath = Paths.get(uploadPath + "avatars/" + oldFileName);
                        Files.deleteIfExists(oldPath);
                    } catch (Exception ignored) {}
                }

            } catch (Exception e) {
                e.printStackTrace();
                throw new CustomerException(ResultCode.SERVER_ERROR, "头像保存失败（移动失败）");
            }
        }

        // 组装对象
        User updateUser = new User();
        updateUser.setId(userId);
        updateUser.setName(dto.getName());
        updateUser.setSignature(dto.getSignature());
        updateUser.setGender(dto.getGender());
        updateUser.setBirthday(dto.getBirthday());
        updateUser.setAvatar(finalAvatar); // 这里存新路径！

        // 更新数据库
        int rows = userMapper.updateById(updateUser);
        if(rows != 1){
            throw new CustomerException(ResultCode.SERVER_ERROR, "操作失败");
        }
    }


    public Result<String> updatePassword(EncryptDataDTO encryptedDto){
        //解密
        String json = rsaUtil.decrypt(encryptedDto.getEncryptedData());
        if (json == null) {
            throw new CustomerException(ResultCode.RSA_DECRYPT_ERROR, "解密失败");
        }
        //DTO
        PasswordDTO dto;
        try {
            dto = objectMapper.readValue(json, PasswordDTO.class);
        } catch (Exception e) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "参数格式错误");
        }

        String oldPassword = dto.getOldPassword();
        String newPassword = dto.getNewPassword();
        String confirmPassword = dto.getConfirmPassword();

        // 1. 旧密码不能为空
        if (StrUtil.isBlank(oldPassword)) {
            throw new CustomerException(ResultCode.UPDATE_PASSWORD_ERROR, "请输入当前密码");
        }

        // 2. 新密码不能为空
        if (StrUtil.isBlank(newPassword)) {
            throw new CustomerException(ResultCode.UPDATE_PASSWORD_ERROR, "请输入新密码");
        }

        // 3. 新密码长度 >=6
        if (newPassword.length() < 6) {
            throw new CustomerException(ResultCode.UPDATE_PASSWORD_ERROR, "新密码至少 6 位");
        }

        // 4. 新密码长度 <=32
        if (newPassword.length() > 32) {
            throw new CustomerException(ResultCode.UPDATE_PASSWORD_ERROR, "新密码不超过32位");
        }

        // 5. 两次密码不一致
        if (!newPassword.equals(confirmPassword)) {
            throw new CustomerException(ResultCode.UPDATE_PASSWORD_ERROR, "两次输入的新密码不一致");
        }

        // 6. 新密码不能与原密码相同
        if (oldPassword.equals(newPassword)) {
            throw new CustomerException(ResultCode.UPDATE_PASSWORD_ERROR, "新密码不能与原密码相同");
        }
        Long userId = LoginUserHolder.getUserId();
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new CustomerException(ResultCode.UPDATE_PASSWORD_ERROR, "用户不存在");
        }
        if (!BCrypt.checkpw(oldPassword, user.getPassword())) {
            throw new CustomerException(ResultCode.UPDATE_PASSWORD_ERROR, "原密码不正确");
        }

        String encodeNewPwd = BCrypt.hashpw(newPassword, BCrypt.gensalt());

        // 只更新密码，安全！
        int rows = userMapper.updatePasswordAndVersion(userId, encodeNewPwd);
        if(rows != 1){
            throw new CustomerException(ResultCode.SERVER_ERROR, "操作失败");
        }
        UserTokenVersionCache.removeVersion(userId);
        return Result.success("密码修改成功");
    }

    /**
     * 自助注销（不可逆）。
     * <p>
     * 这是《个人信息保护法》第 47 条「删除权」在站内的落地：用户不需要写邮件、
     * 不需要等管理员审批，验一次密码就能自己删。做成审批制反而会踩到
     * 「注销需人工审核且长期不处理」那条通报项。
     * <p>
     * 真正动手的是 {@link UserMapper#deactivate}，这里只负责三件事：
     * ① 拦住管理员（否则站点可能失去全部管理入口）；
     * ② 验密码（token 只能证明「这台设备登录过」，不能证明是本人）；
     * ③ 把两个缓存清掉（不清的话旧 token 还能继续用，等于没注销）。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deactivate(String encryptedData) {
        Long userId = LoginUserHolder.getUserId();
        if (userId == null) {
            throw new CustomerException(ResultCode.AUTHOR_ERROR, "请先登录");
        }
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "账号不存在");
        }
        if (user.getDeletedAt() != null) {
            // 正常流程走不到：注销那一刻 token 就作废了。留着是为了防并发重复提交
            throw new CustomerException(ResultCode.PARAM_ERROR, "该账号已注销");
        }

        // 管理员护栏放在验密码之前：这是「你这个账号类型就不允许」，
        // 跟密码对不对无关，先验密码会让人误以为输对就能删。
        List<String> perms = rolePermissionMapper.selectPermissionsByUserId(userId);
        if (perms != null && perms.contains(MANAGE_PERMISSION)) {
            throw new CustomerException(ResultCode.NO_PERMISSION,
                    "管理员账号不能自助注销；如确需删除，请先由其他管理员收回「用户管理」权限");
        }

        String password = decryptOldPassword(encryptedData);
        if (!BCrypt.checkpw(password, user.getPassword())) {
            throw new CustomerException(ResultCode.UPDATE_PASSWORD_ERROR, "密码不正确");
        }

        // 占位密码：随机 UUID 的哈希，谁都不知道，登录时表现为「密码不对」。
        // 不能置空串 —— BCrypt.checkpw 遇到非法哈希会抛异常，变成 500。
        String placeholder = BCrypt.hashpw(UUID.randomUUID().toString(), BCrypt.gensalt());
        int rows = userMapper.deactivate(userId, placeholder);
        if (rows != 1) {
            throw new CustomerException(ResultCode.SERVER_ERROR, "注销失败，请稍后重试");
        }

        // 🔴 两个缓存都必须清：
        //   UserTokenVersionCache 命中时**不查库**，留着旧版本号等于旧 token 继续有效；
        //   PermissionCache 同理，会话期间不会重新查权限。
        UserTokenVersionCache.removeVersion(userId);
        PermissionCache.remove(userId);

        log.warn("[deactivate] 用户 {}（原昵称 {}）已自助注销，邮箱等信息已清空", userId, user.getName());
    }

    /**
     * 从 RSA 密文里取出当前密码（注销 / 改密共用同一套前端加密格式）。
     * <p>
     * 和 {@code UserVerifyServiceImpl#checkPassword} 是同源逻辑，区别是这里
     * 只解不比对 —— 调用方拿到明文自己决定用哪个错误码。
     */
    private String decryptOldPassword(String encryptedData) {
        if (StrUtil.isBlank(encryptedData)) {
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
        return password;
    }




    @Override
    public UserProfileVO getPublicProfile(Long userId) {
        if (userId == null || userId <= 0) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "用户不存在");
        }
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "用户不存在");
        }

        UserProfileVO vo = new UserProfileVO();
        vo.setId(user.getId());
        vo.setName(user.getName());
        vo.setNameColor(user.getNameColor());
        vo.setRoleColor(user.getRoleColor());
        vo.setPrimaryRole(user.getPrimaryRole());
        vo.setAvatar(user.getAvatar());
        vo.setBadge(user.getBadge());
        vo.setOrnament(user.getOrnament());
        vo.setSignature(user.getSignature());
        vo.setCreateTime(user.getCreateTime());

        Long count = postMapper.countByUserId(userId);
        vo.setPostCount(count == null ? 0L : count);
        return vo;
    }

    /**
     * 抽取：User → UserBO 转换方法
     */
    private UserBO convertToUserBO(User user) {        UserBO userBO = new UserBO();

        userBO.setId(user.getId());
        userBO.setUsername(user.getUsername());
        userBO.setName(user.getName());
        userBO.setNameColor(user.getNameColor());
        userBO.setRoleColor(user.getRoleColor());
        userBO.setPrimaryRole(user.getPrimaryRole());
        userBO.setAvatar(user.getAvatar());
        userBO.setBadge(user.getBadge());
        userBO.setOrnament(user.getOrnament());
        userBO.setBirthday(user.getBirthday());
        userBO.setEmail(user.getEmail());
        userBO.setGender(user.getGender());
        userBO.setPhone(user.getPhone());
        userBO.setSignature(user.getSignature());
        userBO.setTokenVersion(user.getTokenVersion());
        userBO.setStatus(user.getStatus() == null ? BanLevel.NORMAL : user.getStatus());
        userBO.setBanUntil(user.getBanUntil());
        userBO.setBanReason(user.getBanReason());
        userBO.setEmailVerified(user.getEmailVerified() == null || user.getEmailVerified() == 1);
        return userBO;
    }
}