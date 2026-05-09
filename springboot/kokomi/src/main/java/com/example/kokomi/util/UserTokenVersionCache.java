package com.example.kokomi.util;

import java.util.concurrent.ConcurrentHashMap;

/**
 * 用户令牌版本 内存缓存
 * 减少拦截器每次请求查数据库
 */
public class UserTokenVersionCache {

    private static final ConcurrentHashMap<Long, Integer> CACHE = new ConcurrentHashMap<>();

    // 拿缓存
    public static Integer getVersion(Long userId) {
        return CACHE.get(userId);
    }

    // 设置/更新缓存
    public static void setVersion(Long userId, Integer version) {
        CACHE.put(userId, version);
    }

    // 清除缓存（改密码、退出登录时调用）
    public static void removeVersion(Long userId) {
        CACHE.remove(userId);
    }
}