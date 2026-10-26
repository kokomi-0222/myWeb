package com.example.kokomi.util;

import java.security.SecureRandom;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 邮箱验证码的内存缓存（单机版），仿 {@link CaptchaCache} 的静态 ConcurrentHashMap 模式。
 *
 * 为什么不用数据库表：验证码活 10 分钟就够了，落库反而要加清理任务；
 * 单机重启后最多让用户点一次「重新发送」，代价可以接受。
 *
 * 频控三条，都是为了「不让它变成发信机 / 不让它被暴力猜」：
 *   1. 同一邮箱 60 秒内只能发一次；
 *   2. 同一邮箱每小时最多 5 封；
 *   3. 同一个码最多试错 5 次，超了就作废（6 位数字 5 次机会的命中率仍然极低）。
 */
public class EmailCodeCache {

    /** 验证码有效期 */
    private static final long EXPIRE_MS = 10 * 60 * 1000L;
    /** 重发间隔 */
    private static final long RESEND_MS = 60 * 1000L;
    /** 每小时最多发几封 */
    private static final int MAX_PER_HOUR = 5;
    private static final long HOUR_MS = 60 * 60 * 1000L;
    /** 同一个码允许试错次数 */
    private static final int MAX_FAIL = 5;
    /** 缓存上限，防止被刷爆内存 */
    private static final int MAX_SIZE = 5000;

    /**
     * 全站发信配额。为什么要它：QQ/163 的个人邮箱每天能发的信是有限的，
     * 被脚本用几百个账号各点一次「发验证码」就会把配额打空，
     * 结果是正常用户也收不到信、谁也注册不了。这里按分钟 + 小时双窗口限流。
     */
    private static final int GLOBAL_PER_MINUTE = 8;
    private static final int GLOBAL_PER_HOUR = 60;
    private static final long MINUTE_MS = 60 * 1000L;

    private static long globalMinuteStart = 0;
    private static int globalMinuteCount = 0;
    private static long globalHourStart = 0;
    private static int globalHourCount = 0;

    private static final SecureRandom RANDOM = new SecureRandom();

    private static final ConcurrentHashMap<String, Entry> CACHE = new ConcurrentHashMap<>();

    /** 发送结果：成功时 code 有值；失败时 reason 是给用户看的文案 */
    public static class Issue {
        public final String code;
        public final String reason;
        public final int retryAfter;

        private Issue(String code, String reason, int retryAfter) {
            this.code = code;
            this.reason = reason;
            this.retryAfter = retryAfter;
        }

        public boolean isOk() {
            return code != null;
        }
    }

    /** 校验结果 */
    public enum CheckResult {
        /** 通过（码已被消费，不能再用） */
        OK,
        /** 输错了，还可以再试 */
        WRONG,
        /** 没有待校验的码，或已过期 */
        EXPIRED,
        /** 试错次数用完，码已作废 */
        TOO_MANY
    }

    public static class Check {
        public final CheckResult result;
        /** 还剩几次机会（WRONG 时有用） */
        public final int remaining;

        private Check(CheckResult result, int remaining) {
            this.result = result;
            this.remaining = remaining;
        }
    }

