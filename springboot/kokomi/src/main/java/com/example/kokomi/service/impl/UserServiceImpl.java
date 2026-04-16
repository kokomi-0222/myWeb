package com.example.kokomi.service.impl;

import com.example.kokomi.bo.UserBO;
import com.example.kokomi.common.ResultCode;
import com.example.kokomi.dto.LoginDto;
import com.example.kokomi.entity.User;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.mapper.UserMapper;
import com.example.kokomi.service.UserService;
import com.example.kokomi.util.JwtUtil;
import com.example.kokomi.vo.UserInfoVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private final UserMapper userMapper;

    @Override
    public UserBO login(LoginDto loginDto) {
        // 1. 查询用户
        User user = userMapper.selectByAccount(loginDto.getAccount());
        if (user == null) {
            throw new CustomerException(ResultCode.LOGIN_ERROR, "账号或密码不正确");
        }

        // 2. 校验密码
        if (!user.getPassword().equals(loginDto.getPassword())) {
            throw new CustomerException(ResultCode.LOGIN_ERROR, "账号或密码不正确");
        }

        // 3. 转换 + 赋值角色权限
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