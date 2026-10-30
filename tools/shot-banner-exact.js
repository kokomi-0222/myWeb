// 只截 .header-banner 元素本身（不夹带导航栏/内容），并清掉 ElMessage 提示
// 用法：node tools/shot-banner-exact.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9488;
const BASE = "http://localhost:5194";
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "shots/banner-new");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      `--remote-debugging-port=${DBG_PORT}`, "--window-size=1920,1080",
      `--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-banner-exact-${process.pid}`,
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  await sleep(2500);
  let list = [];
  for (let i = 0; i < 12; i++) {
    try { list = await get("/json/list"); break; } catch { await sleep(500); }
  }
  const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  const send = (m, p = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method: m, params: p })); });
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable");
  await send("Runtime.enable");
  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result && r.result.result ? r.result.result.value : null;
  };

  for (const w of [2560, 1920, 1366]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: `${BASE}/#/` });
    await sleep(1600);
    await evaluate(`document.querySelectorAll('.el-message,.el-notification').forEach(e => e.remove())`);
    const rect = await evaluate(`(() => { const el = document.querySelector('.header-banner'); if (!el) return null; const r = el.getBoundingClientRect(); const img = el.querySelector('.banner-img img'); return { y: r.top + window.scrollY, h: r.height, w: window.innerWidth, nat: img ? img.naturalWidth + 'x' + img.naturalHeight : null, disp: img ? Math.round(img.getBoundingClientRect().width) + 'x' + Math.round(img.getBoundingClientRect().height) : null }; })()`);
    console.log(`  w=${w}`, JSON.stringify(rect));
    const r2 = await send("Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: rect.y, width: w, height: rect.h, scale: 1 },
      captureBeyondViewport: true,
    });
    fs.writeFileSync(path.join(OUT, `exact-${w}.png`), Buffer.from(r2.result.data, "base64"));
    console.log(`  saved exact-${w}.png`);
  }

  // 手机
  for (const w of [390]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: 844, deviceScaleFactor: 2, mobile: true });
    await send("Page.navigate", { url: `${BASE}/#/` });
    await sleep(1600);
    await evaluate(`document.querySelectorAll('.el-message,.el-notification').forEach(e => e.remove())`);
    const rect = await evaluate(`(() => { const el = document.querySelector('.header-banner'); if (!el) return null; const r = el.getBoundingClientRect(); return { y: r.top + window.scrollY, h: r.height }; })()`);
    const r2 = await send("Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: rect.y, width: w, height: rect.h, scale: 2 },
      captureBeyondViewport: true,
    });
    fs.writeFileSync(path.join(OUT, `exact-${w}.png`), Buffer.from(r2.result.data, "base64"));
    console.log(`  saved exact-${w}.png`, JSON.stringify(rect));
  }

  ws.close(); proc.kill(); process.exit(0);
})();
