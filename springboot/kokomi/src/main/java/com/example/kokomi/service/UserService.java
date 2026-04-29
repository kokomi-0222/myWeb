package com.example.kokomi.service;

import com.example.kokomi.bo.UserBO;
import com.example.kokomi.dto.LoginEncryptDTO;
import com.example.kokomi.dto.UserUpdateDTO;

public interface UserService {
    /**
     * 登录接口
     */
    UserBO login(LoginEncryptDTO dto);
    /**
    * 获取用户信息
    */
    UserBO findById(Long userId);
    /**
     * 更新用户信息
     */
    void updateUserInfo(UserUpdateDTO dto);
}