package com.example.kokomi.service;

import com.example.kokomi.vo.VerifySendVO;

/**
 * 邮箱验证：注册后必须验证邮箱归属才能发内容。
 *
 * 这道关的存在意义：注册时只校验「邮箱格式对不对」，并不验证「邮箱是不是你的」，
 * 所以换个邮箱就能无限注册。要求收一次验证码，就把批量造号的门槛从「写个脚本」
 * 抬到了「得有一堆真实可收信的邮箱」。
 */
public interface UserVerifyService {

    /** 给当前用户的邮箱发验证码（带频控），返回结果里带打码后的邮箱和重发倒计时 */
    VerifySendVO sendCode(Long userId);

    /** 校验验证码，通过后把 email_verified 置 1 */
    void confirm(Long userId, String code);

    /** 未验证就抛 507（发帖 / 评论 / 举报前调用） */
    void requireVerified(Long userId);

    /** 管理端手动标记为已验证（SMTP 出故障时给用户兜底） */
    void markVerified(Long userId);

    boolean isVerified(Long userId);
}
