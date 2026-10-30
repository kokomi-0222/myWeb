// 横幅清晰度验收：同一页面在 DPR=1 / DPR=2 下各截一次，用于和原图逐像素对比
// 用法：node tools/shot-banner-dpr.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9491;
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
      `--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-banner-dpr-${process.pid}`,
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

  for (const dpr of [1, 2]) {
    await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: dpr, mobile: false });
    await send("Page.navigate", { url: `${BASE}/#/` });
    await sleep(1800);
    await evaluate(`document.querySelectorAll('.el-message,.el-notification').forEach(e => e.remove())`);
    const info = await evaluate(`(() => { const el = document.querySelector('.header-banner'); const img = el.querySelector('.banner-img img'); const r = el.getBoundingClientRect(); const ir = img.getBoundingClientRect(); return { h: r.height, top: r.top + window.scrollY, nat: img.naturalWidth + 'x' + img.naturalHeight, drew: Math.round(ir.width) + 'x' + Math.round(ir.height), src: img.currentSrc.split('/').pop() }; })()`);
    console.log(`  dpr=${dpr}`, JSON.stringify(info));
    const r2 = await send("Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: info.top, width: 1920, height: info.h, scale: 1 },
      captureBeyondViewport: true,
    });
    const file = path.join(OUT, `dpr${dpr}.png`);
    fs.writeFileSync(file, Buffer.from(r2.result.data, "base64"));
    console.log(`  saved dpr${dpr}.png`);
  }

  ws.close(); proc.kill(); process.exit(0);
})();
