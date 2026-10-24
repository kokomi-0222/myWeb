/**
 * 多行输入框里的 Tab 缩进。
 *
 * 浏览器默认的 Tab 行为是「切换焦点」：发布框下面正好是「发布」按钮，
 * 想缩进一段话按一下 Tab，光标直接跑出输入框，等于没法用 Tab 排版。
 * 这里改成插入 4 个空格（和常见编辑器的 tabSize=4 一致）。
 *
 * 刻意保留的组合键：
 * - Shift+Tab：反向切换焦点，键盘用户依然能离开输入框（不拦）
 * - Ctrl / Alt / Meta + Tab：浏览器 / 系统的切窗口快捷键（不拦）
 *
 * 正文是纯文本 + white-space: pre-wrap，空格会原样显示，
 * 所以插入的 4 个空格就是最终的缩进宽度，不会被折叠掉。
 */
export const TAB_UNIT = "    "; // 4 个空格

/**
 * 计算按键后的新文本与选区（纯函数，方便单测）。
 *
 * 规则：
 * - 没有选区 → 在光标处插入一层缩进
 * - 有选区   → 选区所在行整体缩进（单行选区就是在行首补一层），
 *              绝不把选中的文字替换掉；缩进后选区原样保留
 *
 * @param {string} value      当前文本
 * @param {number} start      选区起点
 * @param {number} end        选区终点
 * @param {{unit?: string, maxLength?: number}} [opts]
 * @returns {{value: string, from: number, to: number, text: string,
 *            selStart: number, selEnd: number} | null}
 *          返回 null 表示这次不处理（例如已到字数上限）
 */
export function applyTabIndent(value, start, end, opts = {}) {
  const unit = opts.unit ?? TAB_UNIT;
  const src = String(value ?? "");
  const from = Math.min(Math.max(start ?? src.length, 0), src.length);
  const to = Math.min(Math.max(end ?? from, from), src.length);
  const hasSelection = to > from;

  let replaceFrom = from;
  let replaceTo = to;
  let text = unit;
  let selStart = from + unit.length;
  let selEnd = from + unit.length;

  if (hasSelection) {
    // 选区所在行整体缩进：从选区第一行的行首，到选区终点
    const lineStart = src.lastIndexOf("\n", from - 1) + 1;
    const block = src.slice(lineStart, to);
    const lines = block.split("\n");
    text = lines.map((line) => unit + line).join("\n");
    replaceFrom = lineStart;
    replaceTo = to;
    // 每行都多了一层，选区两端按「行数 × 一层」右移，视觉上文字位置不变
    selStart = from + unit.length;
    selEnd = to + unit.length * lines.length;
  }

  const max = Number(opts.maxLength);
  if (max > 0 && src.length - (replaceTo - replaceFrom) + text.length > max) {
    // 到字数上限了：宁可不动，也不能把用户已经写好的内容截断
    return null;
  }

  return {
    value: src.slice(0, replaceFrom) + text + src.slice(replaceTo),
    from: replaceFrom,
    to: replaceTo,
    text,
    selStart,
    selEnd,
  };
}

/** 在 textarea / input 上执行一次缩进 */
export function insertIndent(el, unit = TAB_UNIT) {
  if (!el) return false;
  const result = applyTabIndent(el.value, el.selectionStart, el.selectionEnd, {
    unit,
    maxLength: el.maxLength,
  });
  if (!result) return false;

  el.focus();
  // setRangeText 会保留原生的撤销栈（直接改 value 会把 Ctrl+Z 清空）
  el.setRangeText(result.text, result.from, result.to, "end");
  el.setSelectionRange(result.selStart, result.selEnd);
  // v-model 靠 input 事件同步，输入框自适应高度也挂在同一个事件上
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

/**
 * 直接挂到 textarea 的 @keydown 上即可：`@keydown="handleTabIndent"`
 */
export function handleTabIndent(e, unit = TAB_UNIT) {
  if (!e || e.key !== "Tab") return;
  if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
  const el = e.currentTarget;
  if (!el || el.readOnly || el.disabled) return;
  e.preventDefault();
  insertIndent(el, unit);
}
