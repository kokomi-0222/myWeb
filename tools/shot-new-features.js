// 验证本次新增功能：他人主页 / 消息中心 / 卡片头像可点击 / 社区数据总数
// 用法：
//   node local-preview.js（UPSTREAM=http://localhost:8080 指向本地后端）
//   node tools/shot-new-features.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9343;
const BASE = process.env.TEST_BASE || "http://localhost:5180";
const TOKEN = process.env.TEST_TOKEN || "";
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
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-newfeatures-test",
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

  // 消息页需要登录态：导航前把 token 塞进 localStorage
  if (TOKEN) {
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem('token', ${JSON.stringify(TOKEN)}); } catch (e) {}`,
    });
  }

  const nav = async (url, wait = 3000) => {
    await send("Page.navigate", { url });
    await sleep(wait);
  };

  const waitFor = async (expr, timeout = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
      if (r.result?.result?.value) return true;
      await sleep(300);
    }
    return false;
  };

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    return r.result?.result?.value;
  };

  const shot = async (name, fullPage = false) => {
    const params = { format: "png" };
    if (fullPage) params.captureBeyondViewport = true;
    const r = await send("Page.captureScreenshot", params);
    if (!r.result?.data) {
      console.log(`  截图失败: ${name}`);
      return;
    }
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64"));
    console.log(`  截图 -> shots/${name}`);
  };

  // ================= 1. 首页：卡片头像点击是否影响布局 =================
  console.log("\n[1] 首页卡片布局（头像外包 span 后是否错位）");
  await nav(BASE + "/");
  const okHome = await waitFor("document.querySelectorAll('.post-card').length > 0");
  console.log("  帖子加载:", okHome);

  const layout = await evaluate(`(() => {
    const card = document.querySelector('.post-card');
    if (!card) return null;
    const r = (sel) => {
      const el = card.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { l: Math.round(b.left), t: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) };
    };
    const avatarLink = card.querySelector('.post-card__avatar-link');
    return {
      card: r('.post-card__content'),
      avatar: r('.post-card__avatar'),
      avatarLink: avatarLink ? { l: Math.round(avatarLink.getBoundingClientRect().left), w: Math.round(avatarLink.getBoundingClientRect().width) } : null,
      authorName: r('.post-card__author-name'),
      authorCursor: getComputedStyle(card.querySelector('.post-card__author-name')).cursor,
      avatarLinkCursor: avatarLink ? getComputedStyle(avatarLink).cursor : null,
      siteStat: (document.querySelector('.stat-grid .stat-num') || {}).textContent,
    };
  })()`);
  console.log("  布局数据:", JSON.stringify(layout));

  await shot("new-home.png");

  // ================= 2. 他人主页 =================
  console.log("\n[2] 他人主页 /user/1");
  await nav(BASE + "/user/1");
  const okProfile = await waitFor("!!document.querySelector('.profile-card__name')");
  console.log("  资料卡渲染:", okProfile);
  const profile = await evaluate(`(() => {
    const name = document.querySelector('.profile-card__name');
    const meta = document.querySelector('.profile-card__meta');
    return {
      name: name ? name.textContent.trim() : null,
      meta: meta ? meta.textContent.replace(/\\s+/g, ' ').trim() : null,
      hasPosts: document.querySelectorAll('.post-card').length,
      emptyState: !!document.querySelector('.empty-state'),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`);
  console.log("  页面数据:", JSON.stringify(profile));
  await shot("new-user-profile.png");

  // ================= 3. 消息中心 =================
  if (TOKEN) {
    console.log("\n[3] 消息中心 /space/message");
    await nav(BASE + "/space/message");
    const okMsg = await waitFor("!!document.querySelector('.message-page')");
    console.log("  消息页渲染:", okMsg);
    const msg = await evaluate(`(() => {
      const items = Array.from(document.querySelectorAll('.msg-item'));
      const badge = document.querySelector('.menu-item__badge');
      return {
        count: items.length,
        first: items[0] ? items[0].innerText.replace(/\\s+/g, ' ').trim().slice(0, 60) : null,
        unreadDots: document.querySelectorAll('.msg-item__dot').length,
        sideBadge: badge ? badge.textContent.trim() : null,
        headBadge: (document.querySelector('.message-head__badge') || {}).textContent || null,
        emptyState: !!document.querySelector('.empty-state'),
      };
    })()`);
    console.log("  消息数据:", JSON.stringify(msg));
    await shot("new-message.png");
  } else {
    console.log("\n[3] 未提供 TEST_TOKEN，跳过消息中心");
  }

  ws.close();
  proc.kill();
  console.log("\n完成");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
