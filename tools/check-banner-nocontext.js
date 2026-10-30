// 横幅三项验收：① 新图 2560 生效 ② hover 不再缩放 ③ 右键菜单被拦
// 用法：node tools/check-banner-nocontext.js（只需 5194 预览）
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9494;
const BASE = "http://localhost:5194";
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "shots/banner-new");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = [];
const check = (n, ok, d = "") => { res.push([n, ok, d]); console.log(`  ${ok ? "PASS" : "FAIL"} ${n}${d ? "  (" + d + ")" : ""}`); };

const get = (p) =>
  new Promise((r, j) => http.get({ host: "127.0.0.1", port: DBG_PORT, path: p }, (s) => { let d = ""; s.on("data", (c) => (d += c)); s.on("end", () => r(JSON.parse(d))); }).on("error", j));

(async () => {
  const proc = spawn(EDGE, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--no-proxy-server",
    `--remote-debugging-port=${DBG_PORT}`, "--window-size=1920,1080",
    `--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-nocontext-${process.pid}`, "about:blank",
  ], { stdio: "ignore" });
  await sleep(2500);
  let list = [];
  for (let i = 0; i < 12; i++) { try { list = await get("/json/list"); break; } catch { await sleep(500); } }
  const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
  let seq = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method: m, params: p })); });
  ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable"); await send("Runtime.enable");
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result && r.result.exceptionDetails) console.log("EX", r.result.exceptionDetails.text); return r.result && r.result.result ? r.result.result.value : null; };

  await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${BASE}/#/` });
  await sleep(1800);
  await ev(`document.querySelectorAll('.el-message,.el-notification').forEach(e=>e.remove())`);

  const nat = await ev(`(() => { const i = document.querySelector('.header-banner .banner-img img'); return i ? i.naturalWidth + 'x' + i.naturalHeight : null; })()`);
  check("底图是 2560×240 新图", nat === "2560x240", String(nat));

  // ② hover 不缩放：模拟鼠标移入 + 移动，再看 transform
  await ev(`(() => { const b = document.querySelector('.bili-header__banner'); const r = b.getBoundingClientRect();
    b.dispatchEvent(new MouseEvent('mouseenter', {bubbles:false}));
    window.dispatchEvent(new MouseEvent('mousemove', {clientX: r.width*0.8, clientY: r.height*0.5, bubbles:true})); })()`);
  await sleep(700);
  const tf = await ev(`(() => { const i = document.querySelector('.header-banner .banner-img img'); const s = getComputedStyle(i); return s.transform + ' | transition:' + s.transitionDuration; })()`);
  check("hover 后无缩放 transform", /none|matrix\(1, 0, 0, 1, 0, 0\)/.test(tf), tf);

  // ③ 右键拦截
  const ctx = await ev(`(() => { const el = document.querySelector('.header-banner .banner-img img');
    const e = new MouseEvent('contextmenu', {bubbles:true, cancelable:true, clientX: 300, clientY: 80});
    el.dispatchEvent(e); return e.defaultPrevented; })()`);
  check("图片上右键被 preventDefault", ctx === true, String(ctx));

  const drag = await ev(`(() => { const i = document.querySelector('.header-banner .banner-img img'); return i.getAttribute('draggable') + ' | user-select:' + getComputedStyle(i).userSelect; })()`);
  check("禁拖拽 / 禁选中", drag.startsWith("false") && /none/.test(drag), drag);

  // 截一张确认视觉
  const r = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1920, height: 160, scale: 1 }, captureBeyondViewport: true });
  fs.writeFileSync(path.join(OUT, "final-2560.png"), Buffer.from(r.result.data, "base64"));
  console.log("  saved final-2560.png");

  ws.close(); proc.kill();
  console.log(`\n${res.filter((x) => x[1]).length}/${res.length} passed`);
  process.exit(0);
})();
