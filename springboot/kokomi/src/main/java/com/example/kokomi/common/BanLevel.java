package com.example.kokomi.common;

/**
 * 账号处罚级别，对应 {@code user.status}。
 * <p>
 * 分两档是有实际区别的：
 * <ul>
 *   <li><b>禁言</b>：还能登录、还能看帖，只是发不出新内容。适合「嘴臭但不算恶意账号」，
 *       处罚完对方还能看到自己被禁言的理由和期限，改过就解。</li>
 *   <li><b>封号</b>：连登录都不给。适合垃圾广告号、批量注册的水军。</li>
 * </ul>
 * 两档都支持临时 / 永久（{@code ban_until} 为 null 即永久）。
 * <p>
 * 到期不会自动写库，而是在「登录」和「发言」这两个入口顺带检查并解除——
 * 没必要为了这件事再养一个定时任务。
 */
public final class BanLevel {

    /** 正常 */
    public static final int NORMAL = 0;

    /** 禁言：可登录，不能发帖 / 评论 / 回复 */
    public static final int MUTE = 1;

    /** 封号：不能登录 */
    public static final int BAN = 2;

    private BanLevel() {
    }

    public static boolean isValid(int level) {
        return level == MUTE || level == BAN;
    }

    /** 给前端 / 日志用的中文名 */
    public static String labelOf(Integer level) {
        if (level == null) {
            return "正常";
        }
        return switch (level) {
            case MUTE -> "禁言";
            case BAN -> "封号";
            default -> "正常";
        };
    }

    /** user.status 是否处于被处罚状态 */
    public static boolean isPunished(Integer status) {
        return status != null && status != NORMAL;
    }

    /** 是否是封号（连登录都不给）。禁言不满足这个条件 —— 禁言可以登录 */
    public static boolean isBanned(Integer status) {
        return status != null && status == BAN;
    }
}
