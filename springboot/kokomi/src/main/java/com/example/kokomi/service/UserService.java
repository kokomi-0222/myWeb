package com.example.kokomi.service;

import com.example.kokomi.bo.UserBO;
import com.example.kokomi.common.Result;
import com.example.kokomi.dto.EncryptDataDTO;
import com.example.kokomi.dto.UserUpdateDTO;

public interface UserService {
    /**
     * 登录接口
     */
    UserBO login(EncryptDataDTO dto);
    /**
     *注册接口
     */
    Result<Void> register(EncryptDataDTO dto);
    /**
    * 获取用户信息
    */
    UserBO findById(Long userId);
    /**
     * 更新用户信息
     */
    void updateUserInfo(UserUpdateDTO dto);
}