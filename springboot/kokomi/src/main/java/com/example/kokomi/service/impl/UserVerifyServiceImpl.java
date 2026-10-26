package com.example.kokomi.service.impl;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.example.kokomi.common.ResultCode;
import com.example.kokomi.entity.User;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.mapper.UserMapper;
import com.example.kokomi.service.MailService;
import com.example.kokomi.service.UserVerifyService;
import com.example.kokomi.util.EmailCodeCache;
import com.example.kokomi.vo.VerifySendVO;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserVerifyServiceImpl implements UserVerifyService {

    /** 验证码有效期，要和 EmailCodeCache 里的 EXPIRE_MS 一致，只用于邮件正文 */
    private static final int CODE_MINUTES = 10;
    private static final String CODE_SENT_TEXT = "验证码已发送，请查收邮件（没收到就看一眼垃圾箱）";

    private final UserMapper userMapper;
    private final MailService mailService;

    /** 本地开发用：SMTP 没配时，把明文验证码放进接口响应，省得去翻日志 */
    @Value("${app.mail.dev-echo:false}")
    private boolean devEcho;

    @PostConstruct
    void warnIfNotConfigured() {
        if (!mailService.isConfigured()) {
            log.warn("[mail] SMTP 未配置（spring.mail.username / password 为空）："
                    + "验证码不会真的发出去，只会打到日志。线上必须配 MAIL_USERNAME / MAIL_PASSWORD，"
                    + "否则新注册用户永远无法验证邮箱、也就永远发不了内容。");
        }
    }

    @Override
    public VerifySendVO sendCode(Long userId) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new CustomerException(ResultCode.AUTHOR_ERROR, "登录状态已失效，请重新登录");
        }
        if (isVerifiedValue(user.getEmailVerified())) {
            return result(false, maskEmail(user.getEmail()), "邮箱已验证，无需重复验证", 0, null);
        }
        String email = user.getEmail();
        if (email == null || email.isBlank()) {
            // 历史遗留的手机号账号：没有邮箱可验证，只能由管理员在后台手动激活
            throw new CustomerException(ResultCode.PARAM_ERROR,
                    "该账号没有绑定邮箱，请联系管理员激活");
        }

        EmailCodeCache.Issue issue = EmailCodeCache.issue(email);
        if (!issue.isOk()) {
            return result(false, maskEmail(email), issue.reason, issue.retryAfter, null);
        }

        boolean configured = mailService.isConfigured();
        try {
            mailService.sendVerifyCode(email, issue.code, CODE_MINUTES);
        } catch (CustomerException e) {
            // 发信失败不算「已发送」，让前端把倒计时清掉，用户才好重试
            return result(false, maskEmail(email), e.getMessage(), 30, null);
        }

        if (!configured) {
            log.warn("[verify] SMTP 未配置，{} 的验证码是 {}（{} 分钟内有效）",
                    email, issue.code, CODE_MINUTES);
        }
        return result(true, maskEmail(email), CODE_SENT_TEXT, 60,
                (!configured && devEcho) ? issue.code : null);
    }

    @Override
    public void confirm(Long userId, String code) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new CustomerException(ResultCode.AUTHOR_ERROR, "登录状态已失效，请重新登录");
        }
        // 幂等：已验证过再点一次，不该报错
        if (isVerifiedValue(user.getEmailVerified())) {
            return;
        }
        String email = user.getEmail();
        if (email == null || email.isBlank()) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "该账号没有绑定邮箱，请联系管理员激活");
        }

        EmailCodeCache.Check check = EmailCodeCache.check(email, code);
        switch (check.result) {
            case OK -> {
                int rows = userMapper.setEmailVerified(userId);
                if (rows != 1) {
                    throw new CustomerException(ResultCode.SERVER_ERROR, "验证失败，请稍后重试");
                }
                log.info("[verify] 用户 {} 验证邮箱成功 {}", userId, maskEmail(email));
            }
            case WRONG -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "验证码不正确，还可以再试 " + check.remaining + " 次");
            case TOO_MANY -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "错误次数过多，验证码已作废，请重新获取");
            default -> throw new CustomerException(ResultCode.VERIFY_CODE_ERROR,
                    "验证码已失效，请重新获取");
        }
    }

    @Override
    public void requireVerified(Long userId) {
        if (userId == null) {
            return;
        }
        User state = userMapper.selectVerifyState(userId);
        if (state == null || isVerifiedValue(state.getEmailVerified())) {
            return;
        }
        // 507 不是 403：前端要能分辨「角色没权限」和「邮箱没验证」，
        // 后者要直接把发布框换成「去验证邮箱」的提示卡
        throw new CustomerException(ResultCode.EMAIL_UNVERIFIED,
                "验证邮箱后才能发布内容、评论和举报");
    }

    @Override
    public void markVerified(Long userId) {
        int rows = userMapper.setEmailVerified(userId);
        if (rows != 1) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "用户不存在");
        }
    }

    @Override
    public boolean isVerified(Long userId) {
        if (userId == null) {
            return true;
        }
        User state = userMapper.selectVerifyState(userId);
        return state == null || isVerifiedValue(state.getEmailVerified());
    }

    private static boolean isVerifiedValue(Integer value) {
        return value != null && value == 1;
    }

    /** a***@qq.com —— 提示文案里不暴露完整邮箱 */
    private static String maskEmail(String email) {
        if (email == null || email.isBlank()) {
            return "";
        }
        int at = email.indexOf('@');
        if (at <= 0) {
            return email;
        }
        String name = email.substring(0, at);
        String head = name.length() <= 1 ? name : name.substring(0, 1);
        return head + "***" + email.substring(at);
    }

    private static VerifySendVO result(boolean sent, String email, String message,
            int retryAfter, String devCode) {
        VerifySendVO vo = new VerifySendVO();
        vo.setSent(sent);
        vo.setEmail(email);
        vo.setMessage(message);
        vo.setRetryAfter(retryAfter);
        vo.setDevCode(devCode);
        return vo;
    }
}
