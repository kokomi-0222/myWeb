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

    /**
     * 自助注销当前账号（不可逆）。
     * <p>
     * 用户本人的删除权，入口在「个人中心 → 账号管理 → 危险区域」。
     * 必须再验一次登录密码 —— 注销是全站唯一不可逆的操作，
     * 光有 token 不足以证明是本人（电脑没锁屏、token 泄露都会替你点下去）。
     * <p>
     * 注销后：邮箱/手机/生日/签名/头像等个人信息全部清空，用户名释放，
     * 密码换成随机串，所有设备上的登录立即失效；帖子与评论保留，
     * 作者显示为「已注销用户」，用来维持已有讨论的完整性。
     * <p>
     * 持 {@code user:manage} 的账号不允许自助注销 —— 否则最后一个管理员
     * 把自己注销掉，整个站就再也没人能进后台了。
     *
     * @param encryptedData RSA 加密的 {@code {"oldPassword": "..."}}
     */
    void deactivate(String encryptedData);
}