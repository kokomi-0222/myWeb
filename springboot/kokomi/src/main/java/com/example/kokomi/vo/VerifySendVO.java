package com.example.kokomi.vo;

import lombok.Data;

/**
 * 「发送验证码」的返回。
 *
 * 注意 sent / retryAfter 的用法：被频控挡住时**不是错误**（HTTP 层仍是 200），
 * 而是 sent=false + message + retryAfter，前端据此显示倒计时即可，
 * 不用把「刚发过」当成异常去弹红色提示。
 */
@Data
public class VerifySendVO {

    /** 是否真的发出去了 */
    private Boolean sent;

    /** 打码后的邮箱，例如 a***@qq.com */
    private String email;

    /** 给用户看的文案 */
    private String message;

    /** 距离可以重发还有几秒（0 = 现在就能重发） */
    private Integer retryAfter;

    /**
     * 明文验证码，**只在本地开发**返回：
     * 条件是「SMTP 没配」且 app.mail.dev-echo=true。线上不配 SMTP 时这里永远是 null，
     * 验证码只出现在服务器日志里。
     */
    private String devCode;
}
