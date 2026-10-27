package com.example.kokomi.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 用邮箱验证码重置密码（免登录）。
 * <p>
 * 密码本身走 RSA：{@code encryptedData} 解密后是 {@code {newPassword, confirmPassword}}，
 * 和 /user/password 用的是同一套加密，前端不用为它另写一份。
 */
@Data
public class ResetPasswordDTO {

    @NotBlank(message = "请输入邮箱")
    private String email;

    @NotBlank(message = "请输入验证码")
    private String code;

    @NotBlank(message = "参数错误")
    private String encryptedData;
}
