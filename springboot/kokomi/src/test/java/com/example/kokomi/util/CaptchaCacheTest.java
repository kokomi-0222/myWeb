package com.example.kokomi.util;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 验证码缓存的容量策略回归测试。
 *
 * <p>背景：这里原来「满了返回 false，接口回 429 系统繁忙」。而 /captcha 是登录、
 * 注册、找回密码、绑邮箱的公共入口，攻击者灌满这 1000 条就能让所有正常用户
 * 拿不到图 —— 花 1000 个请求换一次全站登录不可用。现在改成淘汰最老的。
 */
class CaptchaCacheTest {

    private static final int FLOOD = 1200;

    @Test
    @DisplayName("写满之后淘汰最老的，最新的码必须还能用")
    void evictsOldestInsteadOfRejecting() {
        for (int i = 0; i < FLOOD; i++) {
            CaptchaCache.put("cap-" + i, "AB12");
        }
        // 最后写进去的不能被挤掉：那是一个正在填图的人手里的码
        assertTrue(CaptchaCache.verify("cap-" + (FLOOD - 1), "AB12"),
                "最新的验证码被淘汰了，说明淘汰方向反了");
        // 最早那批应该已经被淘汰
        assertFalse(CaptchaCache.verify("cap-0", "AB12"),
                "最老的验证码还在，说明根本没有淘汰");
    }

    @Test
    @DisplayName("校验通过时不删除条目（供发码链路后面再 consume）")
    void verifyKeepsEntry() {
        CaptchaCache.put("keep-me", "XY99");
        assertTrue(CaptchaCache.verify("keep-me", "xy99"));
        assertTrue(CaptchaCache.verify("keep-me", "XY99"), "第一次校验后条目应当仍存在");
        CaptchaCache.remove("keep-me");
        assertFalse(CaptchaCache.verify("keep-me", "XY99"), "remove 之后不应再通过");
    }

    @Test
    @DisplayName("同一个码错满 3 次就作废，第 4 次填对也过不去")
    void invalidatesAfterMaxFail() {
        CaptchaCache.put("fail-3", "QQ77");
        assertFalse(CaptchaCache.verify("fail-3", "AAAA"));
        assertFalse(CaptchaCache.verify("fail-3", "BBBB"));
        assertFalse(CaptchaCache.verify("fail-3", "CCCC"));
        assertFalse(CaptchaCache.verify("fail-3", "QQ77"), "错满 3 次后正确的码也不该通过");
    }
}
