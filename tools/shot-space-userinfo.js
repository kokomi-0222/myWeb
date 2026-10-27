// 空间页顶部用户信息栏的视觉验收：昵称后面不再挂 @kokomi_xxx，角色标签仍在原位。
// 用法：node tools/shot-space-userinfo.js（需 18080 后端 + 5194 预览）
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9451;
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
      `--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-space-uinfo-${process.pid}`,
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

  try {
    await setViewport(1200, 900);
    // 先落到首页抢在路由守卫前写入登录态
    await nav(BASE + "/");
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(TOKENS.admin)})`);
    await nav(BASE + "/space/home");

    const ready = await until("!!document.querySelector('.user-info')");
    check("空间页用户信息栏出现", ready);

    const info = await evaluate(`(() => {
      const bar = document.querySelector('.user-info');
      if (!bar) return null;
      const nameEl = bar.querySelector('.user-name');
      const roleEl = bar.querySelector('.user-role');
      const accEl = bar.querySelector('.user-account');
      const barRect = bar.getBoundingClientRect();
      const roleRect = roleEl ? roleEl.getBoundingClientRect() : null;
      const nameRect = nameEl ? nameEl.getBoundingClientRect() : null;
      return {
        nameText: (nameEl?.textContent || '').replace(/\\s+/g, ' ').trim(),
        roleText: (roleEl?.textContent || '').trim(),
        hasAccount: !!accEl,
        roleLeft: roleRect ? Math.round(roleRect.left) : -1,
        roleRight: roleRect ? Math.round(roleRect.right) : -1,
        nameRight: nameRect ? Math.round(nameRect.right) : -1,
        barRight: Math.round(barRect.right),
        innerWidth: window.innerWidth,
        docWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    })()`);
    console.log("  信息栏内容:", JSON.stringify(info));

    check("不再显示 @用户名", info && info.hasAccount === false);
    check("昵称后面没有残留 @", info && !info.nameText.includes("@"),
      info && info.nameText);
    check("角色标签仍在", info && !!info.roleText, info && info.roleText);
    check("角色标签没被顶出信息栏", info && info.roleRight <= info.barRight,
      info && `role=${info.roleRight} bar=${info.barRight}`);
    // 紧跟昵称：昵称右侧到标签左侧只隔一个 margin-left（10px），容 4px 取整误差
    check("角色标签紧跟昵称（不是贴最右）",
      info && info.roleLeft - info.nameRight <= 14 && info.barRight - info.roleRight > 60,
      info && `gap=${info.roleLeft - info.nameRight} 右侧留白=${info.barRight - info.roleRight}`);
    await shot("space-userinfo-desktop.png");

    // 手机宽度：长昵称也不能横向溢出
    await setViewport(390, 844);
    await sleep(500);
    const m = await evaluate(`({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    })`);
    check("390 宽不横向溢出", m.scrollWidth <= m.clientWidth + 1,
      `scrollWidth=${m.scrollWidth} clientWidth=${m.clientWidth}`);

    // 极端昵称回归：`flex: 0 1 auto` 必须仍然「可收缩」——
    // 曾经是 `flex: 1 1 auto` 把标签推到最右，改成 0 1 auto 后如果漏掉 shrink/min-width，
    // 长串会把标签直接顶出视口（旧 bug：390 宽下 scrollWidth 434）。
    const longName = await evaluate(`(() => {
      const el = document.querySelector('.user-name > span:first-child');
      if (!el) return null;
      const origin = el.textContent;
      el.textContent = 'vfy_guest_9107722065_xxxxxxxxxxxx';
      const bar = document.querySelector('.user-info');
      const role = bar.querySelector('.user-role');
      const res = {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        roleRight: Math.round(role.getBoundingClientRect().right),
        barRight: Math.round(bar.getBoundingClientRect().right),
      };
      el.textContent = origin;
      return res;
    })()`);
    check("超长昵称下不横向溢出、标签仍在栏内",
      longName && longName.scrollWidth <= longName.clientWidth + 1 &&
      longName.roleRight <= longName.barRight,
      longName && `scroll=${longName.scrollWidth}/${longName.clientWidth} role=${longName.roleRight} bar=${longName.barRight}`);
    await shot("space-userinfo-mobile.png");
  } catch (e) {
    check("脚本执行", false, String(e.message || e));
  } finally {
    try { proc.kill(); } catch { /* 已退出 */ }
  }

  console.log(`\n结果：${PASS.length} 通过 / ${FAIL.length} 失败`);
  process.exit(FAIL.length ? 1 : 0);
})();
