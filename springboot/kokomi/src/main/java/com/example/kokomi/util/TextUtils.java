package com.example.kokomi.util;

/**
 * 文本规范化。
 *
 * <p>正文/评论是纯文本，显示端用 CSS 的 {@code white-space: pre-wrap} 还原换行与空格，
 * 所以入库时不能再无脑 {@code trim()} —— 那样会把用户在正文第一行敲的缩进直接吃掉，
 * 而且用户只有在「再次编辑」时才会发现内容变了（保存那一下看不出差别）。
 *
 * <p>这里只清两样东西：结尾的空白（含结尾空行），以及开头的空行。
 * 行首空格、段间的空行全部原样保留。
 */
public final class TextUtils {

    private TextUtils() {
    }

    /**
     * 规范化正文：保留首行缩进，去掉尾部空白与开头空行。
     *
     * @param raw 原始文本，可为 null
     * @return 规范化后的文本，null 入参返回空串
     */
    public static String normalizeContent(String raw) {
        if (raw == null) {
            return "";
        }
        String s = raw.replaceAll("[\\s\\u00A0]+$", "");
        s = s.replaceAll("^[\\r\\n]+", "");
        return s;
    }

    /**
     * 是否「实质为空」。注意不能对规范化后的结果直接判空串：
     * 一串纯空格规范化后仍然不是空串。
     */
    public static boolean isBlank(String raw) {
        return raw == null || raw.replaceAll("[\\s\\u00A0]+$", "").trim().isEmpty();
    }
}
