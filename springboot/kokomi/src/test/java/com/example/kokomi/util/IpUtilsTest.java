package com.example.kokomi.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * 取真实 IP 的回归测试。
 *
 * <p>背景：这里原来无条件取 {@code X-Forwarded-For} 的第一段，任何人手写一个头
 * 就能让每次请求落进不同的限流桶。实测 500 次请求带 500 个假 IP 全部通过，
 * 一次 429 都没吃到。所以下面这些用例是「限流到底有没有用」的前提。
 */
class IpUtilsTest {

    private static MockHttpServletRequest req(String remoteAddr, String... headers) {
        MockHttpServletRequest r = new MockHttpServletRequest();
        r.setRemoteAddr(remoteAddr);
        for (int i = 0; i + 1 < headers.length; i += 2) {
            r.addHeader(headers[i], headers[i + 1]);
        }
        return r;
    }

    @Test
    @DisplayName("公网直连：代理头是客户端自己写的，必须忽略")
    void directConnectionIgnoresForgedHeader() {
        assertEquals("203.0.113.9", IpUtils.getClientIP(
                req("203.0.113.9", "X-Forwarded-For", "1.2.3.4")));
        assertEquals("203.0.113.9", IpUtils.getClientIP(
                req("203.0.113.9", "X-Real-IP", "1.2.3.4")));
    }

    @Test
    @DisplayName("经 nginx 追加式 XFF：从右往左取，伪造的左端无效")
    void proxiedAppendedXffTakesRightmostPublicHop() {
        // nginx 用 $proxy_add_x_forwarded_for 时，客户端伪造的 1.2.3.4 会被追到左边
        assertEquals("198.51.100.7", IpUtils.getClientIP(
                req("127.0.0.1", "X-Forwarded-For", "1.2.3.4, 198.51.100.7")));
    }

    @Test
    @DisplayName("经 nginx 覆盖式 XFF：单跳直接可用")
    void proxiedSingleHop() {
        assertEquals("198.51.100.7", IpUtils.getClientIP(
                req("127.0.0.1", "X-Forwarded-For", "198.51.100.7")));
    }

    @Test
    @DisplayName("多层反代：跳过内网跳，取最靠右的公网地址")
    void multiLayerProxy() {
        assertEquals("198.51.100.7", IpUtils.getClientIP(
                req("10.0.0.5", "X-Forwarded-For", "198.51.100.7, 10.0.0.9")));
    }

    @Test
    @DisplayName("全是内网跳：退回最左，不能退化成 remote 让全站共用一个桶")
    void allInternalHops() {
        assertEquals("10.1.2.3", IpUtils.getClientIP(
                req("127.0.0.1", "X-Forwarded-For", "10.1.2.3, 127.0.0.1")));
    }

    @Test
    @DisplayName("垃圾 / 超长 / 越界代理头：回退 remoteAddr，不把垃圾当 key")
    void garbageHeaderFallsBack() {
        assertEquals("127.0.0.1", IpUtils.getClientIP(
                req("127.0.0.1", "X-Forwarded-For", "not-an-ip")));
        assertEquals("127.0.0.1", IpUtils.getClientIP(
                req("127.0.0.1", "X-Forwarded-For", "9".repeat(600))));
        assertEquals("127.0.0.1", IpUtils.getClientIP(
                req("127.0.0.1", "X-Forwarded-For", "999.1.1.1")));
    }

    @Test
    @DisplayName("没有任何代理头：就是 remoteAddr")
    void noHeader() {
        assertEquals("127.0.0.1", IpUtils.getClientIP(req("127.0.0.1")));
    }

    @Test
    @DisplayName("IPv6 回环也算内网，公网 IPv6 不算")
    void ipv6() {
        assertTrue(IpUtils.isInternalAddress("::1"));
        assertTrue(IpUtils.isInternalAddress("0:0:0:0:0:0:0:1"));
        assertTrue(IpUtils.isInternalAddress("fd00::1"));
        assertFalse(IpUtils.isInternalAddress("2001:db8::1"));
    }

    @Test
    @DisplayName("内网段边界：172.16/12 内是内网，172.32 不是")
    void internalRanges() {
        assertTrue(IpUtils.isInternalAddress("10.1.2.3"));
        assertTrue(IpUtils.isInternalAddress("172.16.0.1"));
        assertTrue(IpUtils.isInternalAddress("172.31.255.254"));
        assertFalse(IpUtils.isInternalAddress("172.32.0.1"));
        assertTrue(IpUtils.isInternalAddress("192.168.1.1"));
        assertFalse(IpUtils.isInternalAddress("192.169.1.1"));
        assertTrue(IpUtils.isInternalAddress("127.0.0.1"));
        assertFalse(IpUtils.isInternalAddress("8.8.8.8"));
    }
}
