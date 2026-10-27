package com.example.kokomi.util;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 注册频率兜底。
 *
 * 邮箱验证已经把「注册了就能发垃圾」这条堵住了，但没验证的账号照样能无限建，
 * 会把 user 表撑大、把自增 id 刷走，也能拿去撞别人的邮箱配额。
 * 这里加一个非常宽松的限流：正常用户永远碰不到，脚本才会撞上。
 *
 * 阈值故意定得高：国内很多人在校园网 / 公司出口 NAT 后面，共享一个公网 IP，
 * 卡太死会误伤真实用户。真要更严，改这里两个常量即可。
 */
public class RegisterRateLimit {

    /** 同一 IP 每小时最多注册几个（默认 20，本地联调可以调大） */
    private static volatile int perIpPerHour = 20;
    /** 全站每小时最多注册几个（分布式脚本的兜底） */
    private static volatile int globalPerHour = 100;
    private static final int DEFAULT_PER_IP = 20;
    private static final int DEFAULT_GLOBAL = 100;
    private static final long HOUR_MS = 60 * 60 * 1000L;

    /**
     * 让阈值可配置：本地开发 / 自动化验收会反复注册临时账号，
     * 20 个/小时根本不够用。线上不设这两个键，走默认值。
     */
    public static void configure(Integer perIp, Integer global) {
        if (perIp != null && perIp > 0) {
            perIpPerHour = perIp;
        }
        if (global != null && global > 0) {
            globalPerHour = global;
        }
    }

    /** 清空计数（只在测试/运维脚本里用） */
    public static synchronized void reset() {
        BY_IP.clear();
        globalCount.set(0);
        globalWindowStart = 0;
        perIpPerHour = DEFAULT_PER_IP;
        globalPerHour = DEFAULT_GLOBAL;
    }
    /** 记录的 IP 超过这个数就顺手清一遍过期窗口 */
    private static final int MAX_IPS = 10000;

    private static final ConcurrentHashMap<String, Window> BY_IP = new ConcurrentHashMap<>();
    private static final AtomicInteger globalCount = new AtomicInteger(0);
    private static volatile long globalWindowStart = 0;

    /** 记一次注册尝试；返回 false 表示超限，调用方应当拒绝 */
    public static synchronized boolean tryAcquire(String ip) {
        long now = System.currentTimeMillis();

        if (now - globalWindowStart > HOUR_MS) {
            globalWindowStart = now;
            globalCount.set(0);
        }
        if (globalCount.get() >= globalPerHour) {
            return false;
        }

        if (BY_IP.size() > MAX_IPS) {
            BY_IP.entrySet().removeIf(e -> now - e.getValue().windowStart > HOUR_MS);
        }

        String key = (ip == null || ip.isBlank()) ? "unknown" : ip;
        Window w = BY_IP.computeIfAbsent(key, k -> new Window(now));
        if (now - w.windowStart > HOUR_MS) {
            w.windowStart = now;
            w.count = 0;
        }
        if (w.count >= perIpPerHour) {
            return false;
        }
        w.count++;
        globalCount.incrementAndGet();
        return true;
    }

    private static class Window {
        long windowStart;
        int count;

        Window(long start) {
            this.windowStart = start;
            this.count = 0;
        }
    }
}
