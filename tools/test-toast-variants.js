// 三种图标排版方案对比（放大 3 倍），用来选最终观感
// 用法：TEST_BASE=http://localhost:5190 node tools/test-toast-variants.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9359;
const BASE = process.env.TEST_BASE || "http://localhost:5190";
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
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-toast-variants",
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

  const CHECK = "M512 64a448 448 0 1 1 0 896 448 448 0 0 1 0-896m-55.8 536.4-99.5-99.6a38.4 38.4 0 1 0-54.4 54.4l126.8 126.7a38.27 38.27 0 0 0 54.4 0l254.7-254.8a38.4 38.4 0 1 0-54.3-54.3z";

  try {
    await send("Page.navigate", { url: `${BASE}/` });
    for (let i = 0; i < 60; i++) {
      if (await evaluate("document.querySelectorAll('.post-card').length > 0")) break;
      await sleep(500);
    }

    const box = await evaluate(`(() => {
      document.querySelectorAll('.zoast').forEach(e => e.remove());
      const CHECK = ${JSON.stringify(CHECK)};
      const rows = [
        ['A 现方案：22px 软底 + 13px 实心图标', 'background:var(--primary-color-soft)', 'width:22px;height:22px;font-size:13px'],
        ['B 单色实心：无底 + 19px 实心图标', 'background:transparent', 'width:19px;height:19px;font-size:19px'],
        ['C 大软底：26px 软底 + 15px 实心图标', 'background:rgba(35,195,67,.16)', 'width:26px;height:26px;font-size:15px'],
      ];
      const wrap = document.createElement('div');
      wrap.className = 'zoast';
      wrap.style.cssText = 'position:fixed;top:110px;left:50%;transform:translateX(-50%);z-index:4000;display:flex;flex-direction:column;align-items:center;gap:14px;padding:10px;';
      rows.forEach(([label, bg, size]) => {
        const d = document.createElement('div');
        d.className = 'el-message kokomi-toast el-message--success';
        d.style.cssText = 'position:relative;';
        d.innerHTML = '<i class="el-icon el-message__icon" style="color:#23c343;' + bg + ';' + size + '">' +
          '<svg viewBox="0 0 1024 1024" width="1em" height="1em"><path fill="currentColor" d="' + CHECK + '"/></svg></i>' +
          '<p class="el-message__content">' + label + '</p>';
        wrap.appendChild(d);
      });
      document.body.appendChild(wrap);
      const b = wrap.getBoundingClientRect();
      return { x: b.left - 12, y: b.top - 12, width: b.width + 24, height: b.height + 24 };
    })()`);
    await sleep(500);

    const r = await send("Page.captureScreenshot", {
      format: "png",
      clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 3 },
    });
    fs.writeFileSync(path.join(OUT, "toast-variants.png"), Buffer.from(r.result.data, "base64"));
    console.log("  截图 -> shots/toast-variants.png");
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
