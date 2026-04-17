package com.example.kokomi.service;

import com.example.kokomi.bo.UserBO;
import com.example.kokomi.dto.LoginDto;
import com.example.kokomi.dto.UserUpdateDto;
import com.example.kokomi.vo.UserInfoVO;

public interface UserService {
    /**
     * 登录接口
     */
    UserBO login(LoginDto loginDto);
    /**
    * 获取用户信息
    */
    UserBO findById(Long userId);
    /**
     * 更新用户信息
     */
    void updateUserInfo(UserUpdateDto dto);
}