// 截取帖子「更多」下拉菜单（亮/暗），用于前后对比
// 用法：PREVIEW_ROOT=myWeb/vue/dist_toast2 PORT=5192 MOCK_USER=1 node local-preview.js
//       TEST_BASE=http://localhost:5192 PREFIX=before node tools/test-post-more-menu.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9361;
const BASE = process.env.TEST_BASE || "http://localhost:5192";
const PREFIX = process.env.PREFIX || "before";
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
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-postmore-test",
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
  });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 2, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem('token', 'mock-preview-token'); } catch (e) {}`,
  });
  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    return r.result?.result?.value;
  };

  const openMenu = async () => {
    const t = await evaluate(`(() => {
      const el = document.querySelector('.post-card .post-card__more-trigger');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    if (!t) throw new Error("找不到更多按钮");
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: t.x, y: t.y, button: "none" });
    await sleep(700);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: t.x + 3, y: t.y + 3, button: "none" });
    await sleep(900);
    // 小屏下 trigger 是 click 模式，hover 不会展开，补一次真实点击
    const opened = await evaluate(`(() => {
      const m = document.querySelector('.dropdown-menu--postCard-more');
      return !!(m && m.getBoundingClientRect().width > 0);
    })()`);
    if (!opened) {
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: t.x, y: t.y, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: t.x, y: t.y, button: "left", clickCount: 1 });
      await sleep(700);
    }
  };

  const closeMenu = async () => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 20, y: 900, button: "none" });
    await sleep(700);
  };

  const capture = async (name) => {
    const box = await evaluate(`(() => {
      const menu = document.querySelector('.dropdown-menu--postCard-more');
      const trig = document.querySelector('.post-card .post-card__more');
      if (!menu) return null;
      const m = menu.getBoundingClientRect();
      const t = trig.getBoundingClientRect();
      const x = Math.min(m.left, t.left) - 14;
      const y = Math.min(m.top, t.top) - 14;
      return { x: Math.max(0, x), y: Math.max(0, y), width: Math.max(m.right, t.right) - x + 14, height: Math.max(m.bottom, t.bottom) - y + 14 };
    })()`);
    if (!box) return console.log("  菜单没打开");
    const r = await send("Page.captureScreenshot", {
      format: "png",
      clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 3 },
    });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64"));
    console.log("  截图 -> shots/" + name);
  };

  // 把鼠标移到第 idx 个菜单项上，验证 hover 高亮
  const hoverItem = async (idx) => {
    const p = await evaluate(`(() => {
      const items = [...document.querySelectorAll('.dropdown-menu--postCard-more .more-actions-item')];
      const el = items[${idx}];
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    if (!p) return false;
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, button: "none" });
    await sleep(450);
    return true;
  };

  try {
    await send("Page.navigate", { url: `${BASE}/` });
    for (let i = 0; i < 60; i++) {
      if (await evaluate("document.querySelectorAll('.post-card').length > 0")) break;
      await sleep(500);
    }

    await openMenu();
    const info = await evaluate(`(() => {
      const menu = document.querySelector('.dropdown-menu--postCard-more');
      const wrap = document.querySelector('.dropdown-menu--postCard-more')?.closest('.global-dropdown-wrapper');
      if (!menu) return null;
      const s = getComputedStyle(menu);
      const item = menu.querySelector('.more-actions-item');
      const arrow = menu.querySelector('div[style*="rotate(45deg)"]');
      const items = [...menu.querySelectorAll('.more-actions-item')];
      return {
        menuClass: menu.className,
        menuStyle: { radius: s.borderRadius, bg: s.backgroundColor, shadow: s.boxShadow, border: s.border, padding: s.padding, minWidth: s.minWidth },
        size: (() => { const b = menu.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; })(),
        itemCount: items.length,
        itemTexts: items.map((i) => i.textContent.trim()),
        itemStyle: item ? (() => { const b = getComputedStyle(item); return { padding: b.padding, radius: b.borderRadius, color: b.color, bg: b.backgroundColor, height: Math.round(item.getBoundingClientRect().height) }; })() : null,
        arrow: arrow ? { bg: arrow.style.background, border: arrow.style.border } : null,
        wrapZ: wrap ? getComputedStyle(wrap).zIndex : null,
      };
    })()`);
    console.log("  菜单信息:", JSON.stringify(info, null, 2));
    await capture(`${PREFIX}-more-menu-light.png`);

    console.log("  hover 危险项");
    const hovered = await hoverItem(1);
    const hoverStyle = await evaluate(`(() => {
      const items = [...document.querySelectorAll('.dropdown-menu--postCard-more .more-actions-item')];
      const el = items[1];
      if (!el) return null;
      const s = getComputedStyle(el);
      return { matched: el.matches(':hover'), bg: s.backgroundColor, color: s.color };
    })()`);
    console.log("  hover 态:", JSON.stringify(hoverStyle));
    if (hovered) await capture(`${PREFIX}-more-menu-hover-light.png`);

    console.log("\n[2] 暗色");
    await closeMenu();
    await evaluate(`document.documentElement.classList.add('dark')`);
    await sleep(600);
    await openMenu();
    await hoverItem(1);
    await capture(`${PREFIX}-more-menu-dark.png`);

    console.log("\n[3] 移动端 390 宽");
    await closeMenu();
    await evaluate(`document.documentElement.classList.remove('dark')`);
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(900);
    await openMenu();
    const fit = await evaluate(`(() => {
      const m = document.querySelector('.dropdown-menu--postCard-more');
      if (!m) return null;
      const b = m.getBoundingClientRect();
      return { left: Math.round(b.left), right: Math.round(b.right), vw: innerWidth, overflow: b.right > innerWidth || b.left < 0 };
    })()`);
    console.log("  视口内:", JSON.stringify(fit));
    await capture(`${PREFIX}-more-menu-mobile.png`);
    await closeMenu();
    console.log("\n完成");
  } catch (e) {
    console.error("异常:", e.message);
    process.exitCode = 1;
  } finally {
    try {
      ws.close();
    } catch {}
    proc.kill();
  }
})();
