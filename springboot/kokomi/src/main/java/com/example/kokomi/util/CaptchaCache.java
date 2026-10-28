package com.example.kokomi.util;

import java.util.concurrent.ConcurrentHashMap;

/**
 * 验证码内存缓存（单机版）
 * 仿照 {@link UserTokenVersionCache} 的静态 ConcurrentHashMap 模式
 */
public class CaptchaCache {

    /** 验证码有效期（毫秒） */
    private static final long EXPIRE_MS = 5 * 60 * 1000;

    /** 缓存最大容量，防止恶意无限请求导致内存耗尽 */
    private static final int MAX_SIZE = 1000;

    /**
     * 「只验不删」模式下同一个码最多错几次就作废。
     * 发码接口不能一错就把图烧掉（用户往往只是打错一个字母），但也不能让他
     * 拿同一张图无限试 —— 4 位字符猜几百次就出来了。
     */
    private static final int MAX_FAIL = 3;

    private static final ConcurrentHashMap<String, CaptchaEntry> CACHE = new ConcurrentHashMap<>();

    /**
     * 存入验证码。缓存已满时返回 false，调用方应拒绝生成新验证码。
     */
    public static boolean put(String key, String code) {
        // 先清理过期条目，释放空间
        cleanExpired();
        if (CACHE.size() >= MAX_SIZE) {
            return false;
        }
        CACHE.put(key, new CaptchaEntry(code, System.currentTimeMillis()));
        return true;
    }

    /**
     * 校验并移除验证码（区分大小写，提高抗暴力破解能力）
     *
     * @return true 验证通过（同步删除该 key），false 验证失败或已过期
     */
    public static boolean verifyAndRemove(String key, String userInput) {
        if (key == null || userInput == null) {
            return false;
        }
        CaptchaEntry entry = CACHE.remove(key);
        if (entry == null) {
            return false;
        }
        // 检查是否过期
        if (System.currentTimeMillis() - entry.timestamp > EXPIRE_MS) {
            return false;
        }
        return entry.code.equalsIgnoreCase(userInput.trim());
    }

    /**
     * 校验但**不删除**，供「发验证码」这类链路使用：后面还有邮箱格式、邮箱是否被占用、
     * 频控一堆校验，任何一步失败都不该让用户重看一张图。真正的消费交给
     * {@link #remove(String)}，在动作确实执行成功之后才调用。
     * <p>
     * 为了不被暴力枚举，同一个 key 累计错 {@link #MAX_FAIL} 次即作废。
     *
     * @return true 校验通过（条目仍留着，调用方成功后自行 remove）
     */
    public static boolean verify(String key, String userInput) {
        if (key == null || userInput == null) {
            return false;
        }
        String guess = userInput.trim();
        if (guess.isEmpty()) {
            return false;
        }
        long now = System.currentTimeMillis();
        // computeIfPresent 保证「比对 + 累计错误次数 + 达到上限移除」是原子的
        boolean[] matched = { false };
        CACHE.computeIfPresent(key, (k, entry) -> {
            if (now - entry.timestamp > EXPIRE_MS) {
                return null;
            }
            if (entry.code.equalsIgnoreCase(guess)) {
                matched[0] = true;
                return entry;
            }
            entry.fail++;
            return entry.fail >= MAX_FAIL ? null : entry;
        });
        return matched[0];
    }

    /**
     * 消费掉一个验证码（动作成功后调用）。对不存在的 key 是空操作。
     */
    public static void remove(String key) {
        if (key != null) {
            CACHE.remove(key);
        }
    }

    /**
     * 清理所有过期条目
     */
    private static void cleanExpired() {
        long now = System.currentTimeMillis();
        CACHE.entrySet().removeIf(e -> now - e.getValue().timestamp > EXPIRE_MS);
    }

    /**
     * 验证码条目（内部类）
     */
    private static class CaptchaEntry {
        final String code;
        final long timestamp;
        /** 已经输错几次（verify 用；verifyAndRemove 用不到） */
        int fail;

        CaptchaEntry(String code, long timestamp) {
            this.code = code;
            this.timestamp = timestamp;
        }
    }
}
