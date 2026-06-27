package com.example.kokomi.util;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 权限+角色内存缓存（单机版）
 * 仿照 {@link UserTokenVersionCache} 的静态 ConcurrentHashMap 模式
 * <p>
 * 登录时由 UserServiceImpl 预热，后续请求由 PermissionInterceptor 懒加载，
 * O(1) HashMap 查找避免每次请求都查 DB。
 */
public class PermissionCache {

    private static final ConcurrentHashMap<Long, Entry> CACHE = new ConcurrentHashMap<>();

    /**
     * 缓存条目：包含用户的角色集合和权限集合
     */
    public record Entry(Set<String> roles, Set<String> permissions) {}

    /**
     * 查询缓存
     */
    public static Entry get(Long userId) {
        return CACHE.get(userId);
    }

    /**
     * 存入缓存（roles 和 permissions 会自动做不可变拷贝）
     */
    public static void put(Long userId, Set<String> roles, Set<String> permissions) {
        CACHE.put(userId, new Entry(
                Collections.unmodifiableSet(new HashSet<>(roles)),
                Collections.unmodifiableSet(new HashSet<>(permissions))
        ));
    }

    /**
     * 移除缓存（角色/权限变更时调用）
     */
    public static void remove(Long userId) {
        CACHE.remove(userId);
    }

    /**
     * 检查用户是否拥有指定权限（仅查缓存，缓存缺失返回 false）
     */
    public static boolean hasPermission(Long userId, String perm) {
        Entry e = CACHE.get(userId);
        return e != null && e.permissions().contains(perm);
    }

    /**
     * 检查用户是否拥有指定角色（仅查缓存，缓存缺失返回 false）
     */
    public static boolean hasRole(Long userId, String role) {
        Entry e = CACHE.get(userId);
        return e != null && e.roles().contains(role);
    }
}
