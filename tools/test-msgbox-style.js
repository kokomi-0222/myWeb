// 验证确认弹框（ElMessageBox）新样式：亮色 + 暗色各截一张
// 用法：
//   PREVIEW_ROOT=myWeb/vue/dist_mb PORT=5186 MOCK_USER=1 node local-preview.js
//   TEST_BASE=http://localhost:5186 node tools/test-msgbox-style.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9353;
const BASE = process.env.TEST_BASE || "http://localhost:5186";
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
      "--window-size=1440,1000",
      "--force-device-scale-factor=2",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-msgbox-test",
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
    height: 1000,
    deviceScaleFactor: 2,
    mobile: false,
  });
  // MOCK_USER 模式下需要一个假 token 才会走登录态
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem('token', 'mock-preview-token'); } catch (e) {}`,
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
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(500);
  };
  const clickSel = async (sel) => {
    const rect = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return null;
      const b = el.getBoundingClientRect();
      if (b.width === 0) return null;
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    if (!rect) return false;
    await clickAt(rect.x, rect.y);
    return true;
  };

  try {
    console.log(`\n[1] 打开首页 ${BASE}`);
    await send("Page.navigate", { url: `${BASE}/` });
    const ok = await waitFor("document.querySelectorAll('.post-card').length > 0", 30000);
    console.log("  列表渲染:", ok);
    if (!ok) throw new Error("列表没出来");

    console.log("\n[2] 点「转发」触发确认框");
    const clicked = await clickSel('.post-card__stat[title="转发这条帖子"]');
    console.log("  点击转发:", clicked);
    const boxOk = await waitFor("!!document.querySelector('.el-message-box')", 8000);
    console.log("  确认框出现:", boxOk);
    if (!boxOk) throw new Error("确认框没出现（可能未处于登录态）");

    await sleep(500);
    const info = await evaluate(`(() => {
      const box = document.querySelector('.el-message-box');
      const btn1 = box.querySelector('.el-button--primary');
      const btn0 = box.querySelector('.el-button--default');
      const status = box.querySelector('.el-message-box__status');
      const bs = getComputedStyle(box);
      return {
        customClass: box.className,
        width: Math.round(box.getBoundingClientRect().width),
        radius: bs.borderRadius,
        bg: bs.backgroundColor,
        title: (box.querySelector('.el-message-box__title') || {}).textContent,
        content: (box.querySelector('.el-message-box__message') || {}).textContent,
        primaryBg: btn1 ? getComputedStyle(btn1).backgroundColor : null,
        primaryRadius: btn1 ? getComputedStyle(btn1).borderRadius : null,
        defaultBg: btn0 ? getComputedStyle(btn0).backgroundColor : null,
        statusSize: status ? Math.round(status.getBoundingClientRect().width) : null,
        statusBg: status ? getComputedStyle(status).backgroundColor : null,
        statusHtml: status ? status.outerHTML.slice(0, 300) : null,
        btnsHtml: box.querySelector('.el-message-box__btns') ? box.querySelector('.el-message-box__btns').innerHTML.slice(0, 500) : null,
      };
    })()`);
    console.log("  样式:", JSON.stringify(info, null, 2));
    await shot("msgbox-light.png");

    console.log("\n[3] 切暗色");
    await evaluate(`document.documentElement.classList.add('dark')`);
    await sleep(700);
    const darkInfo = await evaluate(`(() => {
      const box = document.querySelector('.el-message-box');
      const btn0 = box.querySelector('.el-button--default');
      const bs = getComputedStyle(box);
      return { bg: bs.backgroundColor, defaultBg: btn0 ? getComputedStyle(btn0).backgroundColor : null };
    })()`);
    console.log("  暗色:", JSON.stringify(darkInfo));
    await shot("msgbox-dark.png");

    // 顺手验证危险操作（删除类）的红色确认键
    console.log("\n[4] danger-confirm 危险样式");
    await evaluate(`document.querySelector('.el-message-box').classList.add('danger-confirm')`);
    await sleep(400);
    const dangerBg = await evaluate(
      `getComputedStyle(document.querySelector('.el-message-box .el-button--primary')).backgroundColor`
    );
    console.log("  确认键底色:", dangerBg);
    await shot("msgbox-danger.png");

    const pass =
      info.radius === "16px" &&
      info.width === 380 &&
      info.statusSize === 36 &&
      info.primaryRadius === "8px" &&
      darkInfo.bg !== info.bg;
    console.log(pass ? "\n✅ 通过：弹框已套用新样式，亮/暗主题均生效" : "\n⚠️ 部分样式未生效，看上面的实际值");
    process.exitCode = pass ? 0 : 2;
  } catch (e) {
    console.error("\n测试异常:", e.message);
    await shot("msgbox-error.png").catch(() => {});
    process.exitCode = 1;
  } finally {
    try {
      ws.close();
    } catch {}
    proc.kill();
  }
})();
