package com.example.kokomi.util;

import java.util.concurrent.ConcurrentHashMap;

/**
 * 验证码内存缓存（单机版）
 * 仿照 {@link UserTokenVersionCache} 的静态 ConcurrentHashMap 模式
 */
public class CaptchaCache {

    /** 验证码有效期（毫秒） */
    private static final long EXPIRE_MS = 5 * 60 * 1000;

    private static final ConcurrentHashMap<String, CaptchaEntry> CACHE = new ConcurrentHashMap<>();

    /**
     * 存入验证码
     */
    public static void put(String key, String code) {
        CACHE.put(key, new CaptchaEntry(code, System.currentTimeMillis()));
    }

    /**
     * 校验并移除验证码（忽略大小写）
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
     * 验证码条目（内部类）
     */
    private static class CaptchaEntry {
        final String code;
        final long timestamp;

        CaptchaEntry(String code, long timestamp) {
            this.code = code;
            this.timestamp = timestamp;
        }
    }
}
