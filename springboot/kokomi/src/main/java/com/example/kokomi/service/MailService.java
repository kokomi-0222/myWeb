package com.example.kokomi.service;

/**
 * 邮件发送（目前只有「注册后的邮箱验证码」这一种用途）。
 */
public interface MailService {

    /** SMTP 是否配置齐全（账号 + 密码/授权码）。没配时只能走开发模式，把码打到日志里 */
    boolean isConfigured();

    /**
     * 发送验证码邮件。
     * 发信失败会抛业务异常，由调用方决定要不要把「请稍后重试」透给用户。
     */
    void sendVerifyCode(String to, String code, int minutes);
}
