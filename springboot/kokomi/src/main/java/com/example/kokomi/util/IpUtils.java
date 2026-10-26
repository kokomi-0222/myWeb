package com.example.kokomi.util;

import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 取客户端真实 IP。
 *
 * 线上是 Nginx 反代，request.getRemoteAddr() 只会拿到 127.0.0.1，
 * 必须优先看 X-Forwarded-For / X-Real-IP（Nginx 里已配 proxy_set_header）。
 */
public class IpUtils {

    private IpUtils() {
    }

    public static String getClientIP(HttpServletRequest request) {
        if (request == null) {
            return "unknown";
        }
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            // 可能是 "客户端IP, 代理1, 代理2"，第一个才是真实客户端
            return xff.split(",")[0].trim();
        }
        String xReal = request.getHeader("X-Real-IP");
        if (xReal != null && !xReal.isBlank()) {
            return xReal.trim();
        }
        return request.getRemoteAddr();
    }

    /** 当前线程绑定的请求里的客户端 IP（Service 层没有 request 参数时用） */
    public static String getCurrentIP() {
        try {
            ServletRequestAttributes attrs =
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            return attrs == null ? "unknown" : getClientIP(attrs.getRequest());
        } catch (Exception e) {
            return "unknown";
        }
    }
}
