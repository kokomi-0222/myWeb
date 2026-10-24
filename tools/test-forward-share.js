// 验证本次新增：转发（计数 + 通知）与详情页右侧分享悬浮条
// 用法：
//   UPSTREAM=http://localhost:18080 PORT=5182 node local-preview.js
//   TEST_BASE=http://localhost:5182 TEST_TOKEN=<jwt> node tools/test-forward-share.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9347;
const BASE = process.env.TEST_BASE || "http://localhost:5182";
const TOKEN = process.env.TEST_TOKEN || "";
const POST_ID = process.env.POST_ID || "16";
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
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const proc = spawn(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-proxy-server",
      `--remote-debugging-port=${PORT}`,
      "--window-size=1440,1200",
      "--force-device-scale-factor=1",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-forward-share-test",
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
    width: 1440,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: false,
  });

  if (TOKEN) {
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem('token', ${JSON.stringify(TOKEN)}); } catch (e) {}`,
    });
  }

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    return r.result?.result?.value;
  };

  const waitFor = async (expr, timeout = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await evaluate(expr)) return true;
      await sleep(250);
    }
    return false;
  };

  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    if (!r.result?.data) return console.log(`  截图失败: ${name}`);
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64"));
    console.log(`  截图 -> shots/${name}`);
  };

  const clickAt = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(400);
  };

  const clickEl = async (sel, idx = 0) => {
    const rect = await evaluate(`(() => {
      const el = document.querySelectorAll(${JSON.stringify(sel)})[${idx}];
      if (!el) return null;
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return null;
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    if (!rect) return false;
    await clickAt(rect.x, rect.y);
    return true;
  };

  // ================= 1. 详情页右侧悬浮条 =================
  console.log("\n[1] 详情页右侧悬浮操作条");
  await send("Page.navigate", { url: `${BASE}/post/${POST_ID}` });
  const barOk = await waitFor("!!document.querySelector('.post-action-bar')");
  console.log("  操作条渲染:", barOk);

  const geo = await evaluate(`(() => {
    const bar = document.querySelector('.post-action-bar');
    const container = document.querySelector('.post-detail-container');
    const items = [...document.querySelectorAll('.pab-item')].map((el) => el.textContent.trim());
    if (!bar || !container) return null;
    const b = bar.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    return {
      items,
      barLeft: Math.round(b.left),
      barRight: Math.round(b.right),
      containerRight: Math.round(c.right),
      gap: Math.round(b.left - c.right),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      visible: getComputedStyle(bar).display,
    };
  })()`);
  console.log("  几何:", JSON.stringify(geo));
  await shot("forward-bar.png");

  // ================= 2. 分享面板 =================
  console.log("\n[2] 分享面板");
  await clickEl(".pab-item", 3);
  const panelOk = await waitFor("!!document.querySelector('.share-panel')");
  console.log("  面板打开:", panelOk);

  const panel = await evaluate(`(() => {
    const input = document.querySelector('.share-panel__input');
    const chans = [...document.querySelectorAll('.share-channel__label')].map((e) => e.textContent.trim());
    return {
      url: input ? input.value : null,
      channels: chans,
      title: (document.querySelector('.share-panel__title') || {}).textContent,
    };
  })()`);
  console.log("  面板数据:", JSON.stringify(panel));
  await shot("forward-share-panel.png");

  console.log("\n  点「复制」");
  await clickEl(".share-panel__copy");
  await sleep(600);
  const copied = await evaluate(
    `(() => { const b = document.querySelector('.share-panel__copy'); return b ? b.textContent.trim() : null; })()`
  );
  console.log("  复制按钮文案:", copied);
  await shot("forward-share-copied.png");

  // 关闭：按 Esc
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(600);
  console.log("  Esc 后面板已关闭:", !(await evaluate("!!document.querySelector('.share-panel')")));

  // ================= 3. 转发 =================
  console.log("\n[3] 转发");
  const before = await evaluate(`(() => {
    const el = document.querySelectorAll('.pab-item')[2];
    return el ? el.textContent.trim() : null;
  })()`);
  console.log("  转发前:", before);

  await clickEl(".pab-item", 2);
  const boxOk = await waitFor("!!document.querySelector('.el-message-box')");
  console.log("  确认框出现:", boxOk);
  const boxText = await evaluate(
    `(() => { const b = document.querySelector('.el-message-box'); return b ? b.textContent.replace(/\\s+/g,' ').trim().slice(0,80) : null; })()`
  );
  console.log("  确认框文案:", boxText);
  await shot("forward-confirm.png");

  const clicked = await clickEl(".el-message-box__btns .el-button--primary");
  console.log("  点确定:", clicked);
  await sleep(1500);

  const after = await evaluate(`(() => {
    const el = document.querySelectorAll('.pab-item')[2];
    return el ? el.textContent.trim() : null;
  })()`);
  console.log("  转发后:", after);

  const toast = await evaluate(
    `(() => { const t = document.querySelector('.el-message__content'); return t ? t.textContent.trim() : null; })()`
  );
  console.log("  Toast:", toast);
  await shot("forward-done.png");

  // ================= 4. 首页卡片底部「转发」 =================
  console.log("\n[4] 首页卡片转发（验证 click.stop 不会跳详情）");
  await send("Page.navigate", { url: BASE + "/" });
  await waitFor("document.querySelectorAll('.post-card').length > 0");

  const cardBefore = await evaluate(`(() => {
    const card = document.querySelector('.post-card');
    if (!card) return null;
    const stat = card.querySelector('.post-card__stats .post-card__stat');
    return { text: stat ? stat.textContent.trim() : null, path: location.pathname };
  })()`);
  console.log("  点击前:", JSON.stringify(cardBefore));

  await clickEl(".post-card .post-card__stats .post-card__stat", 0);
  const cardBox = await waitFor("!!document.querySelector('.el-message-box')");
  console.log("  确认框出现:", cardBox);
  await clickEl(".el-message-box__btns .el-button--primary");
  await sleep(1500);

  const cardAfter = await evaluate(`(() => {
    const card = document.querySelector('.post-card');
    const stat = card ? card.querySelector('.post-card__stats .post-card__stat') : null;
    return { text: stat ? stat.textContent.trim() : null, path: location.pathname };
  })()`);
  console.log("  点击后:", JSON.stringify(cardAfter));
  console.log("  是否误跳详情页:", cardAfter.path !== "/");
  await shot("forward-card.png");

  // ================= 5. 更多菜单里的「分享」 =================
  console.log("\n[5] 更多菜单 → 分享");
  const opened = await clickEl(".post-card__more-trigger");
  console.log("  打开更多菜单:", opened);
  await sleep(500);
  const menuItems = await evaluate(
    `[...document.querySelectorAll('.more-actions-item')].map(e => e.textContent.trim())`
  );
  console.log("  菜单项:", JSON.stringify(menuItems));
  const shareIdx = Array.isArray(menuItems) ? menuItems.indexOf("分享") : -1;
  if (shareIdx >= 0) {
    await clickEl(".more-actions-item", shareIdx);
    const ok = await waitFor("!!document.querySelector('.share-panel')");
    console.log("  分享面板打开:", ok);
    await shot("forward-card-share.png");
  } else {
    console.log("  菜单里没有分享项（可能权限过滤）");
  }

  ws.close();
  proc.kill();
})();
