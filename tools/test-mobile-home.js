// 移动端两件事的回归验证：
//   1) 帖子卡片之间的间距（改前 0，改后 8）
//   2) 搜索后点 logo / 抽屉「首页」能否回到全部帖子（URL 清 query + 重新请求）
// 用法：PREVIEW_ROOT=myWeb/vue/dist_mobile PORT=5195 MOCK_USER=1 MOCK_POST=1 node local-preview.js
//       TEST_BASE=http://localhost:5195 node tools/test-mobile-home.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9371;
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
      "--window-size=390,844",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-mobile-home-test",
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
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem('token', 'mock-preview-token'); } catch (e) {}`,
  });

  const postRequests = [];
  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    return r.result?.result?.value;
  };
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
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
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);

  // ---------- 1. 卡片间距 ----------
  await send("Page.navigate", { url: BASE + "/" });
  await sleep(2500);

  const gapInfo = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.post-card')];
    if (cards.length < 2) return { error: '卡片不足两张', count: cards.length };
    const a = cards[0].getBoundingClientRect();
    const b = cards[1].getBoundingClientRect();
    const cs = getComputedStyle(cards[0]);
    return {
      count: cards.length,
      card1Bottom: Math.round(a.bottom),
      card2Top: Math.round(b.top),
      gap: Math.round(b.top - a.bottom),
      marginBottom: cs.marginBottom,
      cardHeight: Math.round(a.height),
    };
  })()`);
  console.log("\n[1] 移动端卡片间距:", JSON.stringify(gapInfo, null, 2));
  await shot("mobile-post-gap.png");

  // ---------- 2. 搜索 ----------
  console.log("\n[2] 打开搜索面板并搜索「心海」");
  let p = await centerOf(".mobile-search-button");
  await clickAt(p.x, p.y);
  await sleep(500);

  const inputSel = ".mobile-search .search-input";
  p = await centerOf(inputSel);
  if (!p) {
    const diag = await evaluate(`({
      searchBtn: !!document.querySelector('.mobile-search-button'),
      panel: document.querySelector('.mobile-search')?.className,
      allInputs: [...document.querySelectorAll('input')].map((i) => i.className),
    })`);
    console.log("  诊断:", JSON.stringify(diag));
    throw new Error("搜索面板没有打开");
  }
  await clickAt(p.x, p.y);
  await sleep(200);
  await send("Input.insertText", { text: "心海" });
  await sleep(200);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await sleep(1800);

  const afterSearch = await evaluate(`({
    url: location.href,
    cards: document.querySelectorAll('.post-card').length,
    scrollY: Math.round(window.scrollY),
  })`);
  console.log("  搜索后:", JSON.stringify(afterSearch, null, 2));
  console.log("  getPosts 请求:", postRequests.slice(-2));
  await shot("mobile-search-result.png");

  // ---------- 3. 点 logo 回首页 ----------
  console.log("\n[3] 点顶部 logo 返回首页");
  p = await centerOf(".mobile-bar-brand");
  await clickAt(p.x, p.y);
  await sleep(1800);

  const afterHome = await evaluate(`({
    url: location.href,
    cards: document.querySelectorAll('.post-card').length,
    scrollY: Math.round(window.scrollY),
    searchInputValue: document.querySelector('.mobile-search .search-input')?.value ?? null,
    heading: document.querySelector('.sort-heading')?.textContent?.trim() ?? null,
  })`);
  console.log("  点 logo 后:", JSON.stringify(afterHome, null, 2));
  console.log("  getPosts 请求:", postRequests.slice(-2));
  await shot("mobile-back-home.png");

  // ---------- 4. 抽屉里的「首页」 ----------
  console.log("\n[4] 再搜索一次，然后用抽屉里的「首页」返回");
  p = await centerOf(".mobile-search-button");
  await clickAt(p.x, p.y);
  await sleep(400);
  p = await centerOf(inputSel);
  await clickAt(p.x, p.y);
  await sleep(200);
  await send("Input.insertText", { text: "血月" });
  await sleep(150);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await sleep(1500);
  const beforeDrawer = await evaluate(`location.href`);
  console.log("  搜索后 URL:", beforeDrawer);

  p = await centerOf(".mobile-menu-toggle");
  await clickAt(p.x, p.y);
  await sleep(600);
  const drawerHome = await evaluate(`(() => {
    const items = [...document.querySelectorAll('.drawer-menu-item, .mobile-drawer a, .mobile-drawer li, .mobile-drawer button')];
    const hit = items.find((el) => el.textContent.trim() === '首页');
    if (!hit) return null;
    const b = hit.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, cls: hit.className };
  })()`);
  if (!drawerHome) {
    console.log("  没找到抽屉里的「首页」");
  } else {
    await clickAt(drawerHome.x, drawerHome.y);
    await sleep(1800);
  }
  const afterDrawer = await evaluate(`({
    url: location.href,
    cards: document.querySelectorAll('.post-card').length,
  })`);
  console.log("  抽屉返回后:", JSON.stringify(afterDrawer, null, 2));
  console.log("  getPosts 请求:", postRequests.slice(-2));
  await shot("mobile-drawer-home.png");

  // ---------- 结论 ----------
  const passGap = gapInfo.gap >= 6 && gapInfo.gap <= 12;
  const passLogo = !afterSearch.url.includes("keyword") === false && !afterHome.url.includes("keyword");
  const passDrawer = !afterDrawer.url.includes("keyword");
  console.log("\n===== 结论 =====");
  console.log("  卡片间距 8px 左右:", passGap ? "通过" : "未通过", `(实际 ${gapInfo.gap}px)`);
  console.log("  搜索写入 URL:", afterSearch.url.includes("keyword") ? "通过" : "未通过");
  console.log("  点 logo 清搜索:", passLogo ? "通过" : "未通过");
  console.log("  抽屉首页清搜索:", passDrawer ? "通过" : "未通过");
  console.log("  全部 getPosts 请求:");
  postRequests.forEach((u) => console.log("    " + u.replace(BASE, "")));

  ws.close();
  proc.kill();
  process.exit(0);
})().catch(async (e) => {
  console.error("失败:", e);
  process.exit(1);
});
