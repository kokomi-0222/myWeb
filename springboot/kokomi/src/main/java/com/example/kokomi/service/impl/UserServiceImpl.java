package com.example.kokomi.service.impl;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;

import org.mindrot.jbcrypt.BCrypt;
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
import com.example.kokomi.dto.UserUpdateDTO;
import com.example.kokomi.entity.User;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.mapper.RolePermissionMapper;
import com.example.kokomi.mapper.PostMapper;
import com.example.kokomi.mapper.UserMapper;
import com.example.kokomi.mapper.UserRoleMapper;
import com.example.kokomi.service.UserService;
import com.example.kokomi.vo.UserProfileVO;
import com.example.kokomi.util.CaptchaCache;
import com.example.kokomi.util.IpUtils;
import com.example.kokomi.util.RegisterRateLimit;
import com.example.kokomi.util.LoginUserHolder;
import com.example.kokomi.util.PermissionCache;
import com.example.kokomi.util.RsaUtil;
import com.example.kokomi.util.UserTokenVersionCache;

import cn.hutool.core.lang.RegexPool;
import cn.hutool.core.util.ReUtil;
import cn.hutool.core.util.StrUtil;
import lombok.RequiredArgsConstructor;
import tools.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    /**
     * 新注册用户的默认角色编码 = 游客。
     * <p>
     * 站内是三级：guest（游客）→ member（普通用户）→ vip（会员）。
     * <ul>
     *   <li>guest：能登录、浏览、点赞，不能发帖也不能评论；</li>
     *   <li>绑定并验证邮箱后由 UserVerifyServiceImpl 自动升成 member：能评论，仍不能发帖；</li>
     *   <li>vip 由管理员在后台授予：能发帖。</li>
     * </ul>
     * 发帖 / 评论分别校验 post:create 与 comment:create（见 sql_tier_permission.sql），
     * 权限码挂在角色上，所以「谁能干什么」全在数据库里，改规则不用改代码。
     * <p>
     * 注册时会同时写入 user 的 primary_role（身份标签）和 user_role（鉴权用）两处：
     * 前者只负责显示，后者才是权限链路的起点。只写前者的话，
     * /user/info 的 permissions 会是空数组、后台用户管理页会显示「无角色」。
     */
    private static final String DEFAULT_ROLE = "guest";

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
    public Result<Void> register(EncryptDataDTO encryptedDto){
        // 注册频率兜底：正常用户碰不到（同 IP 20 个/小时），脚本刷号才会撞上。
        // 内容质量靠等级挡（游客既不能发帖也不能评论），这一层只挡「把 user 表刷爆」。
        if (!RegisterRateLimit.tryAcquire(IpUtils.getCurrentIP())) {
            throw new CustomerException(ResultCode.REGISTER_ERROR, "注册太频繁，请稍后再试");
        }

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
        RegisterDTO dto;
        try {
            dto = objectMapper.readValue(json, RegisterDTO.class);
        } catch (Exception e) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "参数格式错误");
        }

        if (StrUtil.hasBlank(dto.getAccount(), dto.getPassword(), dto.getConfirmPassword())) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "账号、密码、确认密码不能为空");
        }

        String account = StrUtil.trim(dto.getAccount());
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

        // 用户名规则：2~20 位，字母 / 数字 / 下划线 / 中文。
        // 不再要求是邮箱 —— 邮箱改成注册之后在空间页「绑定」，绑完才从游客升成普通用户。
        // 不收 @ 也顺便避免了「用户名长得像邮箱」和账号查找（username/phone/email 三选一）打架。
        if (account.length() < 2 || account.length() > 20) {
            throw new CustomerException(ResultCode.REGISTER_ERROR, "用户名需要 2~20 个字符");
        }
        if (!ReUtil.isMatch("^[\\u4e00-\\u9fa5A-Za-z0-9_]+$", account)) {
            throw new CustomerException(ResultCode.REGISTER_ERROR, "用户名只能包含中文、字母、数字和下划线");
        }

        // 账号是否已注册（selectByAccount 同时匹配 username / phone / email，够用）
        User exist = userMapper.selectByAccount(account);
        if (exist != null) {
            throw new CustomerException(ResultCode.REGISTER_ERROR, "该用户名已被使用");
        }

        // 密码加密
        String encodePwd = BCrypt.hashpw(password, BCrypt.gensalt());

        // 入库。email 留空、email_verified 走默认值 0 —— 此时是纯游客：
        // 能登录能浏览能点赞，发帖和评论都会被拦（509 / 507）。
        User user = new User();
        user.setPassword(encodePwd);
        user.setPrimaryRole(DEFAULT_ROLE);
        user.setNameColor("#18191c");
        // 插入后自动获取自增 ID
        int rows = userMapper.insert(user);
        if(rows != 1){
            throw new CustomerException(ResultCode.REGISTER_ERROR, "用户创建失败");
        }
        Long userId = user.getId();
        // 用户名即昵称，用户可以之后在「个人信息」里改昵称，用户名保持不变
        user.setUsername(account);
        user.setName(account);
        rows = userMapper.updateUsernameAndName(user);
        if (rows != 1) {
            throw new CustomerException(ResultCode.REGISTER_ERROR, "操作失败");
        }

        // 挂上默认角色：user_role 是权限链路的起点，
        // 不写这一条的话，新用户的 permissions 永远是空数组
        userRoleMapper.insertUserRole(userId, DEFAULT_ROLE);

        return Result.success();
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