    /**
     * 申请一个验证码（带频控）。调用方拿到 code 后自己去发信。
     */
    public static Issue issue(String email) {
        if (email == null || email.isBlank()) {
            return new Issue(null, "账号缺少邮箱，请联系管理员", 0);
        }
        long now = System.currentTimeMillis();
        cleanExpired(now);
        if (CACHE.size() >= MAX_SIZE) {
            return new Issue(null, "请求人数较多，请稍后再试", 30);
        }

        Entry entry = CACHE.computeIfAbsent(email, k -> new Entry());
        synchronized (entry) {
            if (entry.code != null && now - entry.sentAt < RESEND_MS) {
                long wait = RESEND_MS - (now - entry.sentAt);
                return new Issue(null, "验证码刚发过，请稍后再试", (int) Math.ceil(wait / 1000.0));
            }
            if (now - entry.hourStart > HOUR_MS) {
                entry.hourStart = now;
                entry.sentInHour = 0;
            }
            if (entry.sentInHour >= MAX_PER_HOUR) {
                long wait = HOUR_MS - (now - entry.hourStart);
                return new Issue(null, "发送太频繁，请一小时后再试", (int) Math.ceil(wait / 1000.0));
            }
            // 全站配额放在这里取：被上面几条挡掉的请求不算「真的发了一封」，
            // 否则有人狂点重发就能把正常用户的名额吃光
            if (!takeGlobalSlot(now)) {
                return new Issue(null, "验证码发送太频繁，请稍后再试", 60);
            }
            entry.code = String.format("%06d", RANDOM.nextInt(1_000_000));
            entry.sentAt = now;
            entry.expireAt = now + EXPIRE_MS;
            entry.fails = 0;
            entry.sentInHour++;
            return new Issue(entry.code, null, 0);
        }
    }

    /**
     * 校验验证码，成功后立即消费掉（不能重复使用）。
     */
    public static Check check(String email, String input) {
        if (email == null || email.isBlank()) {
            return new Check(CheckResult.EXPIRED, 0);
        }
        Entry entry = CACHE.get(email);
        if (entry == null) {
            return new Check(CheckResult.EXPIRED, 0);
        }
        synchronized (entry) {
            long now = System.currentTimeMillis();
            if (entry.code == null || now > entry.expireAt) {
                CACHE.remove(email);
                return new Check(CheckResult.EXPIRED, 0);
            }
            if (entry.fails >= MAX_FAIL) {
                CACHE.remove(email);
                return new Check(CheckResult.TOO_MANY, 0);
            }
            String value = input == null ? "" : input.trim();
            if (!entry.code.equals(value)) {
                entry.fails++;
                int remaining = MAX_FAIL - entry.fails;
                if (remaining <= 0) {
                    CACHE.remove(email);
                    return new Check(CheckResult.TOO_MANY, 0);
                }
                return new Check(CheckResult.WRONG, remaining);
            }
            CACHE.remove(email);
            return new Check(CheckResult.OK, 0);
        }
    }

    /** 距离可以重发还有几秒（给前端倒计时用；0 表示现在就能发） */
    public static int resendAfter(String email) {
        if (email == null) {
            return 0;
        }
        Entry entry = CACHE.get(email);
        if (entry == null) {
            return 0;
        }
        synchronized (entry) {
            long elapsed = System.currentTimeMillis() - entry.sentAt;
            if (entry.code == null || elapsed >= RESEND_MS) {
                return 0;
            }
            return (int) Math.ceil((RESEND_MS - elapsed) / 1000.0);
        }
    }

    public static void clear(String email) {
        if (email != null) {
            CACHE.remove(email);
        }
    }

    /** 全站发信配额（分钟 + 小时双窗口） */
    private static synchronized boolean takeGlobalSlot(long now) {
        if (now - globalMinuteStart > MINUTE_MS) {
            globalMinuteStart = now;
            globalMinuteCount = 0;
        }
        if (now - globalHourStart > HOUR_MS) {
            globalHourStart = now;
            globalHourCount = 0;
        }
        if (globalMinuteCount >= GLOBAL_PER_MINUTE || globalHourCount >= GLOBAL_PER_HOUR) {
            return false;
        }
        globalMinuteCount++;
        globalHourCount++;
        return true;
    }

    /** 过期很久的条目直接清掉（惰性清理，没有定时任务） */
    private static void cleanExpired(long now) {
        CACHE.entrySet().removeIf(e -> {
            Entry v = e.getValue();
            return v.code == null || now - v.expireAt > HOUR_MS;
        });
    }

    private static class Entry {
        String code;
        long sentAt;
        long expireAt;
        int fails;
        long hourStart;
        int sentInHour;
    }
}
