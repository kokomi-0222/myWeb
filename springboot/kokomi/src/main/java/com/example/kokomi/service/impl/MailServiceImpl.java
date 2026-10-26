package com.example.kokomi.service.impl;

import java.io.UnsupportedEncodingException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import com.example.kokomi.common.ResultCode;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.service.MailService;

import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * 邮件发送实现：走 Spring 的 JavaMailSender（QQ / 163 的 SMTP 都是 ssl 465）。
 *
 * 凭据一律从配置读，不写在代码里：
 *   spring.mail.username / spring.mail.password
 * 本地写在 gitignored 的 config/application-local.yaml，线上由 systemd 的
 * Environment= 注入（MAIL_USERNAME / MAIL_PASSWORD）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MailServiceImpl implements MailService {

    private final JavaMailSender mailSender;

    @Value("${spring.mail.username:}")
    private String username;

    @Value("${spring.mail.password:}")
    private String password;

    @Value("${app.mail.from-name:心海的小窝}")
    private String fromName;

    @Override
    public boolean isConfigured() {
        return username != null && !username.isBlank()
                && password != null && !password.isBlank();
    }

    @Override
    public void sendVerifyCode(String to, String code, int minutes) {
        if (!isConfigured()) {
            // 不抛异常：本地没配 SMTP 时，验证码已经在 UserVerifyService 里打到日志了，
            // 这里只需要不阻塞流程（线上漏配会在启动时打 ERROR，见 UserVerifyServiceImpl）
            log.warn("[mail] SMTP 未配置，跳过发送。to={} code={}", to, code);
            return;
        }

        String subject = "【心海的小窝】邮箱验证码 " + code;
        String text = "你的验证码是 " + code + "，" + minutes + " 分钟内有效。\n"
                + "如果这不是你本人的操作，忽略本邮件即可，你的账号不会有任何变化。";

        String html = """
                <div style="padding:24px;background:#f7f8fa;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;">
                  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px 28px 24px;">
                    <div style="font-size:15px;font-weight:600;color:#18191c;">心海的小窝</div>
                    <div style="margin-top:18px;font-size:14px;color:#333;line-height:1.7;">
                      你正在验证这个邮箱，验证码是：
                    </div>
                    <div style="margin:16px 0;font-size:30px;font-weight:700;letter-spacing:8px;color:#00aeec;">
                      %s
                    </div>
                    <div style="font-size:13px;color:#858585;line-height:1.7;">
                      验证码 %d 分钟内有效，只能使用一次。<br/>
                      如果这不是你本人的操作，忽略本邮件即可，账号不会有任何变化。
                    </div>
                  </div>
                  <div style="max-width:480px;margin:12px auto 0;text-align:center;font-size:12px;color:#a0a0a0;">
                    本邮件由系统自动发送，请勿直接回复。
                  </div>
                </div>
                """.formatted(code, minutes);

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            // QQ 邮箱会校验 From 必须等于登录账号，别自己改
            helper.setFrom(new InternetAddress(username, fromName, "UTF-8"));
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(text, html);
            mailSender.send(message);
            log.info("[mail] 验证码已发送 to={}", to);
        } catch (MailException | jakarta.mail.MessagingException | UnsupportedEncodingException e) {
            log.error("[mail] 验证码发送失败 to={}", to, e);
            throw new CustomerException(ResultCode.SERVER_ERROR, "验证码发送失败，请稍后重试");
        }
    }
}
