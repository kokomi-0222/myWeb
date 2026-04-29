package com.example.kokomi.service.impl;

import com.example.kokomi.bo.UserBO;
import com.example.kokomi.common.ResultCode;
import com.example.kokomi.dto.LoginDTO;
import com.example.kokomi.dto.LoginEncryptDTO;
import com.example.kokomi.dto.UserUpdateDTO;
import com.example.kokomi.entity.User;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.mapper.UserMapper;
import com.example.kokomi.service.UserService;
import com.example.kokomi.util.LoginUserHolder;
import com.example.kokomi.util.RsaUtil;
import lombok.RequiredArgsConstructor;
import org.mindrot.jbcrypt.BCrypt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;

@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private final UserMapper userMapper;
    private final RsaUtil rsaUtil;
    private final ObjectMapper objectMapper;


    @Override
    public UserBO login(LoginEncryptDTO encryptedDto) {

        //解密
        String json = rsaUtil.decrypt(encryptedDto.getEncryptedData());
        if (json == null) {
            throw new CustomerException(ResultCode.LOGIN_ERROR, "解密失败");
        }
        //DTO
        LoginDTO dto;
        try {
            dto = objectMapper.readValue(json, LoginDTO.class);
        } catch (Exception e) {
            throw new CustomerException(ResultCode.LOGIN_ERROR, "参数格式错误");
        }
        //System.out.println(dto);

        // 查询用户
        User user = userMapper.selectByAccount(dto.getAccount());
        if (user == null) {
            throw new CustomerException(ResultCode.LOGIN_ERROR, "账号或密码不正确");
        }
        // 校验密码 String password = BCrypt.hashpw(原始明文密码, BCrypt.gensalt());
        if (BCrypt.checkpw(dto.getPassword(), user.getPassword())) {
            throw new CustomerException(ResultCode.LOGIN_ERROR, "账号或密码不正确");
        }
        //转换 + 赋值角色权限
        UserBO userBO = convertToUserBO(user);
        userBO.setRoles(userMapper.selectRolesByUserId(user.getId()));
        userBO.setPermissions(userMapper.selectPermissionsByUserId(user.getId()));

        return userBO;
    }

    @Override
    public UserBO findById(Long userId) {
        // 1. 根据ID查询用户
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new CustomerException(401, "用户不存在");
        }

        UserBO userBO = convertToUserBO(user);
        userBO.setRoles(userMapper.selectRolesByUserId(user.getId()));
        userBO.setPermissions(userMapper.selectPermissionsByUserId(user.getId()));
        return userBO;
    }

    @Override
    @Transactional
    public void updateUserInfo(UserUpdateDTO dto) {
        Long userId = LoginUserHolder.getUserId();
        User oldUser = userMapper.selectById(userId);

        if (oldUser == null) {
            throw new CustomerException(400, "用户不存在");
        }

        // 最终要保存的头像（默认使用前端传的）
        String finalAvatar = dto.getAvatar();

        // 头像迁移
        if (dto.getAvatar() != null && dto.getAvatar().contains("/temp/")) {
            try {
                // 1. 截取文件名
                String fileName = dto.getAvatar().substring(dto.getAvatar().lastIndexOf("/") + 1);
                String projectPath = System.getProperty("user.dir");

                // 2. 源路径 & 目标路径
                Path tempPath = Paths.get(projectPath + "/upload/temp/" + fileName);
                Path destPath = Paths.get(projectPath + "/upload/images/" + fileName);

                // 3. 确保目标目录存在
                Files.createDirectories(destPath.getParent());

                // 4. 真正移动（replaceExisting = 覆盖）
                Files.move(tempPath, destPath, StandardCopyOption.REPLACE_EXISTING);

                // 5. 拼接完整可访问地址（前端直接显示！）
                finalAvatar = "http://localhost:8080/upload/images/" + fileName;

                // ==========================
                // 删除旧头像
                // ==========================
                if (oldUser.getAvatar() != null) {
                    try {
                        String oldFileName = oldUser.getAvatar().substring(oldUser.getAvatar().lastIndexOf("/") + 1);
                        Path oldPath = Paths.get(projectPath + "/upload/images/" + oldFileName);
                        Files.deleteIfExists(oldPath);
                    } catch (Exception ignored) {}
                }

            } catch (Exception e) {
                e.printStackTrace();
                throw new CustomerException(500, "头像保存失败（移动失败）");
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
        userMapper.updateById(updateUser);
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

        return userBO;
    }
}