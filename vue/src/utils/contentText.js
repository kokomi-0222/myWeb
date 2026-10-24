/**
 * 正文 / 评论入库前的规范化。
 *
 * 后端 `TextUtils.normalizeContent` 做的是同一件事，两边规则必须一致：
 * 只去掉「结尾的空白」和「开头的空行」，**保留首行缩进**。
 *
 * 以前这里直接 `.trim()`，用户在第一行敲的空格在提交那一刻就被吃掉了。
 * 保存和列表显示都看不出异常（后面几行的缩进还在），
 * 只有下次点「编辑」把原文回填到输入框时才发现开头少了空格 ——
 * 看起来像"编辑时还原了"，其实是从没存进去过。
 */
export function normalizeContent(raw) {
  return String(raw ?? "")
    .replace(/[\s\u00a0]+$/, "")
    .replace(/^[\r\n]+/, "");
}

/** 判断是否「实质为空」：纯空格 / 空行都算空，不能用上面的结果直接比空串 */
export function isBlankContent(raw) {
  return normalizeContent(raw).trim() === "";
}
