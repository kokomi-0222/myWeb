// 横幅换图验收：新图 + 关闭 32 层视差，截首页/详情页/个人空间/个人中心四张
// 用法：node tools/shot-banner-newbg.js（只需 5194 预览，后端可不在）
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9477;
const BASE = "http://localhost:5194";
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "shots/banner-new");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

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
      "--window-size=1920,1080",
      `--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-banner-new-${process.pid}`,
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
    send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result && r.result.result ? r.result.result.value : null;
  };

  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64"));
    console.log("  saved", name);
  };

  const waitImg = async (sel) => {
    for (let i = 0; i < 40; i++) {
      const ok = await evaluate(`(() => { const i = document.querySelector('${sel}'); return !!(i && i.complete && i.naturalWidth > 200); })()`);
      if (ok) return true;
      await sleep(250);
    }
    return false;
  };

  const cases = [
    ["home", `${BASE}/#/`, ".header-banner .banner-img img"],
    ["detail", `${BASE}/#/post/1`, ".header-banner .banner-img img"],
    ["profile", `${BASE}/#/user/1`, ".header-banner .banner-img img"],
    ["space", `${BASE}/#/space/home`, ".header-banner .banner-img"],
  ];

  for (const [name, url, sel] of cases) {
    await setViewport(1920, 1080);
    await send("Page.navigate", { url });
    await sleep(1200);
    const ok = await waitImg(sel);
    await sleep(400);
    // 只截横幅区域（含上下各一点上下文）
    const rect = await evaluate(`(() => { const el = document.querySelector('.header-banner'); if (!el) return null; const r = el.getBoundingClientRect(); return {x:0,y:Math.max(0,r.top-60),w:window.innerWidth,h:r.height+140}; })()`);
    if (rect) {
      await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
      const r2 = await send("Page.captureScreenshot", {
        format: "png",
        clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 },
      });
      fs.writeFileSync(path.join(OUT, `banner-${name}.png`), Buffer.from(r2.result.data, "base64"));
      console.log(`  saved banner-${name}.png  img_ready=${ok}`);
    } else {
      console.log(`  MISSING .header-banner on ${name}`);
    }
  }

  // 手机宽度各一张
  for (const [name, url] of [["home", `${BASE}/#/`], ["profile", `${BASE}/#/user/1`]]) {
    await setViewport(390, 844);
    await send("Page.navigate", { url });
    await sleep(1400);
    await shot(`mobile-${name}.png`);
  }

  ws.close();
  proc.kill();
  process.exit(0);
})();
