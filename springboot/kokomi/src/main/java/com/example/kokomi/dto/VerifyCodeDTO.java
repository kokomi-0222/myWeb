package com.example.kokomi.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/** 提交邮箱验证码 */
@Data
public class VerifyCodeDTO {

    /**
     * 要绑定的邮箱。注册不再收邮箱了，所以新用户第一次绑定必须带上；
     * 老账号（注册时留了邮箱的）可以不传，后端会退回用账号上已经存的那个。
     */
    private String email;

    @NotBlank(message = "请输入验证码")
    private String code;
}
