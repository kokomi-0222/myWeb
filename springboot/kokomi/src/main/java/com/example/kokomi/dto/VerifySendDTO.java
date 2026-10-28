package com.example.kokomi.dto;

import lombok.Data;

/**
 * 请求发送邮箱验证码。
 * email 可以不传：老账号（注册时带邮箱的）会退回用账号上已有的邮箱。
 *
 * <p>图形验证码两项是**必填**的：发码就是「让服务器替这个请求发一封信」，
 * 没有这道人机校验，一个脚本可以用几百个邮箱把 SMTP 配额打空，
 * 结果是正常用户谁也收不到信。校验见 {@code UserController#requireCaptcha}。
 */
@Data
public class VerifySendDTO {
    private String email;
    /** 图形验证码的 key（GET /captcha 拿到的 captchaKey） */
    private String captchaKey;
    /** 用户看图输入的字符 */
    private String captchaCode;
}
