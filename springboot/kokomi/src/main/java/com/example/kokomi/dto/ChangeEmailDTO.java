package com.example.kokomi.dto;

import lombok.Data;

/**
 * 换绑邮箱第一步的请求体。
 * <p>
 * 密码走和「修改密码」同一套 RSA（{@code encryptedData} 解出来是
 * {@code {"oldPassword": "..."}}），前端不需要为换绑单独写一套加密逻辑。
 * <p>
 * 图形验证码两项必填，和 {@link VerifySendDTO} 同一条理由：这一步会真的发一封邮件。
 */
@Data
public class ChangeEmailDTO {
    /** 要换绑到的新邮箱 */
    private String email;
    /** RSA 加密后的 {"oldPassword": "当前密码"} */
    private String encryptedData;
    /** 图形验证码的 key（GET /captcha 拿到的 captchaKey） */
    private String captchaKey;
    /** 用户看图输入的字符 */
    private String captchaCode;
}
