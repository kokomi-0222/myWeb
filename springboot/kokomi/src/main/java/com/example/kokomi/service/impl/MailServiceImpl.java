package com.example.kokomi.service.impl;

import java.io.UnsupportedEncodingException;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import com.example.kokomi.common.ResultCode;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.service.MailService;

import jakarta.mail.MessagingException;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * 邮件发送实现：走 Spring 的 JavaMailSender（阿里云邮件推送 DirectMail 的 SMTP）。
 *
 * <p>DirectMail 的「Java SDK」文档其实就是标准 JavaMail 的 Session + Transport.send，
 * 没有额外的阿里云 Java 包；所以这里继续用 Spring 的封装，底层是 jakarta.mail。
 * <b>不要</b>按文档引 {@code com.sun.mail:javax.mail}：那是 javax 包名，和 Spring Boot 4
 * 的 jakarta.mail 会冲突。
 *
 * <p>阿里云和 QQ 邮箱的差异，都在下面处理掉了：
 * <ul>
 *   <li>信封发件人（SMTP MAIL FROM）必须等于控制台创建的发信地址 —— 配置里
 *       {@code mail.smtp.from} 跟随 {@code spring.mail.username}；</li>
 *   <li>Message-ID 建议用自家发信域生成，否则 JavaMail 默认拿本机 hostname
 *       （ECS 就是一串 iZxxx 机器名，没有点），容易被判垃圾 —— 见 {@link DomainMimeMessage}。</li>
 * </ul>
 *
 * 凭据一律从配置读，不写在代码里：
 *   spring.mail.username / spring.mail.password（阿里云的 SMTP 密码）
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
        send(to, code, minutes,
                "【心海的小窝】邮箱验证码 " + code,
                "你正在验证这个邮箱，验证码是：",
                "如果这不是你本人的操作，忽略本邮件即可，你的账号不会有任何变化。");
    }

    /**
     * 找回密码的验证码。
     * <p>
     * 和绑定邮箱用同一个发信通道，但<b>标题和正文必须分开</b>：
     * 用户同时发过两种码时，靠邮件标题才知道该填哪一个。
     */
    @Override
    public void sendResetCode(String to, String code, int minutes) {
        send(to, code, minutes,
                "【心海的小窝】重置密码验证码 " + code,
                "你正在重置密码，验证码是：",
                "如果你没有申请重置密码，说明有人填错了邮箱，忽略本邮件即可，"
                        + "你的密码不会有任何变化。");
    }

    private void send(String to, String code, int minutes,
            String subject, String heading, String footer) {
        if (!isConfigured()) {
            // 不抛异常：本地没配 SMTP 时，验证码已经在 UserVerifyService 里打到日志了，
            // 这里只需要不阻塞流程（线上漏配会在启动时打 ERROR，见 UserVerifyServiceImpl）
            log.warn("[mail] SMTP 未配置，跳过发送。to={} code={}", to, code);
            return;
        }

        String text = heading + code + "，" + minutes + " 分钟内有效。\n" + footer;

        String html = """
                <div style="padding:24px;background:#f7f8fa;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;">
                  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px 28px 24px;">
                    <div style="font-size:15px;font-weight:600;color:#18191c;">心海的小窝</div>
                    <div style="margin-top:18px;font-size:14px;color:#333;line-height:1.7;">
                      %s
                    </div>
                    <div style="margin:16px 0;font-size:30px;font-weight:700;letter-spacing:8px;color:#00aeec;">
                      %s
                    </div>
                    <div style="font-size:13px;color:#858585;line-height:1.7;">
                      验证码 %d 分钟内有效，只能使用一次。<br/>
                      %s
                    </div>
                  </div>
                  <div style="max-width:480px;margin:12px auto 0;text-align:center;font-size:12px;color:#a0a0a0;">
                    本邮件由系统自动发送，请勿直接回复。
                  </div>
                </div>
                """.formatted(heading, code, minutes, footer);

        try {
            MimeMessage message = createMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            // 发信地址必须是控制台里创建并验证过的那个，昵称可以随便写
            helper.setFrom(new InternetAddress(username, fromName, "UTF-8"));
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(text, html);
            mailSender.send(message);
            log.info("[mail] 验证码已发送 to={}", to);
        } catch (MailException | MessagingException | UnsupportedEncodingException e) {
            log.error("[mail] 验证码发送失败 to={} host（排查顺序）："
                    + "① 阿里云控制台「发信地址」是否已创建、SMTP 密码是否填对（535 多半是这里）；"
                    + "② 发信域名的 SPF/MX/DKIM 是否验证通过（554/553 多半是这里）；"
                    + "③ MAIL_USERNAME 是否就是那个发信地址，而不是阿里云账号；"
                    + "④ 端口 465 时 MAIL_SSL 必须为 true。", to, e);
            throw new CustomerException(ResultCode.SERVER_ERROR, "验证码发送失败，请稍后重试");
        }
    }

    /**
     * 建消息：优先用 {@link DomainMimeMessage}，让 Message-ID 带上发信域名。
     *
     * <p>拿不到底层 Session（比如被换成了别的 JavaMailSender 实现）就退回默认实现，
     * 不影响发信，只是 Message-ID 又变回本机 hostname。
     */
    private MimeMessage createMessage() {
        if (mailSender instanceof JavaMailSenderImpl impl) {
            return new DomainMimeMessage(impl.getSession(), username);
        }
        return mailSender.createMimeMessage();
    }

    /**
     * Message-ID 按阿里云示例用「UUID@发信域」生成。
     *
     * <p>JavaMail 默认的 Message-ID 是 {@code <uuid.JavaMail.user@hostname>}，
     * 在 ECS 上 hostname 是 iZbp1xxxxZ 这种没有点的机器名，收信方（尤其 QQ/163）
     * 容易当成伪造邮件。必须覆盖 {@code updateMessageID}，因为它会在 saveChanges()
     * 里被调用，事后 setHeader 是盖不住的。
     */
    private static final class DomainMimeMessage extends MimeMessage {

        private final String messageId;

        DomainMimeMessage(Session session, String mailFrom) {
            super(session);
            this.messageId = buildMessageId(mailFrom);
        }

        @Override
        protected void updateMessageID() {
            // 父类声明了 throws MessagingException，这里不抛，收窄是合法的
            try {
                setHeader("Message-ID", messageId);
            } catch (MessagingException e) {
                log.warn("[mail] 设置 Message-ID 失败，改用 JavaMail 默认值", e);
            }
        }

        private static String buildMessageId(String mailFrom) {
            int at = mailFrom == null ? -1 : mailFrom.indexOf('@');
            String domain = (at > 0 && at < mailFrom.length() - 1)
                    ? mailFrom.substring(at + 1)
                    : "kokomi.local";
            return "<" + UUID.randomUUID() + "@" + domain + ">";
        }
    }
}
