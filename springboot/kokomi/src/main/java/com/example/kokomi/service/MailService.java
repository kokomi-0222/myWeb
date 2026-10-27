package com.example.kokomi.service;

/**
 * 邮件发送：目前两种用途 —— 绑定邮箱的验证码、找回密码的重置验证码。
 */
public interface MailService {

    /** SMTP 是否配置齐全（账号 + 密码/授权码）。没配时只能走开发模式，把码打到日志里 */
    boolean isConfigured();

    /**
     * 发送验证码邮件。
     * 发信失败会抛业务异常，由调用方决定要不要把「请稍后重试」透给用户。
     */
    void sendVerifyCode(String to, String code, int minutes);

    /**
     * 发送「重置密码」验证码。
     * 和 {@link #sendVerifyCode} 分开是因为邮件标题/正文不同 ——
     * 用户收到两封时全靠标题分辨该填哪个码。
     */
    void sendResetCode(String to, String code, int minutes);
}
