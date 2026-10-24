/**
 * 正文代码块渲染的纯逻辑验收（不依赖浏览器）。
 *
 * 跑法：node tools/test-post-code-render.mjs
 */
import { splitSegments, renderBody } from "../vue/src/utils/postContent.js";

const PASS = [];
const FAIL = [];
function check(name, ok, detail = "") {
  (ok ? PASS : FAIL).push(name);
  console.log((ok ? "  PASS " : "  FAIL ") + name + (detail ? `  (${detail})` : ""));
}
const show = (s) => JSON.stringify(s);

/** 粗略还原 HTML 文本，用于比对代码原文 */
function textOf(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

console.log("[分段]");
let segs = splitSegments("第一段\n```java\nint a = 1;\n```\n第二段");
check("识别出一个代码段", segs.filter((s) => s.type === "code").length === 1, String(segs.length));
check("语言名解析正确", segs.find((s) => s.type === "code")?.lang === "java");
check("代码内容完整", segs.find((s) => s.type === "code")?.code === "int a = 1;");
check("代码前后的文本各自成段", segs.filter((s) => s.type === "text").length === 2);

segs = splitSegments("```\ncode\n");
check("未闭合围栏不当代码块", segs.every((s) => s.type === "text" && s.text.includes("```")));
check("未闭合时不吞后面的内容", segs[0].text === "```\ncode");

segs = splitSegments("~~~python\nprint(1)\n~~~");
check("~~~ 围栏也支持", segs[0].type === "code" && segs[0].lang === "python");

segs = splitSegments("```\na\n```");
check("空语言名 → lang 为空串", segs[0].type === "code" && segs[0].lang === "", JSON.stringify(segs));

console.log("\n[渲染]");
let html = renderBody("普通正文\n第二行");
check("无代码时只有一个文本块", html === '<div class="content-text">普通正文\n第二行</div>', show(html));

html = renderBody("<b>不是标签</b> & <img src=x onerror=alert(1)>");
check("HTML 标签被转义成文本", html.includes("&lt;b&gt;") && !html.includes("<b>"), show(html.slice(0, 40)));
check("img 不会生成真标签", !/<img/i.test(html));

html = renderBody(" 首行两个空格\n第二行");
check("首行缩进保留", html.includes("> 首行两个空格"), show(html));

html = renderBody("```java\nint a = 1;\n```");
check("代码块容器存在", html.includes('class="content-code"') && html.includes('data-lang="java"'));
check("代码块使用 pre/code", html.includes('<pre class="content-code__pre"><code class="hljs">'));
check("java 代码被高亮", /class="hljs-(type|keyword|number)"/.test(html), show(html.slice(0, 200)));
check("代码正文没被改写", textOf(html).includes("int a = 1;"));
check("带复制按钮", html.includes("content-code__copy"));

html = renderBody("```js\nconst a = 1;\n```");
check("js 别名映射到 javascript", html.includes("hljs-keyword"));

html = renderBody("```cobol\nDISPLAY 'HI'.\n```");
check("未知语言照样出品代码块", html.includes('data-lang="cobol"') && html.includes("<pre"));
check("未知语言不高亮（无 span）", !html.includes("hljs-keyword"), show(html.slice(0, 120)));

html = renderBody("```html\n<div class=\"a\">x</div>\n```");
check("代码里的标签被转义", html.includes("&lt;") && !html.includes("<div class=\"a\""), show(html.slice(0, 200)));

html = renderBody("用 `npm run build` 构建");
check("行内代码渲染", html.includes('<code class="content-inline-code">npm run build</code>'), show(html));
check("行内代码保留原文字", !html.includes("`npm"));

html = renderBody("行内 `<script>alert(1)</script>` 示例");
check("行内代码里的标签也转义", html.includes("&lt;script&gt;") && !html.includes("<script>"));

html = renderBody("```\nconst s = `a${b}`;\n```");
check("代码块里的反引号不被当成行内码", !html.includes("content-inline-code"), show(html.slice(0, 140)));

html = renderBody("```\n  if (x) {\n    y();\n  }\n```");
check("代码缩进原样保留", textOf(html) === "  if (x) {\n    y();\n  }" || textOf(html).endsWith("  if (x) {\n    y();\n  }"), show(textOf(html)));

html = renderBody("前文\n\n```js\nlet a;\n```\n\n后文");
check("代码块上下不多出空行", textOf(html).startsWith("前文") && textOf(html).endsWith("后文"), show(textOf(html)));

html = renderBody("");
check("空内容返回空串", html === "");

html = renderBody("```\n\n```");
check("空代码块不报错", html.includes("content-code") && html.includes('<code class="hljs"></code>'), show(html));

console.log("\n[语言覆盖]");
// 每种语言一段最典型的代码，验证真能着色（有 hljs-xxx 的 span 出来）
const LANG_CASES = [
  ["go", 'package main\nfunc main() { fmt.Println("hi") }'],
  ["rust", 'fn main() { let x: i32 = 1; println!("{}", x); }'],
  ["c", "#include <stdio.h>\nint main(void) { return 0; }"],
  ["cpp", "#include <iostream>\nint main() { std::cout << 1; }"],
  ["csharp", "public class A { void B() { var x = 1; } }"],
  ["php", "<?php echo $a; ?>"],
  ["kotlin", "fun main() { val x = 1 }"],
  ["swift", "let x: Int = 1"],
  ["ruby", "def foo; puts 1; end"],
  ["lua", "local x = 1"],
  ["dart", "void main() { var x = 1; }"],
  ["powershell", "if ($true) { Write-Host 1 }"],
  ["yaml", "key: value\nlist:\n  - a"],
  ["ini", "[server]\nport = 80"],
  ["dockerfile", "FROM node:22\nRUN npm i"],
  ["diff", "-old\n+new"],
  ["makefile", "all:\n\techo hi"],
  ["nginx", "server { listen 80; }"],
  ["graphql", "query { user { id } }"],
  ["protobuf", "message A { int32 x = 1; }"],
];
const missed = [];
for (const [lang, code] of LANG_CASES) {
  const h = renderBody("```" + lang + "\n" + code + "\n```");
  const colored = /class="hljs-[a-z_]+"/.test(h);
  if (!colored) missed.push(lang);
}
check(`${LANG_CASES.length} 种语言都能着色`, missed.length === 0, missed.join(",") || "全部通过");

// 别名：写的是别名，标签仍显示原文，但必须着色
const ALIAS_CASES = [
  ["c++", "int main() { return 0; }"],
  ["cs", "var x = 1;"],
  ["toml", "[s]\na = 1"],
  ["yml", "a: 1"],
  ["golang", "package main"],
  ["rs", "fn main() {}"],
  ["kt", "fun a() {}"],
  ["rb", "x = 1"],
  ["sh", "if [ -f a ]; then echo 1; fi"],
  ["proto", "message A { int32 x = 1; }"],
];
const aliasMissed = [];
for (const [lang, code] of ALIAS_CASES) {
  const h = renderBody("```" + lang + "\n" + code + "\n```");
  const colored = /class="hljs-[a-z_]+"/.test(h);
  const labelOk = h.includes(`data-lang="${lang.replace(/&/g, "&amp;")}"`);
  if (!colored || !labelOk) aliasMissed.push(lang);
}
check(`${ALIAS_CASES.length} 个别名都能着色且标签显示原文`, aliasMissed.length === 0, aliasMissed.join(",") || "全部通过");

console.log("");
console.log(`通过 ${PASS.length} 项，失败 ${FAIL.length} 项`);
if (FAIL.length) {
  FAIL.forEach((n) => console.log("  ✗ " + n));
  process.exit(1);
}
