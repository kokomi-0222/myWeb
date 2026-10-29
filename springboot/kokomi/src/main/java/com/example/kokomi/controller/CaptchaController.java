package com.example.kokomi.controller;

import java.io.ByteArrayOutputStream;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.kokomi.common.Result;
import com.example.kokomi.util.CaptchaCache;
import com.example.kokomi.util.IpUtils;

import cn.hutool.captcha.CaptchaUtil;
import cn.hutool.captcha.ShearCaptcha;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
public class CaptchaController {

    /**
     * 本地调试用：把图形验证码的明文一并返回，省得自测时对着图片猜。
     * 和 {@code app.mail.dev-echo} 是同一套约定 —— 只在 local profile 打开，
     * 线上（prod）没有这个键，恒为 false。
     * ⚠️ 开着它等于图形验证码形同虚设，绝不能带到生产。
     */
    @org.springframework.beans.factory.annotation.Value("${app.captcha.dev-echo:false}")
    private boolean devEcho;

    /** 每 IP 每分钟最多请求验证码次数 */
    private static final int MAX_PER_MINUTE = 60;
    /** 限流窗口（毫秒） */
    private static final long WINDOW_MS = 60_000;
    /** 过期窗口的清扫间隔 */
    private static final long SWEEP_INTERVAL_MS = 60_000;
    /**
     * 限流表硬上限。正常情况下每 60 秒扫一次，表里最多留两分钟内的活跃 IP；
     * 这个数只是最后一道防线 —— 真被僵尸网络刷到这个量，宁可丢掉限流精度
     * 也不能让内存无界增长。
     */
    private static final int MAX_ENTRIES = 50_000;

    /** IP → (count, windowStart) */
    private static final ConcurrentHashMap<String, RateWindow> RATE_CACHE = new ConcurrentHashMap<>();

    private static volatile long lastSweep = System.currentTimeMillis();

    @GetMapping("/captcha")
    public Result<Map<String, Object>> getCaptcha(HttpServletRequest request) {
        String ip = IpUtils.getClientIP(request);

        // IP 频率限制
        if (!checkRate(ip)) {
            return Result.error(429, "请求过于频繁，请稍后再试");
        }

        // 生成扭曲干扰型验证码（宽200, 高80, 4位字符, 4条干扰线）
        ShearCaptcha captcha = CaptchaUtil.createShearCaptcha(200, 80, 4, 4);
        String code = captcha.getCode();

        // 转 Base64
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        captcha.write(out);
        String base64 = "data:image/png;base64," + Base64.getEncoder().encodeToString(out.toByteArray());

        // 存入缓存。缓存满了会淘汰最老的几条，绝不拒绝新请求：
        // 登录、注册、找回密码、绑邮箱全都依赖这个接口，缓存打满时如果回 429，
        // 攻击者花 1000 个请求就能把全站登录搞挂。
        String key = UUID.randomUUID().toString().replace("-", "");
        CaptchaCache.put(key, code);

        Map<String, Object> result = new HashMap<>();
        result.put("captchaKey", key);
        result.put("captchaImage", base64);
        if (devEcho) {
            result.put("captchaCode", code);
        }
        return Result.success(result);
    }

    /** 检查 IP 是否超过频率限制 */
    private static boolean checkRate(String ip) {
        long now = System.currentTimeMillis();
        sweepExpired(now);
        RateWindow window = RATE_CACHE.compute(ip, (k, v) -> {
            if (v == null || now - v.windowStart > WINDOW_MS) {
                return new RateWindow(1, now);
            }
            v.count++;
            return v;
        });
        return window.count <= MAX_PER_MINUTE;
    }

    /**
     * 清扫已经过期的限流窗口。
     * <p>
     * 原来这里是「compute 之后判断窗口是否过期，过期就 remove」—— 那个条件恒为假：
     * 窗口一旦过期，compute 里已经换成新对象、windowStart 就是 now 了。
     * 结果是每个访问过的 IP 都永久留一条记录。
     */
    private static void sweepExpired(long now) {
        if (now - lastSweep < SWEEP_INTERVAL_MS) {
            return;
        }
        lastSweep = now;
        RATE_CACHE.entrySet().removeIf(e -> now - e.getValue().windowStart > WINDOW_MS);
        if (RATE_CACHE.size() > MAX_ENTRIES) {
            RATE_CACHE.clear();
        }
    }

    private static class RateWindow {
        int count;
        final long windowStart;
        RateWindow(int count, long windowStart) {
            this.count = count;
            this.windowStart = windowStart;
        }
    }
}
