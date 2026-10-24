// 桌面端回归：搜索后点 logo 清条件、详情页点 logo 回首页
// 用法：PREVIEW_ROOT=myWeb/vue/dist_mobile PORT=5195 MOCK_USER=1 MOCK_POST=1 node local-preview.js
//       TEST_BASE=http://localhost:5195 node tools/test-desktop-home.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9372;
const BASE = process.env.TEST_BASE || "http://localhost:5195";
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

(async () => {
  const proc = spawn(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-proxy-server",
      `--remote-debugging-port=${PORT}`,
      "--window-size=1440,1000",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-desktop-home-test",
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
  const postRequests = [];
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
    if (m.method === "Network.requestWillBeSent") {
      const u = m.params?.request?.url || "";
      if (u.includes("/api/post/getPosts")) postRequests.push(u);
    }
  });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem('token', 'mock-preview-token'); } catch (e) {}`,
  });

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    return r.result?.result?.value;
  };
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64"));
    console.log("  截图 -> shots/" + name);
  };
  const clickAt = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await sleep(60);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  };
  const centerOf = (sel) =>
    evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return null;
      const b = el.getBoundingClientRect();
      if (b.width === 0) return null;
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);

  await send("Page.navigate", { url: BASE + "/" });
  await sleep(2500);

  // ---------- 1. 桌面搜索 ----------
  console.log("\n[1] 顶栏搜索「灯塔」");
  let p = await centerOf(".header-bar-center .search-input");
  await clickAt(p.x, p.y);
  await sleep(200);
  await send("Input.insertText", { text: "灯塔" });
  await sleep(150);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await sleep(1600);
  const searched = await evaluate(`({ url: location.href, cards: document.querySelectorAll('.post-card').length })`);
  console.log("  搜索后:", JSON.stringify(searched));
  await shot("desktop-search-result.png");

  // ---------- 2. 点 logo ----------
  console.log("\n[2] 点顶栏 logo");
  p = await centerOf(".header-bar-left .brand");
  await clickAt(p.x, p.y);
  await sleep(1600);
  const afterLogo = await evaluate(`({
    url: location.href,
    cards: document.querySelectorAll('.post-card').length,
    searchValue: document.querySelector('.header-bar-center .search-input')?.value ?? null,
  })`);
  console.log("  点 logo 后:", JSON.stringify(afterLogo));
  await shot("desktop-back-home.png");

  // ---------- 3. 进详情页再点 logo ----------
  console.log("\n[3] 进详情页，再点 logo 回首页");
  p = await centerOf(".post-card__title, .post-card h3, .post-card a");
  await clickAt(p.x, p.y);
  await sleep(2000);
  const detailUrl = await evaluate(`location.href`);
  console.log("  详情页 URL:", detailUrl);
  await shot("desktop-detail.png");

  p = await centerOf(".header-bar-left .brand");
  if (!p) {
    console.log("  详情页没有 logo，跳过");
  } else {
    await clickAt(p.x, p.y);
    await sleep(2000);
    const back = await evaluate(`({ url: location.href, cards: document.querySelectorAll('.post-card').length })`);
    console.log("  点 logo 后:", JSON.stringify(back));
    await shot("desktop-detail-back-home.png");
  }

  console.log("\n===== getPosts 请求 =====");
  postRequests.forEach((u) => console.log("  " + u.replace(BASE, "")));

  ws.close();
  proc.kill();
  process.exit(0);
})().catch((e) => {
  console.error("失败:", e);
  process.exit(1);
});
