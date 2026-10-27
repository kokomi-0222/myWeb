package com.example.kokomi.util;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
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
 *
 * <p>⚠️ <b>重发即废旧码</b>：只有「最近一次发送」的那个码能通过校验，之前几封邮件里的码
 * 立刻作废。用户主动点了「重新发送」就该用最新那封 —— 否则他在两个码之间来回猜，
 * 到底哪个算数只能靠试。
 *
 * <p>但旧码不直接扔进「验证码不正确」：{@link #MAX_RETIRED} 个被顶掉的旧码还留着做识别，
 * 用户输的是它们时返回 {@link CheckResult#SUPERSEDED}，提示「验证码已更新，请使用最新收到的」——
 * 这比一句「不正确」有用得多，而且**不计入试错次数**（他不是在猜，是拿了上一封邮件）。
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
    /** 同一邮箱保留几个「已被顶掉」的旧码（只为给用户一句准确提示，不能通过校验） */
    private static final int MAX_RETIRED = 2;
    /** 缓存上限，防止被刷爆内存 */
    private static final int MAX_SIZE = 5000;

    /**
     * 全站发信配额。为什么要它：QQ/163 的个人邮箱每天能发的信是有限的，
     * 被脚本用几百个账号各点一次「发验证码」就会把配额打空，
     * 结果是正常用户也收不到信、谁也注册不了。这里按分钟 + 小时双窗口限流。
     *
     * <p>为什么从 8/60 放宽到 20/120：注册现在必须当场收码验证（不再有「注册后补绑」
     * 这条可以慢慢来的路），注册发码成了新用户入口的必经一步。8 封/分钟意味着
     * 一分钟内第 9 个注册的人会被告知「稍后再试」—— 对一个要拉新的站点太紧了。
     * 真正挡住刷子的是「同邮箱每小时 5 封 + 同 IP 每小时 20 次注册」这两条，
     * 全站配额只负责别把 SMTP 额度打空。
     */
    private static final int GLOBAL_PER_MINUTE = 20;
    private static final int GLOBAL_PER_HOUR = 120;
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
        /** 通过（{@link #check} 之后码被消费；{@link #verify} 之后码保留到过期） */
        OK,
        /** 输错了，还可以再试 */
        WRONG,
        /** 没有待校验的码，或已过期 */
        EXPIRED,
        /** 试错次数用完，码已作废 */
        TOO_MANY,
        /**
         * 输的是被「重新发送」顶掉的旧码。
         * 不算猜错（不扣次数），但要告诉用户去用最新那封邮件里的码。
         */
        SUPERSEDED
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
            if (!entry.codes.isEmpty() && now - entry.sentAt < RESEND_MS) {
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
            String code = String.format("%06d", RANDOM.nextInt(1_000_000));
            long expireAt = now + EXPIRE_MS;
            // 重发即废旧码：先把现有的全部降级成「只用于识别」的旧码，再加新的
            for (Code c : entry.codes) {
                c.active = false;
            }
            entry.codes.add(new Code(code, expireAt));
            // 只留 1 个能用的 + MAX_RETIRED 个旧码：再多就没意义了，用户最多也就翻到最近两三封邮件
            while (entry.codes.size() > 1 + MAX_RETIRED) {
                entry.codes.remove(0);
            }
            entry.sentAt = now;
            entry.expireAt = expireAt;
            // 重发视为「用户重新开始」：试错次数清零，否则他前面输错几次会导致新码也快作废
            entry.fails = 0;
            entry.sentInHour++;
            return new Issue(code, null, 0);
        }
    }

    /**
     * 校验验证码，成功后立即消费掉（整条记录删除，同一个码不能再用）。
     *
     * <p>适合「一次动作」的场景：绑定邮箱、找回密码重置。注册第一步不要用它，
     * 用 {@link #verify} —— 那里验完还不算完事，用户可能扭头就不注册了。
     */
    public static Check check(String email, String input) {
        return check0(email, input, true);
    }

    /**
     * 校验验证码，成功后**不消费**：同一个码在自己的有效期内可以反复验证。
     *
     * <p>为什么要这么一条：注册是两步的（先验邮箱换 ticket，再设密码建号）。
     * 如果第一步就把码烧掉，用户「验完不注册、关掉弹窗、再打开」时会输入同一封邮件里
     * 那个码，然后被告知「验证码已失效」—— 可他明明几分钟前才收到，邮件上还写着
     * 10 分钟内有效，看起来就是系统坏了。实际情况是第一次验证就把它作废了。
     *
     * <p>不消费有没有风险：验证码的作用只是「证明你是这个邮箱的主人」，验一次和
     * 验三次证明的是同一件事，而且码本来就只发给这个邮箱。真正的边界另有两条 ——
     * 邮箱上有唯一索引（同一个邮箱只可能建出一个号），以及建号成功后调用
     * {@link #clear} 把码清干净。
     */
    public static Check verify(String email, String input) {
        return check0(email, input, false);
    }

    /**
     * @param consume true = 命中后删除整条记录（一次一用）；false = 命中后保留到过期
     */
    private static Check check0(String email, String input, boolean consume) {
        if (email == null || email.isBlank()) {
            return new Check(CheckResult.EXPIRED, 0);
        }
        Entry entry = CACHE.get(email);
        if (entry == null) {
            return new Check(CheckResult.EXPIRED, 0);
        }
        synchronized (entry) {
            long now = System.currentTimeMillis();
            // 先剔掉这一批里已经过期的，再看还有没有能用的
            entry.codes.removeIf(c -> now > c.expireAt);
            if (entry.codes.isEmpty()) {
                CACHE.remove(email);
                return new Check(CheckResult.EXPIRED, 0);
            }
            if (entry.fails >= MAX_FAIL) {
                CACHE.remove(email);
                return new Check(CheckResult.TOO_MANY, 0);
            }
            String value = input == null ? "" : input.trim();
            // 只有最新的那个码算数；被「重新发送」顶掉的旧码只是用来给一句准确的提示
            boolean superseded = false;
            for (Code c : entry.codes) {
                if (!c.code.equals(value)) {
                    continue;
                }
                if (!c.active) {
                    superseded = true;
                    continue;
                }
                if (consume) {
                    CACHE.remove(email);
                } else {
                    // 不消费也要把试错计数清零：否则前面输错几次，后面每次验证
                    // 都顶着「还剩 1 次」的额度，正常操作也会莫名其妙被作废
                    entry.fails = 0;
                }
                return new Check(CheckResult.OK, 0);
            }
            if (superseded) {
                // 拿的是上一封邮件里的码：这不是猜错，别扣次数，只提示去用最新的
                return new Check(CheckResult.SUPERSEDED, MAX_FAIL - entry.fails);
            }
            entry.fails++;
            int remaining = MAX_FAIL - entry.fails;
            if (remaining <= 0) {
                CACHE.remove(email);
                return new Check(CheckResult.TOO_MANY, 0);
            }
            return new Check(CheckResult.WRONG, remaining);
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
            if (entry.codes.isEmpty() || elapsed >= RESEND_MS) {
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
            // 码全部过期就没用了（拿着它来验也只会得到 EXPIRED），立刻回收 ——
            // 别让一条死记录白占一格 MAX_SIZE，也别让它拖到「过期一小时」才被扫掉
            return v.codes.isEmpty() || now > v.expireAt;
        });
    }

    private static class Entry {
        /** 最近发出的几个码（新的在后，只有最后一个是 active） */
        final List<Code> codes = new ArrayList<>();
        long sentAt;
        /** 最新那个码的过期时间，只给 cleanExpired 用 */
        long expireAt;
        int fails;
        long hourStart;
        int sentInHour;
    }

    private static class Code {
        final String code;
        final long expireAt;
        /** false = 被后来的「重新发送」顶掉了，只用于识别并给出「请用最新验证码」的提示 */
        boolean active = true;

        Code(String code, long expireAt) {
            this.code = code;
            this.expireAt = expireAt;
        }
    }
}
