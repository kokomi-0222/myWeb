// 登录弹窗：点外面不关闭（只有右上角 × 能关）
//   [1] 打开弹窗，往输入框里填内容
//   [2] 真实鼠标点蒙层左上角 → 弹窗不能消失、填的内容不能丢
//   [3] 点右上角 × → 弹窗关闭
// 用法：node tools/check-modal-outside.js（需 5194 预览，不需要后端）
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9443;
const BASE = process.env.TEST_BASE || "http://localhost:5194";
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PASS = [];
const FAIL = [];
const check = (name, ok, detail = "") => {
  (ok ? PASS : FAIL).push(name);
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
};

const get = (p) =>
  new Promise((res, rej) => {
    http
      .get({ host: "127.0.0.1", port: DBG_PORT, path: p }, (r) => {
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
      "--headless=new", "--disable-gpu", "--no-sandbox", "--no-proxy-server",
      `--remote-debugging-port=${DBG_PORT}`,
      "--window-size=1200,1000",
      `--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-modal-out-${process.pid}`,
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  await sleep(2500);
  let list = [];
  for (let i = 0; i < 12; i++) {
    try { list = await get("/json/list"); break; } catch { await sleep(500); }
  }
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false,
  });

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result?.result?.value;
  };
  const until = async (expr, timeout = 12000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { if (await evaluate(expr)) return true; } catch { /* 导航中 */ }
      await sleep(150);
    }
    return false;
  };
  const shot = async (name) => {
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(s.result.data, "base64"));
    console.log("  截图 -> shots/" + name);
  };
  const clickAt = async (x, y) => {
    for (const type of ["mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
      await sleep(60);
    }
  };
  const nav = async (url) => {
    const origin = new URL(url).origin;
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) {
      let ok = false;
      try { ok = await evaluate(`location.origin === ${JSON.stringify(origin)}`); } catch { /* 导航中 */ }
      if (ok) break;
      await sleep(150);
    }
    await until("document.readyState === 'complete'");
    await sleep(600);
  };

  try {
    console.log("\n[1] 打开登录弹窗并填内容");
    await nav(BASE + "/");
    await evaluate(`localStorage.removeItem('token')`);
    await nav(BASE + "/");
    await evaluate(`document.querySelector('.login-button').click()`);
    check("登录弹窗已打开", await until(`!!document.querySelector('.modal-overlay')`));
    await evaluate(`(() => {
      const i = document.querySelector('.modal-container .input-line-wrapper input');
      i.value = 'filled_by_test';
      i.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    const before = await evaluate(
      `document.querySelector('.modal-container .input-line-wrapper input')?.value`);
    check("输入框已填入测试内容", before === "filled_by_test", before);

    console.log("\n[2] 真实鼠标点蒙层空白处（左上角 10,10）");
    await clickAt(10, 10);
    await sleep(400);
    const stillOpen = await evaluate(`!!document.querySelector('.modal-overlay')`);
    check("点外面后弹窗仍然开着", stillOpen === true, String(stillOpen));
    const after = await evaluate(
      `document.querySelector('.modal-container .input-line-wrapper input')?.value`);
    check("填的内容没丢", after === "filled_by_test", String(after));
    await shot("modal-click-outside-kept.png");

    console.log("\n[3] 点蒙层中心偏下的空白（更贴近真实误触）");
    await clickAt(600, 980);
    await sleep(400);
    check("又一次点外面，弹窗仍开着", await evaluate(`!!document.querySelector('.modal-overlay')`) === true);

    console.log("\n[4] 点右上角 × 才关闭");
    const box = await evaluate(`(() => {
      const b = document.querySelector('.modal-close');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    check("关闭按钮存在", !!box, JSON.stringify(box));
    await clickAt(box.x, box.y);
    const closed = await until(`!document.querySelector('.modal-overlay')`, 4000);
    check("点 × 后弹窗关闭", closed);
    await shot("modal-closed-by-x.png");
  } finally {
    console.log(`\n结果：${PASS.length} 通过 / ${FAIL.length} 失败`);
    if (FAIL.length) console.log("失败项：" + FAIL.join("、"));
    ws.close();
    proc.kill();
    await sleep(300);
    process.exit(FAIL.length ? 1 : 0);
  }
})();
