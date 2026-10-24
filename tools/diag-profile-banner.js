// 诊断他人主页横幅：横幅是否存在、高度、与顶栏是否重叠
// 用法：
//   TEST_BASE=http://localhost:5180 WIDTH=1088 node tools/diag-profile-banner.js
//   TEST_BASE=https://www.kokomi.net.cn WIDTH=1088 node tools/diag-profile-banner.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9344;
const BASE = process.env.TEST_BASE || "http://localhost:5180";
const WIDTH = Number(process.env.WIDTH) || 1088;
const HEIGHT = Number(process.env.HEIGHT) || 800;
const TAG = process.env.TAG || String(WIDTH);
const OUT = path.resolve(__dirname, "../shots");
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

const PROBE = `(() => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width), display: cs.display };
  };
  return JSON.stringify({
    vw: window.innerWidth,
    vh: window.innerHeight,
    heightVar: getComputedStyle(document.documentElement).getPropertyValue('--header-banner-height').trim(),
    banner: box('.header-banner'),
    bannerRoot: box('.header-banner .bili-header__banner'),
    layers: document.querySelectorAll('.bili-header__banner .layer').length,
    nav: box('.header-bar') || box('header'),
    body: box('.user-page__body'),
    card: box('.profile-card'),
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
  });
})()`;

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const proc = spawn(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-proxy-server",
      `--remote-debugging-port=${PORT}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      "--force-device-scale-factor=1",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-profile-diag",
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
  if (!page) {
    console.error("找不到可调试页面");
    proc.kill();
    process.exit(1);
  }

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
  await send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    return r.result?.result?.value;
  };

  const url = BASE + (process.env.PAGE_PATH || "/user/1");
  console.log(`打开 ${url}  @ ${WIDTH}x${HEIGHT}`);
  await send("Page.navigate", { url });
  await sleep(6000); // 等 32 层横幅图加载

  const raw = await evaluate(PROBE);
  console.log("探测结果:", raw);

  const r = await send("Page.captureScreenshot", { format: "png" });
  if (r.result?.data) {
    const name = `diag-profile-${TAG}.png`;
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64"));
    console.log("截图 -> shots/" + name);
  } else {
    console.log("截图失败");
  }

  proc.kill();
  process.exit(0);
})();
