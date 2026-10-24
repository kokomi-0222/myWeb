// 验证「分享 = 直接复制帖子链接」：点更多菜单里的「分享」后
//   1) 不出现 .share-panel 弹窗
//   2) 剪贴板拿到 http://<host>/post/<id>
//   3) 出现「链接已复制」toast
// 用法：
//   PREVIEW_ROOT=myWeb/vue/dist_share PORT=5184 node local-preview.js
//   TEST_BASE=http://localhost:5184 node tools/test-share-copy.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9351;
const BASE = process.env.TEST_BASE || "http://localhost:5184";
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
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-share-copy-test",
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
    await sleep(120);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(500);
  };

  try {
    console.log(`\n[0] 打开首页 ${BASE}`);
    await send("Page.navigate", { url: `${BASE}/` });
    const listOk = await waitFor("document.querySelectorAll('.post-card').length > 0", 30000);
    console.log("  帖子列表渲染:", listOk);
    if (!listOk) throw new Error("列表没出来（后端不可达？）");

    // 记录剪贴板写入内容，避免 headless 下读剪贴板权限问题
    await evaluate(`(() => {
      window.__copied = null;
      try {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } },
        });
        return 'patched';
      } catch (e) { return 'failed: ' + e.message; }
    })()`).then((r) => console.log("  剪贴板打桩:", r));

    const postId = await evaluate(`(() => {
      const el = document.querySelector('.post-card');
      return el ? (el.dataset.id || null) : null;
    })()`);

    console.log("\n[1] hover 第一条帖子的「更多」触发菜单");
    const trig = await evaluate(`(() => {
      const el = document.querySelector('.post-card .post-card__more-trigger');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    if (!trig) throw new Error("找不到更多菜单触发器");
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: trig.x, y: trig.y, button: "none" });
    await sleep(700);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: trig.x + 4, y: trig.y + 4, button: "none" });
    await sleep(700);

    const menuItems = await evaluate(`(() => {
      const all = [...document.querySelectorAll('.more-actions-item')];
      return all
        .filter((e) => e.getBoundingClientRect().width > 0)
        .map((e) => e.textContent.trim());
    })()`);
    console.log("  菜单项:", JSON.stringify(menuItems));

    if (!menuItems || !menuItems.includes("分享")) {
      await clickAt(trig.x, trig.y); // hover 没出菜单就退回点击
      await sleep(700);
    }

    const shareRect = await evaluate(`(() => {
      const all = [...document.querySelectorAll('.more-actions-item')];
      const el = all.find((e) => e.textContent.trim() === '分享' && e.getBoundingClientRect().width > 0);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    if (!shareRect) throw new Error("找不到「分享」菜单项");

    console.log("\n[2] 点击「分享」");
    await clickAt(shareRect.x, shareRect.y);
    await sleep(600);

    const result = await evaluate(`(() => {
      const toast = [...document.querySelectorAll('.el-message, .my-message')]
        .map((e) => e.textContent.trim())
        .filter(Boolean);
      return {
        copied: window.__copied,
        panelExists: !!document.querySelector('.share-panel'),
        overlayExists: !!document.querySelector('.share-overlay'),
        toasts: toast,
        inputInPage: !!document.querySelector('.share-panel__input'),
      };
    })()`);
    console.log("  结果:", JSON.stringify(result, null, 2));

    const expect = `${BASE}/post/`;
    const pass =
      !result.panelExists &&
      !result.overlayExists &&
      typeof result.copied === "string" &&
      result.copied.startsWith(expect) &&
      result.toasts.some((t) => t.includes("链接已复制"));

    await shot("share-copy.png");
    console.log(`\n  帖子 id: ${postId}`);
    console.log(`  校验: 无面板=${!result.panelExists} 复制链接=${result.copied} toast=${result.toasts.join("|")}`);
    console.log(pass ? "\n✅ 通过：分享直接复制链接，无弹窗" : "\n❌ 未通过");
    process.exitCode = pass ? 0 : 2;
  } catch (e) {
    console.error("\n测试异常:", e.message);
    await shot("share-copy-error.png").catch(() => {});
    process.exitCode = 1;
  } finally {
    try {
      ws.close();
    } catch {}
    proc.kill();
  }
})();
