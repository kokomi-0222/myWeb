// 帖子代码块的界面验收（真实浏览器 + 真实后端）：
//   [1] ``` 围栏渲染成代码块、等宽、有高亮、长行能横向滚动
//   [2] 行内代码、未闭合围栏、XSS 片段都按预期处理
//   [3] 复制按钮真的能复制出原文
//   [4] 暗色主题下配色正常
// 用法：node tools/test-post-code-ui.js（需 18080 后端 + 5194 预览）
// 只发一条临时帖子，跑完删掉。
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9408;
const BASE = process.env.TEST_BASE || "http://localhost:5194";
const API = process.env.TEST_API || "http://localhost:18080";
const OUT = path.resolve(__dirname, "../shots");
const TOKENS = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../shots/tmp/tokens.json"), "utf-8")
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PASS = [];
const FAIL = [];

function check(name, ok, detail = "") {
  (ok ? PASS : FAIL).push(name);
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
}
const show = (s) => JSON.stringify(s);

const get = (p) =>
  new Promise((res, rej) => {
    http
      .get({ host: "127.0.0.1", port: DBG_PORT, path: p }, (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => res(JSON.parse(d)));
      })
      .on("error", rej);
  });

const api = async (method, p, body, token = TOKENS.admin) => {
  const r = await fetch(API + p, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
};

const TITLE = "代码块验收帖";
const CODE_JAVA = `public class Demo {
    public static void main(String[] args) {
        System.out.println("hello");
    }
}`;
const CODE_LONG = "const veryLongVariableName = someFunction(argumentOne, argumentTwo, argumentThree, argumentFour, argumentFive);";
const CODE_GO = `package main

import "fmt"

func main() {
\tfmt.Println("go")
}`;
const CONTENT = [
  "先看一段 Java，行内命令是 `npm run build`。",
  "",
  "```java",
  CODE_JAVA,
  "```",
  "",
  "再看一行特别长的 JS：",
  "",
  "```js",
  CODE_LONG,
  "```",
  "",
  "再看一段 Go：",
  "",
  "```go",
  CODE_GO,
  "```",
  "",
  "没闭合的围栏不该吞掉后面：",
  "",
  "```",
  "这行只是普通文本",
].join("\n");
const XSS = `<img src=x onerror="window.__xss=1">

<b>粗体标签也应当显示成文字</b>`;

let tempId = null;

(async () => {
  const proc = spawn(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-proxy-server",
      `--remote-debugging-port=${DBG_PORT}`,
      "--window-size=1280,1400",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-post-code",
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  await sleep(2500);
  let list = [];
  for (let i = 0; i < 12; i++) {
    try {
      list = await get("/json/list");
      break;
    } catch {
      await sleep(500);
    }
  }
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((r) => {
      const id = ++seq;
      pending.set(id, r);
      ws.send(JSON.stringify({ id, method, params }));
    });
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable");
  await send("Runtime.enable");

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.result?.exceptionDetails) {
      throw new Error(
        JSON.stringify(r.result.exceptionDetails.exception?.description || "eval error")
      );
    }
    return r.result?.result?.value;
  };
  const until = async (expr, timeout = 12000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try {
        if (await evaluate(expr)) return true;
      } catch {
        /* 页面切换中 */
      }
      await sleep(150);
    }
    return false;
  };
  const shot = async (name, w = 1280, h = 1400) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: w < 500,
    });
    await sleep(400);
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(s.result.data, "base64"));
    console.log("  截图 -> shots/" + name);
  };
  const nav = async (url) => {
    await send("Page.navigate", { url });
    await until(`document.readyState === 'complete'`, 15000);
    await sleep(500);
  };

  // 只处理标题为 TITLE 的那张卡片
  const CARD = `[...document.querySelectorAll('.post-card')].find(c => c.querySelector('.post-card__title')?.textContent.trim() === ${JSON.stringify(TITLE)})`;

  try {
    // ---------- 准备 ----------
    const created = await api(
      "POST",
      "/post/createPost",
      { title: TITLE, content: CONTENT + "\n\n" + XSS },
      TOKENS.member
    );
    tempId = created?.data?.id;
    check("临时帖子已创建", !!tempId, JSON.stringify(created?.code));

    await nav(BASE + "/");
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(TOKENS.admin)})`);
    await nav(BASE + "/");
    const cardReady = await until(`!!(${CARD})`, 15000);
    check("首页出现这条帖子", cardReady);

    // ---------- 1. 代码块结构 ----------
    console.log("\n[1] 代码块渲染");
    const info = await evaluate(`(() => {
      const card = ${CARD};
      const body = card.querySelector('.post-card__content');
      const blocks = [...body.querySelectorAll('.content-code')];
      const pre = blocks[0]?.querySelector('pre');
      const codeEl = pre?.querySelector('code');
      const cs = codeEl ? getComputedStyle(codeEl) : null;
      const keyword = blocks[0]?.querySelector('.hljs-keyword, .hljs-type, .hljs-title');
      return {
        blocks: blocks.length,
        langs: blocks.map(b => b.getAttribute('data-lang')),
        copyBtns: body.querySelectorAll('.content-code__copy').length,
        fontFamily: cs?.fontFamily || '',
        whiteSpace: cs?.whiteSpace || '',
        keywordColor: keyword ? getComputedStyle(keyword).color : '',
        goKeywordColor: (() => {
          const k = blocks[2]?.querySelector('.hljs-keyword, .hljs-built_in, .hljs-title');
          return k ? getComputedStyle(k).color : '';
        })(),
        goText: blocks[2]?.querySelector('pre')?.textContent || '',
        bodyColor: getComputedStyle(body).color,
        text: pre?.textContent || '',
        inline: body.querySelectorAll('.content-inline-code').length,
        inlineText: body.querySelector('.content-inline-code')?.textContent || '',
        hasUnclosedFence: body.innerText.includes('这行只是普通文本'),
        imgs: body.querySelectorAll('img').length,
        xssRan: !!window.__xss,
        boldTag: body.querySelectorAll('b').length,
        bodyText: body.innerText,
      };
    })()`);
    check("渲染出 3 个代码块", info.blocks === 3, String(info.blocks));
    check("语言标签正确", JSON.stringify(info.langs) === '["java","js","go"]', JSON.stringify(info.langs));
    check("每个代码块都有复制按钮", info.copyBtns === 3, String(info.copyBtns));
    check("代码用等宽字体", /mono|Consolas|Menlo/i.test(info.fontFamily), info.fontFamily.slice(0, 40));
    check("代码不折行（white-space: pre）", info.whiteSpace === "pre", info.whiteSpace);
    check("代码原文完整", info.text === CODE_JAVA, show(info.text.slice(0, 30)));
    check(
      "语法高亮真的上了色（颜色不同于正文）",
      !!info.keywordColor && info.keywordColor !== info.bodyColor,
      `${info.keywordColor} vs ${info.bodyColor}`
    );
    check("行内代码渲染", info.inline === 1 && info.inlineText === "npm run build", show(info.inlineText));
    check(
      "新加的 go 也有语法配色",
      !!info.goKeywordColor && info.goKeywordColor !== info.bodyColor,
      `${info.goKeywordColor} vs ${info.bodyColor}`
    );
    check("go 代码原样保留（含 Tab 缩进）", info.goText === CODE_GO, show(info.goText.slice(0, 40)));
    check("未闭合围栏后面的文字仍是正文", info.hasUnclosedFence);
    check("XSS：页面没有插入 img", info.imgs === 0);
    check("XSS：内联脚本没被执行", info.xssRan === false);
    check("XSS：<b> 显示成文字而不是粗体标签", info.boldTag === 0 && info.bodyText.includes("<b>粗体标签"));

    // ---------- 2. 长行横向滚动 ----------
    console.log("\n[2] 长代码行");
    const scroll = await evaluate(`(() => {
      const card = ${CARD};
      const pre = card.querySelectorAll('.content-code pre')[1];
      return { sw: pre.scrollWidth, cw: pre.clientWidth, overflowX: getComputedStyle(pre).overflowX };
    })()`);
    check("长行超出时横向可滚动", scroll.sw > scroll.cw + 20, `${scroll.sw} > ${scroll.cw}`);
    check("横向滚动条样式正确", scroll.overflowX === "auto", scroll.overflowX);

    await shot("post-code-light.png");

    // ---------- 3. 复制按钮 ----------
    console.log("\n[3] 复制按钮");
    await send("Page.bringToFront");
    await send("Browser.grantPermissions", {
      origin: BASE,
      permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
    });
    let copied = null;
    let copyErr = "";
    try {
      copied = await evaluate(`(async () => {
        const card = ${CARD};
        const block = card.querySelectorAll('.content-code')[0];
        const btn = block.querySelector('.content-code__copy');
        btn.click();
        await new Promise(r => setTimeout(r, 300));
        let text = "";
        try {
          text = await navigator.clipboard.readText();
        } catch (e) {
          text = "READ_FAIL: " + e.message;
        }
        return { text, label: btn.textContent };
      })()`);
    } catch (e) {
      copyErr = e.message;
    }
    check(
      "复制到剪贴板的是代码原文",
      // Windows 剪贴板会把 \n 存成 \r\n，比较前先统一
      !!copied && copied.text.replace(/\r\n/g, "\n") === CODE_JAVA,
      copyErr || show((copied?.text || "").slice(0, 40))
    );
    check("按钮反馈变成「已复制」", copied?.label === "已复制", copied?.label || copyErr);

    // ---------- 4. 暗色 ----------
    console.log("\n[4] 暗色主题");
    await evaluate(`localStorage.setItem('kokomi-theme', 'dark')`);
    await nav(BASE + "/");
    await until(`document.documentElement.classList.contains('dark')`, 8000);
    await until(`!!(${CARD})`, 12000);
    const dark = await evaluate(`(() => {
      const card = ${CARD};
      const code = card.querySelector('.content-code');
      const codeEl = code.querySelector('pre code');
      const inline = card.querySelector('.content-inline-code');
      return {
        isDark: document.documentElement.classList.contains('dark'),
        blockBg: getComputedStyle(code).backgroundColor,
        textColor: getComputedStyle(codeEl).color,
        inlineBg: inline ? getComputedStyle(inline).backgroundColor : '',
      };
    })()`);
    check("暗色模式生效", dark.isDark === true);
    check("代码块底色是深色", dark.blockBg === "rgb(13, 17, 23)", dark.blockBg);
    check("代码文字是浅色", dark.textColor === "rgb(201, 209, 217)", dark.textColor);
    await shot("post-code-dark.png");
    await evaluate(`localStorage.setItem('kokomi-theme', 'light')`);

    // ---------- 5. 详情页同样生效 ----------
    console.log("\n[5] 详情页");
    await nav(BASE + "/post/" + tempId);
    const detailOk = await until(`!!document.querySelector('.content-code .hljs')`, 12000);
    check("详情页也渲染代码块", detailOk);

    // ---------- 6. 手机窄屏不撑破页面 ----------
    console.log("\n[6] 390 宽手机视口");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await nav(BASE + "/");
    await until(`!!(${CARD})`, 12000);
    const mobile = await evaluate(`(() => {
      const card = ${CARD};
      const pre = card.querySelector('.content-code pre');
      return {
        pageWidth: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
        preScrollable: pre.scrollWidth > pre.clientWidth,
      };
    })()`);
    check("页面没有横向溢出", mobile.pageWidth <= mobile.viewport + 1, `${mobile.pageWidth} <= ${mobile.viewport}`);
    check("代码在窄屏内部滚动", mobile.preScrollable === true);
    await shot("post-code-mobile.png", 390, 844);
  } finally {
    try {
      if (tempId) await api("DELETE", "/post/" + tempId);
    } catch (e) {
      console.log("清理临时帖子失败：" + e.message);
    }
    ws.close();
    proc.kill();
    console.log("");
    console.log(`通过 ${PASS.length} 项，失败 ${FAIL.length} 项`);
    FAIL.forEach((n) => console.log("  ✗ " + n));
    process.exit(FAIL.length ? 1 : 0);
  }
})();
