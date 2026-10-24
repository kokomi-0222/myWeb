// Tab 缩进的界面验收（真实浏览器 + 真实后端）：
//   [1] 发布框按 Tab → 插 4 空格，焦点留在输入框（不跳到「发布」）
//   [2] 管理员编辑「别人的帖子」→ Tab 缩进 → 保存后后端存的确实是 4 个空格
//   [3] 评论框按 Tab 同样插 4 空格；Shift+Tab 仍然能把焦点移出去
// 用法：node tools/test-tab-indent-ui.js（需 18080 后端 + 5194 预览）
// 只发一条临时帖子，跑完删掉。
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9407;
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

const TITLE = "Tab缩进临时帖";
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
      "--window-size=1280,1000",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-tab-indent",
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
  const until = async (expr, timeout = 10000) => {
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
  const shot = async (name, w = 1280, h = 1000) => {
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
  // 真实按键：Tab / Shift+Tab（modifiers: 8 = shift）
  const press = async (key, code, vk, modifiers = 0) => {
    await send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key,
      code,
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
      modifiers,
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code,
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
      modifiers,
    });
    await sleep(150);
  };
  const TAB = () => press("Tab", "Tab", 9);
  const SHIFT_TAB = () => press("Tab", "Tab", 9, 8);
  const type = async (text) => {
    await send("Input.insertText", { text });
    await sleep(120);
  };
  const state = async (selector) =>
    evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      return {
        value: el.value,
        start: el.selectionStart,
        focused: document.activeElement === el,
        active: (document.activeElement && (document.activeElement.tagName + '.' + document.activeElement.className)) || '',
      };
    })()`);

  try {
    // ---------- 准备：管理员登录 ----------
    await nav(BASE + "/");
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(TOKENS.admin)})`);
    await nav(BASE + "/space/home");
    await until(`!!document.querySelector('textarea.input-content')`, 12000);

    // ---------- 1. 新建帖子和编辑框里的 Tab ----------
    console.log("\n[1] 发布框：Tab 插 4 空格、焦点不跳");
    await evaluate(`(() => {
      const el = document.querySelector('textarea.input-content');
      el.focus(); el.setSelectionRange(0, 0);
    })()`);
    await TAB();
    let s = await state("textarea.input-content");
    check("Tab 插入 4 个空格", s.value === "    ", show(s.value));
    check("焦点仍留在输入框（没跳到发布按钮）", s.focused, s.active);

    await type("hello");
    await TAB();
    s = await state("textarea.input-content");
    check("打字后 Tab 继续插 4 空格", s.value === "    hello    ", show(s.value));
    check("光标落在空格之后", s.start === 13, String(s.start));

    await evaluate(`(() => {
      const el = document.querySelector('textarea.input-content');
      el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);

    // ---------- 2. 管理员编辑别人的帖子：Tab 缩进 + 保存 ----------
    console.log("\n[2] 管理员编辑他人帖子：Tab 缩进能被保存");
    const created = await api("POST", "/post/createPost", {
      title: TITLE,
      content: "成员的原帖\n第二行正文",
    }, TOKENS.member);
    tempId = created?.data?.id;
    check("临时帖子已创建（作者是 member）", !!tempId, JSON.stringify(created?.code));

    await nav(BASE + "/space/home?edit=" + tempId);
    const filled = await until(
      `(document.querySelector('textarea.input-content')?.value || '').includes('成员的原帖')`,
      12000
    );
    check("他人的帖子能回填进编辑框", filled);
    check(
      "按钮变成「保存修改」",
      (await evaluate(`document.querySelector('.comment-submit-button')?.textContent.trim()`)) ===
        "保存修改"
    );

    // 光标放在正文最前面，按 Tab 给首行缩进
    await evaluate(`(() => {
      const el = document.querySelector('textarea.input-content');
      el.focus(); el.setSelectionRange(0, 0);
    })()`);
    await TAB();
    s = await state("textarea.input-content");
    check("他人帖子首行 Tab 插入 4 空格", (s.value || "").startsWith("    "), show((s.value || "").slice(0, 10)));
    check("编辑他人帖子时焦点也没跑", s.focused, s.active);
    await shot("tab-indent-edit.png");

    await evaluate(`document.querySelector('.comment-submit-button').click()`);
    const saved = await until(
      `!location.search.includes('edit=') && (document.querySelector('textarea.input-content')?.value || '') === ''`,
      12000
    );
    check("保存后退出编辑状态", saved);

    const detail = await api("GET", "/post/" + tempId);
    const content = detail?.data?.content || "";
    check("后端存下的正文以 4 个空格开头", content.startsWith("    "), show(content.slice(0, 12)));
    check(
      "换行与后文都没被破坏",
      content === "    成员的原帖\n第二行正文",
      show(content)
    );

    // 再来一轮：Ctrl+Enter 快捷保存（Tab 被缩进占用后给键盘用户的出口）
    await nav(BASE + "/space/home?edit=" + tempId);
    await until(
      `(document.querySelector('textarea.input-content')?.value || '').includes('成员的原帖')`,
      12000
    );
    await evaluate(`(() => {
      const el = document.querySelector('textarea.input-content');
      el.focus(); el.setSelectionRange(el.value.length, el.value.length);
    })()`);
    await type("尾巴");
    await press("Enter", "Enter", 13, 2); // 2 = Ctrl
    check("Ctrl+Enter 能直接保存修改", await until(`!location.search.includes('edit=')`, 12000));
    const detail2 = await api("GET", "/post/" + tempId);
    check(
      "Ctrl+Enter 保存的内容正确",
      (detail2?.data?.content || "").endsWith("尾巴"),
      show(detail2?.data?.content)
    );

    // ---------- 3. 评论框 + Shift+Tab ----------
    console.log("\n[3] 评论框：Tab 插空格，Shift+Tab 仍可跳出");
    await nav(BASE + "/post/" + tempId);
    const hasCommentBox = await until(`!!document.querySelector('.comment-textarea')`, 12000);
    check("详情页评论框已渲染", hasCommentBox);
    if (hasCommentBox) {
      await evaluate(`document.querySelector('.comment-textarea').focus()`);
      await TAB();
      let c = await state(".comment-textarea");
      check("评论框 Tab 插 4 空格", c.value === "    ", show(c.value));
      check("评论框焦点没跳走", c.focused, c.active);

      await SHIFT_TAB();
      c = await state(".comment-textarea");
      check("Shift+Tab 仍然能把焦点移出输入框", !c.focused, c.active);
      await shot("tab-indent-comment.png");
    }
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
