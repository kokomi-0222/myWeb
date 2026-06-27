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

import cn.hutool.captcha.CaptchaUtil;
import cn.hutool.captcha.ShearCaptcha;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
public class CaptchaController {

    /** 每 IP 每分钟最多请求验证码次数 */
    private static final int MAX_PER_MINUTE = 60;
    /** 限流窗口（毫秒） */
    private static final long WINDOW_MS = 60_000;

    /** IP → (count, windowStart) */
    private static final ConcurrentHashMap<String, RateWindow> RATE_CACHE = new ConcurrentHashMap<>();

    @GetMapping("/captcha")
    public Result<Map<String, Object>> getCaptcha(HttpServletRequest request) {
        String ip = getClientIP(request);

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

        // 存入缓存（缓存已满时拒绝）
        String key = UUID.randomUUID().toString().replace("-", "");
        if (!CaptchaCache.put(key, code)) {
            return Result.error(429, "系统繁忙，请稍后再试");
        }

        Map<String, Object> result = new HashMap<>();
        result.put("captchaKey", key);
        result.put("captchaImage", base64);
        return Result.success(result);
    }

    /** 检查 IP 是否超过频率限制 */
    private boolean checkRate(String ip) {
        long now = System.currentTimeMillis();
        RateWindow window = RATE_CACHE.compute(ip, (k, v) -> {
            if (v == null || now - v.windowStart > WINDOW_MS) {
                return new RateWindow(1, now);
            }
            v.count++;
            return v;
        });
        // 同时清理过期窗口（惰性清理）
        if (now - window.windowStart > WINDOW_MS) {
            RATE_CACHE.remove(ip);
        }
        return window.count <= MAX_PER_MINUTE;
    }

    /** 获取客户端真实 IP（考虑反向代理） */
    private String getClientIP(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        String xReal = request.getHeader("X-Real-IP");
        if (xReal != null && !xReal.isBlank()) {
            return xReal.trim();
        }
        return request.getRemoteAddr();
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
