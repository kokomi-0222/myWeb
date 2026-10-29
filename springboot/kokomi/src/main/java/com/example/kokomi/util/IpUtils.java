package com.example.kokomi.util;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 取客户端真实 IP。
 *
 * <p>线上是 Nginx 反代，{@code getRemoteAddr()} 只会拿到 127.0.0.1，所以必须看代理头。
 * 但代理头是**客户端可以自己写的** —— 无条件采信等于把限流的 key 交给攻击者，
 * 换个假 IP 就换一个计数桶，限流形同虚设（实测过：500 次请求每次带不同 XFF 全部通过）。
 *
 * <p>所以分两种情况：
 * <ul>
 *   <li><b>直连</b>（remoteAddr 是公网地址）：代理头一律不听，就是 remoteAddr；</li>
 *   <li><b>经过反代</b>（remoteAddr 是回环/内网）：才解析代理头，并且<b>从右往左</b>
 *       取第一个非内网地址。最右一跳是 nginx 自己写的（{@code $proxy_add_x_forwarded_for}
 *       是追加，{@code $remote_addr} 是覆盖），左边那些用户可以随便伪造。</li>
 * </ul>
 *
 * <p>另外会校验地址格式并限制长度：拿到的结果会被当成 Map 的 key（限流桶），
 * 不校验的话一个 8KB 的垃圾头就能往内存里塞一个 8KB 的键。
 */
public class IpUtils {

    /** IPv4 字面量 */
    private static final Pattern IPV4 =
            Pattern.compile("^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$");

    private IpUtils() {
    }

    public static String getClientIP(HttpServletRequest request) {
        if (request == null) {
            return "unknown";
        }
        String remote = request.getRemoteAddr();
        if (remote == null || remote.isBlank()) {
            return "unknown";
        }
        // 直连来的请求：XFF 是客户端自己写的，不能信
        if (!isInternalAddress(remote)) {
            return remote;
        }

        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank() && xff.length() <= 512) {
            String[] hops = xff.split(",");
            for (int i = hops.length - 1; i >= 0; i--) {
                String hop = hops[i].trim();
                if (isValidAddress(hop) && !isInternalAddress(hop)) {
                    return hop;
                }
            }
            // 全是内网（多层反代）：退回最左一跳，至少还是个合法地址
            String first = hops[0].trim();
            if (isValidAddress(first)) {
                return first;
            }
        }

        String xReal = request.getHeader("X-Real-IP");
        if (xReal != null) {
            String cand = xReal.trim();
            if (isValidAddress(cand) && !isInternalAddress(cand)) {
                return cand;
            }
        }
        return remote;
    }

    /** 是否是合法 IP 字面量（IPv4 严格四段 0-255，IPv6 只做字符集校验） */
    static boolean isValidAddress(String ip) {
        if (ip == null) {
            return false;
        }
        String s = ip.trim();
        // IPv6 最长 45 字符，超过的必然是垃圾
        if (s.isEmpty() || s.length() > 45) {
            return false;
        }
        if (s.indexOf(':') >= 0) {
            for (int i = 0; i < s.length(); i++) {
                char c = s.charAt(i);
                boolean ok = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')
                        || (c >= 'A' && c <= 'F') || c == ':' || c == '.' || c == '%';
                if (!ok) {
                    return false;
                }
            }
            return true;
        }
        Matcher m = IPV4.matcher(s);
        if (!m.matches()) {
            return false;
        }
        for (int i = 1; i <= 4; i++) {
            if (Integer.parseInt(m.group(i)) > 255) {
                return false;
            }
        }
        return true;
    }

    /** 回环 / 内网 / 链路本地地址 —— 只有这些才可能是我们自己的反向代理 */
    static boolean isInternalAddress(String ip) {
        if (ip == null) {
            return false;
        }
        String s = ip.trim();
        if (s.isEmpty()) {
            return false;
        }
        if (s.equals("::1") || s.equals("0:0:0:0:0:0:0:1")) {
            return true;
        }
        // IPv4-mapped（::ffff:127.0.0.1），按点分部分再判一次
        if (s.regionMatches(true, 0, "::ffff:", 0, 7)) {
            return isInternalAddress(s.substring(7));
        }
        // fc00::/7 唯一本地、fe80::/10 链路本地
        if (s.regionMatches(true, 0, "fc", 0, 2) || s.regionMatches(true, 0, "fd", 0, 2)
                || s.regionMatches(true, 0, "fe80:", 0, 5)) {
            return true;
        }

        Matcher m = IPV4.matcher(s);
        if (!m.matches()) {
            return false;
        }
        int a = Integer.parseInt(m.group(1));
        int b = Integer.parseInt(m.group(2));
        return a == 127                                   // 回环
                || a == 10                                // 10/8
                || (a == 172 && b >= 16 && b <= 31)       // 172.16/12
                || (a == 192 && b == 168)                 // 192.168/16
                || (a == 169 && b == 254);                // 链路本地（云元数据服务）
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
