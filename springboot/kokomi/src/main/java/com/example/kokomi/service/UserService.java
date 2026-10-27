package com.example.kokomi.service;

import com.example.kokomi.bo.UserBO;
import com.example.kokomi.common.Result;
import com.example.kokomi.dto.EncryptDataDTO;
import com.example.kokomi.dto.RegisterFormDTO;
import com.example.kokomi.dto.UserUpdateDTO;

public interface UserService {
    /**
     * 登录接口
     */
    UserBO login(EncryptDataDTO dto);
    /**
     * 注册第 2 步：凭第 1 步拿到的 ticket 建号。
     * <p>
     * 邮箱只从 ticket 里取（不看请求体），建号时就是 `email_verified = 1`，
     * 成功后**直接返回 token**（注册即登录）—— 邮箱都验证过了，账号归属已经确认，
     * 再让用户输一遍密码纯属浪费。
     */
    Result<com.example.kokomi.vo.LoginVO> register(RegisterFormDTO dto);
    /**
    * 获取用户信息
    */
    UserBO findById(Long userId);
    /**
     * 更新用户信息
     */
    void updateUserInfo(UserUpdateDTO dto);

    /**
     * 修改密码
     */
    Result<String> updatePassword(EncryptDataDTO dto);

    /**
     * 获取指定用户的公开主页信息（任何人可访问，不含邮箱/手机号等隐私字段）
     */
    com.example.kokomi.vo.UserProfileVO getPublicProfile(Long userId);
}