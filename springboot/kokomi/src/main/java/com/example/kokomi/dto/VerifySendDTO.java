package com.example.kokomi.dto;

import lombok.Data;

/**
 * 请求发送邮箱验证码。
 * email 可以不传：老账号（注册时带邮箱的）会退回用账号上已有的邮箱。
 */
@Data
public class VerifySendDTO {
    private String email;
}
