/**
 * Tab 缩进逻辑验收（纯函数 + 假 DOM，不需要起服务）。
 *
 * 跑法：node tools/test-tab-indent.mjs
 */
import { applyTabIndent, insertIndent, handleTabIndent, TAB_UNIT } from "../vue/src/utils/textareaTab.js";

const PASS = [];
const FAIL = [];

function check(name, ok, detail = "") {
  (ok ? PASS : FAIL).push(name);
  console.log((ok ? "  PASS " : "  FAIL ") + name + (detail ? `  (${detail})` : ""));
}

function show(s) {
  return JSON.stringify(s);
}

function fakeEl(value, start = value.length, end = start, maxLength = -1) {
  return {
    value,
    selectionStart: start,
    selectionEnd: end,
    maxLength,
    readOnly: false,
    disabled: false,
    events: [],
    focus() {},
    setRangeText(text, from, to) {
      this.value = this.value.slice(0, from) + text + this.value.slice(to);
    },
    setSelectionRange(a, b) {
      this.selectionStart = a;
      this.selectionEnd = b;
    },
    dispatchEvent(ev) {
      this.events.push(ev.type);
    },
  };
}

// ---------- 纯函数 ----------
console.log("[applyTabIndent]");

let r = applyTabIndent("", 0, 0);
check("空输入框插入 4 空格", r && r.value === TAB_UNIT && r.selStart === 4, show(r?.value));

r = applyTabIndent("abcd", 2, 2);
check("光标在中间插入", r.value === "ab" + TAB_UNIT + "cd" && r.selStart === 6, show(r.value));

r = applyTabIndent("第一行\n第二行", 4, 4);
check("行首缩进不多加换行", r.value === "第一行\n" + TAB_UNIT + "第二行" && r.value.split("\n").length === 2, show(r.value));

r = applyTabIndent("abc", 0, 3);
check("选中单行不删除文字，只在行首补缩进", r.value === TAB_UNIT + "abc", show(r.value));
check("选中单行后选区保留", r.selStart === 4 && r.selEnd === 7, `${r.selStart}-${r.selEnd}`);

r = applyTabIndent("aa\nbb\ncc", 1, 7);
check("选中多行每行都缩进", r.value === "    aa\n    bb\n    cc", show(r.value));
check("多行缩进后选区仍框住同一段原文", r.value.slice(r.selStart, r.selEnd) === "a\n    bb\n    c", show(r.value.slice(r.selStart, r.selEnd)));

r = applyTabIndent("aa\nbb", 5, 5);
check("第二行光标处缩进", r.value === "aa\nbb" + TAB_UNIT, show(r.value));

r = applyTabIndent("abc", 0, 0, { maxLength: 8 });
check("未到上限可以插", r && r.value.length === 7, show(r?.value));
r = applyTabIndent("abcdef", 6, 6, { maxLength: 6 });
check("到字数上限不插、不改内容", r === null);

r = applyTabIndent("缩进", 0, 0, { unit: "\t" });
check("unit 可配置", r.value === "\t缩进", show(r.value));

// ---------- 事件处理 ----------
console.log("[insertIndent / handleTabIndent]");

let el = fakeEl("hello", 5, 5);
let prevented = false;
handleTabIndent({ key: "Tab", currentTarget: el, preventDefault: () => (prevented = true) });
check("Tab 被拦截（焦点不跳走）", prevented);
check("文本插入 4 空格", el.value === "hello" + TAB_UNIT, show(el.value));
check("光标停在空格后", el.selectionStart === 9 && el.selectionEnd === 9);
check("触发了 input 事件（v-model 同步）", el.events.includes("input"), el.events.join(","));

prevented = false;
el = fakeEl("hello", 5, 5);
handleTabIndent({ key: "Tab", shiftKey: true, currentTarget: el, preventDefault: () => (prevented = true) });
check("Shift+Tab 不拦截（保留键盘跳焦点）", !prevented && el.value === "hello");

prevented = false;
el = fakeEl("hello", 5, 5);
handleTabIndent({ key: "Tab", ctrlKey: true, currentTarget: el, preventDefault: () => (prevented = true) });
check("Ctrl+Tab 不拦截", !prevented);

el = fakeEl("abc", 0, 0);
handleTabIndent({ key: "a", currentTarget: el, preventDefault: () => {} });
check("其它按键不处理", el.value === "abc");

el = fakeEl("abc", 3, 3, 3);
const before = el.value;
const changed = insertIndent(el);
check("超上限返回 false 且文本不变", changed === false && el.value === before);

el = fakeEl("abc", 1, 1);
el.readOnly = true;
handleTabIndent({ key: "Tab", currentTarget: el, preventDefault: () => {} });
check("只读输入框不处理", el.value === "abc");

// 选区整体缩进走真实 setRangeText
el = fakeEl("aa\nbb", 0, 5);
insertIndent(el);
check("多行选区整体缩进（DOM 路径）", el.value === "    aa\n    bb", show(el.value));

console.log("");
console.log(`通过 ${PASS.length} 项，失败 ${FAIL.length} 项`);
if (FAIL.length) {
  FAIL.forEach((n) => console.log("  ✗ " + n));
  process.exit(1);
}
