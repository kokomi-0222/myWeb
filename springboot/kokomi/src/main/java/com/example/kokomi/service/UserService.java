package com.example.kokomi.service;

import com.example.kokomi.bo.UserBO;
import com.example.kokomi.dto.LoginDto;

public interface UserService {
    /**
     * 登录接口
     */
    UserBO login(LoginDto loginDto);
}