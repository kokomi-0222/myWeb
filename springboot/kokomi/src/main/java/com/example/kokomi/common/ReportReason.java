package com.example.kokomi.common;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 举报理由白名单。
 * <p>
 * 前端只提交 reasonCode，中文文案由后端给出，好处是：
 * · 用户就算改了请求也塞不进自定义理由，后台列表不会被污染；
 * · 以后加理由只改这里，前端从 {@link #all()} 拉字典即可，不用发版。
 */
public final class ReportReason {

    private ReportReason() {
    }

    private static final Map<String, String> REASONS = new LinkedHashMap<>();

    static {
        REASONS.put("spam", "垃圾广告");
        REASONS.put("porn", "色情低俗");
        REASONS.put("abuse", "辱骂攻击");
        REASONS.put("illegal", "违法违规");
        REASONS.put("plagiarism", "抄袭侵权");
        REASONS.put("other", "其他");
    }

    /** code -> 中文名，顺序即前端展示顺序 */
    public static Map<String, String> all() {
        return REASONS;
    }

    public static boolean isValid(String code) {
        return code != null && REASONS.containsKey(code);
    }

    public static String labelOf(String code) {
        return REASONS.getOrDefault(code, "其他");
    }
}
