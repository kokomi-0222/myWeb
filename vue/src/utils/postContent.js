/**
 * 帖子正文渲染：纯文本 → 「段落 + 代码块 + 行内代码」。
 *
 * 背景：正文一直是纯文本（textarea 提交），靠 CSS `white-space: pre-wrap` 还原换行。
 * 贴代码时缩进虽然能保住，但字体不是等宽、也没有代码块的样子，读起来很痛苦。
 *
 * 现在的规则（刻意保持「轻 Markdown」，只认代码这一种语法，其余一律按纯文本）：
 *   · ``` 或 ~~~ 围栏包起来的是代码块，围栏后可写语言名（```java）
 *   · 行内用一对反引号包住的短词是行内代码（`npm run build`）
 *   · 其它一切都是纯文本：先整体转义，再进行上面的解析
 *
 * 安全：所有用户输入都先 escapeHtml，再拼进我们自己的模板；
 * 高亮结果来自 highlight.js（内部已转义代码内容）。最后整串仍过一遍 DOMPurify，
 * 白名单只放我们自己会生成的标签，用户写的任何标签都不会被浏览器解释。
 *
 * 注意：这套规则也顺带关掉了旧的「整篇都是干净 HTML 标签时按 HTML 渲染」通道
 * （见 PostCard 里原来的 sanitizeContent）—— 那个口子对代码帖是灾难：
 * 写 `<b>粗体</b>` 本意是展示标签，却会被渲染成粗体。
 */
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import java from "highlight.js/lib/languages/java";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import plaintext from "highlight.js/lib/languages/plaintext";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import php from "highlight.js/lib/languages/php";
import kotlin from "highlight.js/lib/languages/kotlin";
import swift from "highlight.js/lib/languages/swift";
import ruby from "highlight.js/lib/languages/ruby";
import lua from "highlight.js/lib/languages/lua";
import dart from "highlight.js/lib/languages/dart";
import powershell from "highlight.js/lib/languages/powershell";
import yaml from "highlight.js/lib/languages/yaml";
import ini from "highlight.js/lib/languages/ini";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import diff from "highlight.js/lib/languages/diff";
import makefile from "highlight.js/lib/languages/makefile";
import nginx from "highlight.js/lib/languages/nginx";
import graphql from "highlight.js/lib/languages/graphql";
import protobuf from "highlight.js/lib/languages/protobuf";

// 按需注册，只带常用语言（全量 highlight.js 有近 200 种，gzip 后大十几倍）
const LANGUAGES = {
  javascript,
  typescript,
  java,
  python,
  sql,
  xml, // 同时管 html / vue / svg
  css,
  json,
  bash,
  plaintext,
  go,
  rust,
  c,
  cpp,
  csharp,
  php,
  kotlin,
  swift,
  ruby,
  lua,
  dart,
  powershell,
  yaml,
  ini, // 同时管 toml / conf / properties
  dockerfile,
  diff,
  makefile,
  nginx,
  graphql,
  protobuf,
};
Object.entries(LANGUAGES).forEach(([name, def]) => hljs.registerLanguage(name, def));

/** 常见别名 → 已注册的语言 key */
const ALIAS = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  python3: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  htm: "xml",
  html: "xml",
  vue: "xml",
  svg: "xml",
  xhtml: "xml",
  jsonc: "json",
  json5: "json",
  mysql: "sql",
  postgres: "sql",
  postgresql: "sql",
  sqlite: "sql",
  text: "plaintext",
  txt: "plaintext",
  plain: "plaintext",
  golang: "go",
  rs: "rust",
  // C 系：hljs 里 cpp 自带 c 的大部分规则，但两者分开注册，各走各的
  "c++": "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  "c#": "csharp",
  cs: "csharp",
  kt: "kotlin",
  kts: "kotlin",
  rb: "ruby",
  ps1: "powershell",
  pwsh: "powershell",
  yml: "yaml",
  toml: "ini",
  conf: "ini",
  cfg: "ini",
  properties: "ini",
  env: "ini",
  docker: "dockerfile",
  containerfile: "dockerfile",
  patch: "diff",
  make: "makefile",
  mk: "makefile",
  gql: "graphql",
  proto: "protobuf",
};

