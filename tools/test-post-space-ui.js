// 正文行首缩进的界面验收：在发布框里敲空格 → 发出去 → 卡片上真的缩进了 → 再编辑原文不变。
// 用法：node tools/test-post-space-ui.js（需 18080 后端 + 5194 预览）
// 只发一条临时帖子，跑完删掉。
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9406;
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

const TITLE = "缩进验收帖";

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
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-post-space",
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
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5, button: "none" });
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
  const apiGet = async (p) => {
    const r = await fetch(API + p, {
      headers: { Authorization: "Bearer " + TOKENS.admin },
    });
    return r.json();
  };

  // 把值塞进受 v-model 控制的输入框：必须用原生 setter 再派发 input 事件
  const fill = async (selector, value) =>
    evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return 'not-found';
      const proto = el.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return el.value.slice(0, 8);
    })()`);

  try {
    // ---------- 准备：登录态 ----------
    await nav(BASE + "/space/home");
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(TOKENS.admin)})`);
    await nav(BASE + "/space/home");
    const ready = await until(`!!document.querySelector('textarea.input-content')`, 12000);
    check("发布框已渲染", ready);

    // ---------- 1. 在框里敲带缩进的正文并发布 ----------
    console.log("\n[1] 发布：首行两个空格");
    const RAW = "  首行两个空格\n第二行正文\n第三行正文";
    await fill("input.input-title", TITLE);
    const typed = await fill("textarea.input-content", RAW);
    check("输入框里保留了两个空格", String(typed).startsWith("  "), JSON.stringify(typed));

    await evaluate(`document.querySelector('.comment-submit-button').click()`);
    const posted = await until(
      `[...document.querySelectorAll('.post-card')].some(el => el.textContent.includes('${TITLE}'))`,
      15000
    );
    check("发布后出现在列表里", posted);

    // ---------- 2. 后端存的是带缩进的原文 ----------
    console.log("\n[2] 接口回读");
    const mine = await apiGet(`/post/getMyPosts?pageNum=1&pageSize=10`).catch(() => null);
    let pid = mine?.data?.list?.find((p) => p.title === TITLE)?.id;
    if (!pid) {
      // 兜底：从页面里的卡片链接拿 id
      pid = await evaluate(`(() => {
        const card = [...document.querySelectorAll('.post-card')].find(el => el.textContent.includes('${TITLE}'));
        if (!card) return null;
        const a = card.querySelector('a[href*="/post/"]');
        const m = a && a.getAttribute('href').match(/\\/post\\/(\\d+)/);
        return m ? Number(m[1]) : null;
      })()`);
    }
    check("拿到临时帖子 id", !!pid, String(pid));

    const detail = await apiGet(`/post/${pid}`);
    const saved = detail?.data?.content ?? "";
    check("库里首行是 2 个空格", saved.startsWith("  "), JSON.stringify(saved.slice(0, 8)));
    check("行尾空白已清", saved === RAW, JSON.stringify(saved.slice(-4)));

    // ---------- 3. 卡片上真的缩进了 ----------
    console.log("\n[3] 列表渲染：缩进可见");
    const render = await evaluate(`(() => {
      const card = [...document.querySelectorAll('.post-card')].find(el => el.textContent.includes('${TITLE}'));
      if (!card) return { err: 'no-card' };
      // 正文渲染改成「代码块 + 文本块」后，文字在 .content-text 里（纯文本帖只有一个块）
      const el = card.querySelector('.post-card__content .content-text');
      if (!el) return { err: 'no-content' };
      const node = el.firstChild;
      if (!node || node.nodeType !== 3) return { err: 'first-child-not-text' };
      const cs = getComputedStyle(el);
      const base = el.getBoundingClientRect();
      const r1 = document.createRange(); r1.setStart(node, 0); r1.setEnd(node, 1);
      const r2 = document.createRange(); r2.setStart(node, 2); r2.setEnd(node, 3);
      return {
        text: el.textContent.slice(0, 8),
        whiteSpace: cs.whiteSpace,
        spaceWidth: +r1.getBoundingClientRect().width.toFixed(2),
        indent: +(r2.getBoundingClientRect().left - base.left).toFixed(2),
      };
    })()`);
    check("正文文本节点以 2 个空格开头", String(render.text).startsWith("  "), JSON.stringify(render.text));
    check("white-space 为 pre-wrap", render.whiteSpace === "pre-wrap", render.whiteSpace);
    check(
      "第一个字被推开约 2 个空格宽",
      render.indent > render.spaceWidth * 1.5,
      `indent=${render.indent} space=${render.spaceWidth}`
    );
    await shot("space-1-list.png");

    // ---------- 4. 再点编辑：原文带着空格回填 ----------
    console.log("\n[4] 编辑回填");
    await nav(BASE + "/space/home?edit=" + pid);
    await until(`!!document.querySelector('.edit-banner')`, 12000);
    const back = await evaluate(`(() => {
      const ta = document.querySelector('textarea.input-content');
      return ta ? ta.value.slice(0, 10) : null;
    })()`);
    check("输入框回填后仍有 2 个空格", String(back).startsWith("  "), JSON.stringify(back));
    await shot("space-2-edit-filled.png");

    // ---------- 5. 改成 4 个空格保存 ----------
    console.log("\n[5] 改成 4 个空格保存");
    const RAW2 = "    四个空格开头\n第二段";
    await fill("textarea.input-content", RAW2);
    await evaluate(`document.querySelector('.comment-submit-button').click()`);
    await sleep(1200);
    const detail2 = await apiGet(`/post/${pid}`);
    const saved2 = detail2?.data?.content ?? "";
    check("保存后首行 4 个空格", saved2.startsWith("    "), JSON.stringify(saved2.slice(0, 8)));
    check("保存后内容与输入一致", saved2 === RAW2, JSON.stringify(saved2));

    await nav(BASE + "/space/home");
    await until(
      `[...document.querySelectorAll('.post-card')].some(el => el.textContent.includes('${TITLE}'))`,
      15000
    );
    const render2 = await evaluate(`(() => {
      const card = [...document.querySelectorAll('.post-card')].find(el => el.textContent.includes('${TITLE}'));
      const el = card.querySelector('.post-card__content .content-text');
      const node = el.firstChild;
      const base = el.getBoundingClientRect();
      const r1 = document.createRange(); r1.setStart(node, 0); r1.setEnd(node, 1);
      const r2 = document.createRange(); r2.setStart(node, 4); r2.setEnd(node, 5);
      return {
        indent: +(r2.getBoundingClientRect().left - base.left).toFixed(2),
        spaceWidth: +r1.getBoundingClientRect().width.toFixed(2),
      };
    })()`);
    check(
      "卡片缩进变宽到 4 个空格",
      render2.indent > render2.spaceWidth * 3.2,
      `indent=${render2.indent} space=${render2.spaceWidth}`
    );
    await shot("space-3-four-spaces.png");

    // ---------- 6. 暗色 / 小屏 ----------
    console.log("\n[6] 暗色与小屏");
    await evaluate(`localStorage.setItem('kokomi-theme','dark');document.documentElement.classList.add('dark')`);
    await sleep(500);
    await shot("space-4-dark.png");
    await evaluate(`localStorage.setItem('kokomi-theme','light');document.documentElement.classList.remove('dark')`);
    await shot("space-5-mobile.png", 390, 844);
    const overflow = await evaluate(
      `document.documentElement.scrollWidth - document.documentElement.clientWidth`
    );
    check("390 小屏无横向溢出", overflow <= 0, String(overflow));
  } finally {
    // ---------- 清理 ----------
    console.log("\n[7] 清理临时帖子");
    const mine = await apiGet(`/post/getMyPosts?pageNum=1&pageSize=10`).catch(() => null);
    const target = mine?.data?.list?.find((p) => p.title === TITLE);
    if (target) {
      const r = await fetch(API + "/post/" + target.id, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + TOKENS.admin },
      });
      const j = await r.json();
      check("临时帖子已删除", j.code === 200, String(j.code));
    } else {
      check("临时帖子已删除", false, "没找到目标");
    }
    try {
      ws.close();
    } catch {}
    proc.kill();

    console.log(`\n===== ${PASS.length} 通过 / ${FAIL.length} 失败 =====`);
    if (FAIL.length) {
      console.log("失败项：");
      FAIL.forEach((f) => console.log("  - " + f));
      process.exit(1);
    }
  }
})();
