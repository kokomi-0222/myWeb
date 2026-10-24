// 后台入口改造的补充验证：
//   1) /space/users 旧地址应重定向到 /admin/users
//   2) 个人中心左侧菜单只剩 4 项，没有「用户管理」
//   3) 普通用户顶栏没有后台图标
// 用法：TEST_BASE=http://localhost:5193 node tools/test-admin-redirect.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9389;
const BASE = process.env.TEST_BASE || "http://localhost:5193";
const TOKENS = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../shots/tmp/tokens.json"), "utf-8")
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (p) =>
  new Promise((res, rej) => {
    http
      .get({ host: "127.0.0.1", port: PORT, path: p }, (r) => {
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
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-proxy-server",
      `--remote-debugging-port=${PORT}`,
      "--window-size=1440,900",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-admin-redirect-test",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  await sleep(2500);
  let list = [];
  for (let i = 0; i < 10; i++) {
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
  const send = (m, p = {}) =>
    new Promise((r) => {
      const id = ++seq;
      pending.set(id, r);
      ws.send(JSON.stringify({ id, method: m, params: p }));
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
    return r.result?.result?.value;
  };

  // 注意：about:blank 没有 origin，直接 evaluate 里 setItem 会抛 SecurityError，
  // 必须通过 addScriptToEvaluateOnNewDocument 在目标页面的新文档里设置。
  const injectAdmin = await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem('token', ${JSON.stringify(TOKENS.admin)}); } catch (e) {}`,
  });

  // 1) 旧地址重定向
  await send("Page.navigate", { url: BASE + "/space/users" });
  await sleep(4000);
  const redirectState = await evaluate(`({
    path: location.pathname,
    hasAdminLayout: !!document.querySelector('.admin-app'),
    activeNav: document.querySelector('.admin-nav__item.is-active')?.textContent.trim() || null,
  })`);
  console.log("[1] /space/users ->", JSON.stringify(redirectState));

  // 2) 个人中心菜单
  await send("Page.navigate", { url: BASE + "/space/account" });
  await sleep(4000);
  const spaceMenu = await evaluate(
    `[...document.querySelectorAll('.menu-item__text')].map(e => e.textContent.trim())`
  );
  console.log("[2] 个人中心菜单:", JSON.stringify(spaceMenu));

  // 3) 普通用户顶栏
  if (injectAdmin.result?.identifier) {
    await send("Page.removeScriptToEvaluateOnNewDocument", {
      identifier: injectAdmin.result.identifier,
    });
  }
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem('token', ${JSON.stringify(TOKENS.member)}); } catch (e) {}`,
  });
  await send("Page.navigate", { url: BASE + "/" });
  await sleep(4000);
  const memberView = await evaluate(`({
    switchTitles: [...document.querySelectorAll('.header-bar-switch button')].map(b => b.title),
    drawerAdmin: [...document.querySelectorAll('.drawer-nav__item')].some(b => b.textContent.includes('管理后台')),
  })`);
  console.log("[3] 普通用户顶栏:", JSON.stringify(memberView));

  proc.kill();
  process.exit(0);
})();