const escapeHtml = (text) =>
  String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** 行首（最多缩进 3 格）的围栏行 */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`~]*)\s*$/;

/**
 * 把正文切成「文本段 / 代码段」。
 * 围栏没闭合时不当代码块处理（只打了一半的 ``` 不该把后面全吞成代码）。
 *
 * @returns {Array<{type: "text", text: string} | {type: "code", lang: string, code: string}>}
 */
export function splitSegments(raw) {
  const lines = String(raw ?? "").replace(/\r\n?/g, "\n").split("\n");
  const segments = [];
  let buffer = [];
  let i = 0;

  const flushText = () => {
    if (!buffer.length) return;
    // 去掉段首段尾的空行：代码块自己带间距，不去掉会上下各多出两行空白
    let start = 0;
    let end = buffer.length;
    while (start < end && buffer[start].trim() === "") start++;
    while (end > start && buffer[end - 1].trim() === "") end--;
    const text = buffer.slice(start, end).join("\n");
    if (text !== "") segments.push({ type: "text", text });
    buffer = [];
  };

  while (i < lines.length) {
    const open = lines[i].match(FENCE_RE);
    if (!open) {
      buffer.push(lines[i]);
      i++;
      continue;
    }
    const marker = open[1];
    const lang = (open[2] || "").toLowerCase();
    // 找同类型（` 对 `、~ 对 ~）、长度不短于开围栏、且不带语言名的闭合行
    let close = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const m = lines[j].match(FENCE_RE);
      if (m && m[1][0] === marker[0] && m[1].length >= marker.length && !m[2]) {
        close = j;
        break;
      }
    }
    if (close === -1) {
      // 没闭合：按普通文本处理
      buffer.push(lines[i]);
      i++;
      continue;
    }
    flushText();
    segments.push({ type: "code", lang, code: lines.slice(i + 1, close).join("\n") });
    i = close + 1;
  }
  flushText();
  return segments;
}

/** 行内代码：输入已转义，所以直接替换反引号即可 */
function renderInlineCode(escaped) {
  return escaped.replace(/`([^`\n]+)`/g, '<code class="content-inline-code">$1</code>');
}

function renderTextSegment({ text }) {
  return `<div class="content-text">${renderInlineCode(escapeHtml(text))}</div>`;
}

function renderCodeSegment({ lang, code }) {
  const key = ALIAS[lang] || lang;
  const known = !!key && !!hljs.getLanguage(key) && key !== "plaintext";
  let inner;
  if (known) {
    try {
      inner = hljs.highlight(code, { language: key, ignoreIllegals: true }).value;
    } catch {
      inner = escapeHtml(code);
    }
  } else {
    inner = escapeHtml(code);
  }
  // 语言标签用作者写的原文（js 就显示 js），过长截断，避免撑坏顶栏
  const label = lang ? escapeHtml(lang.slice(0, 16)) : "code";
  return (
    `<div class="content-code" data-lang="${label}">` +
    `<div class="content-code__head">` +
    `<span class="content-code__lang">${label}</span>` +
    `<button type="button" class="content-code__copy" aria-label="复制代码">复制</button>` +
    `</div>` +
    `<pre class="content-code__pre"><code class="hljs">${inner}</code></pre>` +
    `</div>`
  );
}

/**
 * 只做解析与拼接，不做 DOM 清洗（纯函数，方便单测）。
 * @returns {string} HTML 片段
 */
export function renderBody(raw) {
  const segments = splitSegments(raw);
  if (!segments.length) return "";
  return segments
    .map((seg) => (seg.type === "code" ? renderCodeSegment(seg) : renderTextSegment(seg)))
    .join("");
}

// 只放行我们自己生成的标签/属性；用户写的标签在 renderBody 里就已经被转义了
const PURIFY_CONFIG = {
  ALLOWED_TAGS: ["div", "span", "pre", "code", "button"],
  ALLOWED_ATTR: ["class", "type", "data-lang", "aria-label"],
};

/** 交给 v-html 的最终 HTML */
export function renderPostContent(raw) {
  const html = renderBody(raw);
  if (!html) return "";
  return DOMPurify.sanitize(html, PURIFY_CONFIG);
}
