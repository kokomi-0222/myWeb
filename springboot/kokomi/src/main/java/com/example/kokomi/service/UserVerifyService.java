package com.example.kokomi.service;

import com.example.kokomi.vo.VerifySendVO;

/**
 * 邮箱绑定 = 等级升级的唯一自助入口。
 *
 * <p>站内的等级是「游客 → 普通用户 → 会员」：
 * <ul>
 *   <li>刚注册是 guest：能登录、浏览、点赞，但不能发帖也不能评论；</li>
 *   <li>绑定并验证邮箱后自动升成 member：能评论，仍然不能发帖；</li>
 *   <li>会员（vip）由管理员在后台授予：能发帖。见 {@code sql_tier_permission.sql}。</li>
 * </ul>
 *
 * <p>所以这个服务只负责「把邮箱绑上、验证归属、顺手升级」，
 * 发帖/评论的闸门在 PostServiceImpl / CommentServiceImpl 里按权限码判断，
 * 不在这里 —— 两者是两件事：绑了邮箱也可能还只是普通用户（发不了帖）。
 */
public interface UserVerifyService {

    /**
     * 给用户发验证码。
     *
     * @param email 要绑定的邮箱；传 null/空 表示用账号上已有的邮箱。
     *              注册已经不再收邮箱了，新用户第一次绑定必须传。
     */
    VerifySendVO sendCode(Long userId, String email);

    /** 校验验证码；通过后写入 email、email_verified=1，是游客的话升成普通用户 */
    void confirm(Long userId, String email, String code);

    /** 管理端手动标记为已验证（SMTP 出故障时给用户兜底），同样会把游客升成普通用户 */
    void markVerified(Long userId);

    boolean isVerified(Long userId);
}
