package com.example.kokomi.common;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import cn.hutool.core.util.StrUtil;

/**
 * 处罚文案。
 * <p>
 * 登录被拦、发言被拦、后台看到的状态，用的必须是同一套说法，
 * 否则用户会看到「你被封禁了」「账号已被限制」两种口径，不知道该信哪个。
 */
public final class BanText {

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private BanText() {
    }

    /** 「永久」或「2026-11-01 12:00 后」 */
    public static String untilText(LocalDateTime until) {
        return until == null ? "永久" : until.format(FMT) + " 后";
    }

    /** 登录被拒时的提示 */
    public static String loginDenied(LocalDateTime until, String reason) {
        return "账号已被封禁（" + untilText(until) + "才能再次登录）" + reasonSuffix(reason);
    }

    /** 禁言的人想发内容时的提示 */
    public static String speakDenied(LocalDateTime until, String reason) {
        return "你已被禁言（" + untilText(until) + "解除），暂时无法发布内容和评论"
                + reasonSuffix(reason);
    }

    /** 后台备注里的短标签 */
    public static String shortLabel(int level, LocalDateTime until) {
        return BanLevel.labelOf(level) + (until == null ? "（永久）" : " " + untilText(until).replace(" 后", ""));
    }

    private static String reasonSuffix(String reason) {
        return StrUtil.isBlank(reason) ? "" : "，原因：" + reason;
    }
}
