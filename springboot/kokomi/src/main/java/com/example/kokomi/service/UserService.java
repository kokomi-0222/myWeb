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

    /**
     * 修改密码
     */
    Result<String> updatePassword(EncryptDataDTO dto);

    /**
     * 获取指定用户的公开主页信息（任何人可访问，不含邮箱/手机号等隐私字段）
     */
    com.example.kokomi.vo.UserProfileVO getPublicProfile(Long userId);
}