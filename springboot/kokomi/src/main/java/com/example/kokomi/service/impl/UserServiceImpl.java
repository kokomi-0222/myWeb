package com.example.kokomi.service.impl;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;

import org.mindrot.jbcrypt.BCrypt;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.kokomi.bo.UserBO;
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
import com.example.kokomi.mapper.UserMapper;
import com.example.kokomi.mapper.UserRoleMapper;
import com.example.kokomi.service.UserService;
import com.example.kokomi.util.CaptchaCache;
import com.example.kokomi.util.LoginUserHolder;
import com.example.kokomi.util.PermissionCache;
import com.example.kokomi.util.RsaUtil;
import com.example.kokomi.util.UserTokenVersionCache;

import cn.hutool.core.lang.RegexPool;
import cn.hutool.core.lang.Validator;
import cn.hutool.core.util.ReUtil;
import cn.hutool.core.util.StrUtil;
import lombok.RequiredArgsConstructor;
import tools.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private final UserMapper userMapper;
    private final UserRoleMapper userRoleMapper;
    private final RolePermissionMapper rolePermissionMapper;
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
    public Result<Void> register(EncryptDataDTO encryptedDto){
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

        // 账号必须是 邮箱 OR 手机号
        boolean isEmail = Validator.isEmail(account);
        boolean isPhone = Validator.isMobile(account);
        if (!isEmail && !isPhone) {
            throw new CustomerException(ResultCode.REGISTER_ERROR, "账号必须是手机号或邮箱");
        }

        // 账号是否已注册
        User exist = userMapper.selectByAccount(account);
        if (exist != null) {
            throw new CustomerException(ResultCode.REGISTER_ERROR, "该账号已被注册");
        }

        // 密码加密
        String encodePwd = BCrypt.hashpw(password, BCrypt.gensalt());

        // 入库
        User user = new User();
        user.setPassword(encodePwd);
        if (isEmail) user.setEmail(account);
        if (isPhone) user.setPhone(account);
        user.setPrimaryRole("member");
        user.setNameColor("#18191c");
        // 插入后自动获取自增 ID
        int rows = userMapper.insert(user);
        if(rows != 1){
            throw new CustomerException(ResultCode.REGISTER_ERROR, "用户创建失败");
        }
        // 生成 kokomi_00001 格式用户名
        Long userId = user.getId();
        String username = String.format("kokomi_%05d", userId);
        // 设置用户名 & 昵称
        user.setUsername(username);
        user.setName(username);
        // 更新信息
        rows = userMapper.updateUsernameAndName(user);
        if (rows != 1) {
            throw new CustomerException(ResultCode.REGISTER_ERROR, "操作失败");
        }
        return Result.success();
    }

    @Override
    public UserBO findById(Long userId) {
        // 1. 根据ID查询用户
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new CustomerException(ResultCode.REGISTER_ERROR, "用户不存在");
        }

        UserBO userBO = convertToUserBO(user);
        userBO.setRoles(userRoleMapper.selectRolesByUserId(user.getId()));
        userBO.setPermissions(rolePermissionMapper.selectPermissionsByUserId(user.getId()));
        return userBO;
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
     * 抽取：User → UserBO 转换方法
     */
    private UserBO convertToUserBO(User user) {
        UserBO userBO = new UserBO();

        userBO.setId(user.getId());
        userBO.setUsername(user.getUsername());
        userBO.setName(user.getName());
        userBO.setNameColor(user.getNameColor());
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
        return userBO;
    }
}