// 放大截取提示卡片细节（3 倍），确认图标/文案/角标的实际观感
// 用法：TEST_BASE=http://localhost:5190 node tools/test-toast-zoom.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9357;
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
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-toast-zoom",
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

  try {
    await send("Page.navigate", { url: `${BASE}/` });
    for (let i = 0; i < 60; i++) {
      if (await evaluate("document.querySelectorAll('.post-card').length > 0")) break;
      await sleep(500);
    }

    // 注入四条带角标的示例，模拟真实合并后的展示
    const box = await evaluate(`(() => {
      document.querySelectorAll('.zoast').forEach(e => e.remove());
      const demo = [
        ['success', '链接已复制', '3'],
        ['error', '复制失败，请手动复制地址栏中的链接后粘贴给好友', null],
        ['warning', '请先登录后再进行该操作', null],
        ['info', '已保存修改', null],
      ];
      const wrap = document.createElement('div');
      wrap.className = 'zoast';
      wrap.style.cssText = 'position:fixed;top:100px;left:50%;transform:translateX(-50%);z-index:4000;display:flex;flex-direction:column;align-items:center;gap:12px;';
      demo.forEach(([type, text, badge], i) => {
        const d = document.createElement('div');
        d.className = 'el-message kokomi-toast el-message--' + type;
        d.style.cssText = 'position:relative;';
        d.innerHTML = '<i class="el-icon el-message__icon el-message-icon--' + type + '">' +
          '<svg viewBox="0 0 1024 1024" width="13" height="13"><path fill="currentColor" d="' + [
            'M512 64a448 448 0 1 1 0 896 448 448 0 0 1 0-896m-55.8 536.4-99.5-99.6a38.4 38.4 0 1 0-54.4 54.4l126.8 126.7a38.27 38.27 0 0 0 54.4 0l254.7-254.8a38.4 38.4 0 1 0-54.3-54.3z',
            'M512 64a448 448 0 1 1 0 896 448 448 0 0 1 0-896m0 224a38.4 38.4 0 0 0-38.4 38.4v192a38.4 38.4 0 0 0 76.8 0v-192A38.4 38.4 0 0 0 512 288m0 320a40 40 0 1 0 0 80 40 40 0 0 0 0-80',
            'M512 64a448 448 0 1 1 0 896 448 448 0 0 1 0-896m0 224a38.4 38.4 0 0 0-38.4 38.4v192a38.4 38.4 0 0 0 76.8 0v-192A38.4 38.4 0 0 0 512 288m0 320a40 40 0 1 0 0 80 40 40 0 0 0 0-80',
            'M512 64a448 448 0 1 1 0 896 448 448 0 0 1 0-896m0 224a38.4 38.4 0 0 0-38.4 38.4v192a38.4 38.4 0 0 0 76.8 0v-192A38.4 38.4 0 0 0 512 288m0 320a40 40 0 1 0 0 80 40 40 0 0 0 0-80',
          ][i] + '"/></svg></i>' +
          '<p class="el-message__content">' + text + '</p>' +
          (badge ? '<span class="el-message__badge"><sup class="el-badge__content el-badge__content--danger">' + badge + '</sup></span>' : '');
        if (i > 1) { d.style.marginLeft = '0'; }
        wrap.appendChild(d);
      });
      document.body.appendChild(wrap);
      const b = wrap.getBoundingClientRect();
      return { x: b.left - 16, y: b.top - 16, width: b.width + 32, height: b.height + 32 };
    })()`);
    await sleep(600);

    const clipShot = async (name) => {
      const r = await send("Page.captureScreenshot", {
        format: "png",
        clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 3 },
      });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64"));
      console.log("  截图 -> shots/" + name);
    };

    await clipShot("toast-zoom-light.png");
    await evaluate(`document.documentElement.classList.add('dark')`);
    await sleep(800);
    await clipShot("toast-zoom-dark.png");

    // 移动端：390 宽，验证长文案换行与留边
    await evaluate(`document.documentElement.classList.remove('dark')`);
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(800);
    const mbox = await evaluate(`(() => {
      const wrap = document.querySelector('.zoast');
      wrap.style.maxWidth = 'calc(100vw - 16px)';
      wrap.querySelectorAll('.el-message').forEach((d) => {
        d.style.width = 'calc(100vw - 32px)';
      });
      const b = wrap.getBoundingClientRect();
      return { x: 0, y: Math.max(0, b.top - 8), width: 390, height: b.height + 16 };
    })()`);
    await sleep(400);
    const rm = await send("Page.captureScreenshot", {
      format: "png",
      clip: { x: mbox.x, y: mbox.y, width: mbox.width, height: mbox.height, scale: 2 },
    });
    fs.writeFileSync(path.join(OUT, "toast-mobile.png"), Buffer.from(rm.result.data, "base64"));
    console.log("  截图 -> shots/toast-mobile.png");
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
