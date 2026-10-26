package com.example.kokomi.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/** 提交邮箱验证码 */
@Data
public class VerifyCodeDTO {

    @NotBlank(message = "请输入验证码")
    private String code;
}
