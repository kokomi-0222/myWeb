// 账号管理 · 邮箱区验收：更换 / 解绑是带描边的胶囊按钮 + 弹窗表单，小字提示在弹窗底部
//   [1] 行内只有「邮箱 + 更换 + 解绑」，没有「换绑」这个词，也没有那行长说明
//   [2] 两个按钮都有 1px 描边
//   [3] 点「更换」→ 弹窗出现，标题「更换邮箱」，底部小字说清换完旧邮箱不能找回密码
//   [4] 点蒙层不关闭（防误触），点 × 才关
//   [5] 点「解绑」→ 标题「解绑邮箱」，底部小字说清「不能再邮箱登录 / 不能找回密码，会员与发帖不受影响」
//   [6] 390 宽下弹窗不横向溢出
// 用法：node tools/test-email-modal-ui.js（需 18080 后端 + 5194 预览 + tokens.json）
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9453;
const BASE = process.env.TEST_BASE || "http://localhost:5194";
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "shots");
const TOKENS = JSON.parse(
  fs.readFileSync(path.join(ROOT, "shots/tmp/tokens.json"), "utf-8")
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

(async () => {
  const proc = spawn(
    EDGE,
    [
      "--headless=new", "--disable-gpu", "--no-sandbox", "--no-proxy-server",
      `--remote-debugging-port=${DBG_PORT}`,
      "--window-size=1200,900",
      `--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-mail-modal-${process.pid}`,
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  await sleep(2500);
  let list = [];
  for (let i = 0; i < 12; i++) {
    try { list = await get("/json/list"); break; } catch { await sleep(500); }
  }
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable");
  await send("Runtime.enable");

  const setViewport = (width, height) =>
    send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: false,
    });

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) {
      throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || "eval error"));
    }
    return r.result?.result?.value;
  };
  const until = async (expr, timeout = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { if (await evaluate(expr)) return true; } catch { /* 页面切换中 */ }
      await sleep(150);
    }
    return false;
  };
  const shot = async (name) => {
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(s.result.data, "base64"));
    console.log("  截图 -> shots/" + name);
  };
  const nav = async (url) => {
    const origin = new URL(url).origin;
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) {
      let ok = false;
      try { ok = await evaluate(`location.origin === ${JSON.stringify(origin)}`); } catch { /* 导航中 */ }
      if (ok) break;
      await sleep(150);
    }
    await until("document.readyState === 'complete'");
    await sleep(600);
  };
  const clickText = async (sel, text) => {
    const ok = await evaluate(`(() => {
      const el = [...document.querySelectorAll(${JSON.stringify(sel)})]
        .find(e => (e.textContent || '').trim() === ${JSON.stringify(text)});
      if (!el) return false; el.click(); return true;
    })()`);
    if (!ok) throw new Error(`没找到文案为「${text}」的 ${sel}`);
    await sleep(400);
  };

  try {
    await setViewport(1200, 900);
    await nav(BASE + "/");
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(TOKENS.admin)})`);
    await nav(BASE + "/space/security");
    check("账号安全页加载", await until("!!document.querySelector('.sec-row--email')"));

    // ---------- [1] 行内文案与按钮 ----------
    const row = await evaluate(`(() => {
      const line = document.querySelector('.sec-row--email');
      const btns = [...line.querySelectorAll('.sec-btn')];
      return {
        texts: btns.map(b => (b.textContent || '').trim()),
        pageHasChangeOld: (document.body.innerText || '').includes('换绑'),
        pageHasHint: !!document.querySelector('.email-hint'),
        pageHasHintText: (document.body.innerText || '').includes('可以用来找回密码'),
        borders: btns.map(b => getComputedStyle(b).borderTopWidth + '/' + getComputedStyle(b).borderLeftWidth),
        bg: btns.map(b => getComputedStyle(b).backgroundColor),
      };
    })()`);
    console.log("  行内按钮:", JSON.stringify(row.texts), "边框:", JSON.stringify(row.borders));
    check("按钮文案是「更换 / 解绑」", row.texts.includes("更换") && row.texts.includes("解绑"),
      row.texts.join(","));
    check("页面上不再出现「换绑」", row.pageHasChangeOld === false);
    check("行内不再有那行长说明", row.pageHasHint === false && row.pageHasHintText === false);
    // 用户要求：两个按钮要「有边框」的胶囊样式（无边框像纯文字，点不准）
    check("按钮带 1px 描边（不是纯文字）",
      row.borders.every((b) => b === "1px/1px" || b === "1px"), row.borders.join(" | "));
    await shot("account-email-row.png");

    // ---------- [3] 更换弹窗 ----------
    await clickText(".sec-row--email .sec-btn", "更换");
    check("点「更换」弹出弹窗", await until("!!document.querySelector('.bind-dialog')"));
    const change = await evaluate(`(() => {
      const d = document.querySelector('.bind-dialog');
      if (!d) return null;
      return {
        title: (d.querySelector('.bind-title')?.textContent || '').trim(),
        hasPwd: !!d.querySelector('input[type="password"]'),
        hasEmailInput: !!d.querySelector('input[type="email"]'),
        tip: (d.querySelector('.bind-tip')?.textContent || '').replace(/\\s+/g, ' ').trim(),
        submit: (d.querySelector('.bind-submit')?.textContent || '').trim(),
        overlayZ: getComputedStyle(document.querySelector('.bind-overlay')).zIndex,
      };
    })()`);
    console.log("  更换弹窗:", JSON.stringify(change));
    check("标题是「更换邮箱」", change && change.title === "更换邮箱", change && change.title);
    check("要填当前密码 + 新邮箱", change && change.hasPwd && change.hasEmailInput);
    check("底部小字说明换完旧邮箱不能找回密码",
      change && change.tip.includes("旧邮箱") && change.tip.includes("找回密码"));
    check("确认按钮文案是「确认更换」", change && change.submit === "确认更换", change && change.submit);
    await shot("account-email-modal-change.png");

    // ---------- [4] 点蒙层不关闭 ----------
    await evaluate(`document.querySelector('.bind-overlay').click()`);
    await sleep(400);
    check("点蒙层不关闭（防误触）", await evaluate("!!document.querySelector('.bind-dialog')"));
    const closed = await evaluate(`(() => {
      document.querySelector('.bind-close').click();
      return true;
    })()`);
    await sleep(400);
    check("点 × 能关闭", closed && (await until("!document.querySelector('.bind-dialog')", 4000)));

    // ---------- [5] 解绑弹窗 ----------
    await clickText(".sec-row--email .sec-btn", "解绑");
    check("点「解绑」弹出弹窗", await until("!!document.querySelector('.bind-dialog')"));
    const unbind = await evaluate(`(() => {
      const d = document.querySelector('.bind-dialog');
      if (!d) return null;
      return {
        title: (d.querySelector('.bind-title')?.textContent || '').trim(),
        hasPwd: !!d.querySelector('input[type="password"]'),
        hasCode: !!d.querySelector('input[placeholder="6 位验证码"]'),
        tip: (d.querySelector('.bind-tip')?.textContent || '').replace(/\\s+/g, ' ').trim(),
        submit: (d.querySelector('.bind-submit')?.textContent || '').trim(),
        danger: !!d.querySelector('.bind-submit--danger'),
      };
    })()`);
    console.log("  解绑弹窗:", JSON.stringify(unbind));
    check("标题是「解绑邮箱」", unbind && unbind.title === "解绑邮箱", unbind && unbind.title);
    check("解绑只要密码、不要验证码", unbind && unbind.hasPwd && unbind.hasCode === false);
    // 解绑的后果要写全：不能再邮箱登录 + 不能找回密码，同时说明会员/发帖不受影响
    check("底部小字说明解绑后不能再用邮箱登录",
      unbind && unbind.tip.includes("不能再用这个邮箱登录"), unbind && unbind.tip);
    check("底部小字说明只影响登录方式、发帖评论不受影响",
      unbind && unbind.tip.includes("只影响") && unbind.tip.includes("发帖评论"),
      unbind && unbind.tip);
    check("确认按钮是红色的「确认解绑」",
      unbind && unbind.submit === "确认解绑" && unbind.danger);
    await shot("account-email-modal-unbind.png");

    // ---------- [6] 390 宽 ----------
    await setViewport(390, 844);
    await sleep(500);
    const m = await evaluate(`(() => {
      const d = document.querySelector('.bind-dialog');
      const r = d.getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        left: Math.round(r.left), right: Math.round(r.right),
      };
    })()`);
    check("390 宽弹窗不溢出、不横向滚动",
      m.scrollWidth <= m.clientWidth + 1 && m.left >= 0 && m.right <= m.clientWidth,
      JSON.stringify(m));
    await shot("account-email-modal-mobile.png");
  } catch (e) {
    check("脚本执行", false, String(e.message || e));
  } finally {
    try { proc.kill(); } catch { /* 已退出 */ }
  }

  console.log(`\n结果：${PASS.length} 通过 / ${FAIL.length} 失败`);
  process.exit(FAIL.length ? 1 : 0);
})();
