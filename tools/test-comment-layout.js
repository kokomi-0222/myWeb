// 评论区布局验证：头像与昵称是否垂直居中对齐（同一水平中线），正文与昵称的间距。
// 用法：node tools/test-comment-layout.js（需 18080 后端 + 5194 预览）
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9399;
const BASE = process.env.TEST_BASE || "http://localhost:5194";
const POST_ID = process.env.POST_ID || "16";
const OUT = path.resolve(__dirname, "../shots");
const TOKENS = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../shots/tmp/tokens.json"), "utf-8")
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-proxy-server",
      `--remote-debugging-port=${DBG_PORT}`,
      "--window-size=1280,900",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-comment-layout",
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  await sleep(2500);
  let list = [];
  for (let i = 0; i < 12; i++) {
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
  // 帖子详情接口需要登录态，先预置 token（每次导航都会生效）
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem('token', ${JSON.stringify(TOKENS.admin)}); } catch (e) {}`,
  });

  const viewport = async (w, h, mobile) =>
    send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile,
    });

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.result?.exceptionDetails)
      console.log("  [JS ERROR]", r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };

  const shot = async (name) => {
    // 先把鼠标挪到角落，避免残留 hover 底色
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 5,
      y: 5,
      button: "none",
    });
    await sleep(120);
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(s.result.data, "base64"));
    console.log("  截图 -> shots/" + name);
  };

  const measure = () =>
    evaluate(`(() => {
      const item = document.querySelector('.comment-item');
      if (!item) return null;
      const av = item.querySelector('.comment-avatar img') || item.querySelector('.comment-avatar');
      const nm = item.querySelector('.comment-author');
      const mh = item.querySelector('.comment-header');
      const main = item.querySelector('.comment-main');
      const tx = item.querySelector('.comment-text');
      const r = (el) => { const b = el.getBoundingClientRect(); return {
        top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1),
        h: +b.height.toFixed(1), centerY: +((b.top + b.bottom) / 2).toFixed(1) }; };
      const a = r(av), n = r(nm), h = r(mh), m = r(main);
      return {
        avatar: a, name: n, header: h,
        nameOffsetFromAvatarCenter: +(n.centerY - a.centerY).toFixed(1),
        gapNameBottomToTextTop: +(r(tx).top - n.bottom).toFixed(1),
        // 正文左边缘应与昵称左边缘对齐（同一条竖线）
        textLeftDelta: +(tx.getBoundingClientRect().left - nm.getBoundingClientRect().left).toFixed(1),
        headerMinHeight: getComputedStyle(mh).minHeight,
      };
    })()`);

  await viewport(1280, 900, false);
  await send("Page.navigate", { url: BASE + "/post/" + POST_ID });
  for (let i = 0; i < 50; i++) {
    if (await evaluate(`!!document.querySelector('.comment-item')`)) break;
    await sleep(200);
  }
  await sleep(600);
  await evaluate(`document.querySelector('.comment-item').scrollIntoView({block:'center'})`);
  await sleep(400);

  let m = await measure();
  console.log("桌面 / 亮色:", JSON.stringify(m, null, 0));
  await shot("comment-layout-1-light.png");

  // 暗色
  await evaluate(
    `localStorage.setItem('kokomi-theme','dark');document.documentElement.classList.add('dark');true`
  );
  await sleep(400);
  await shot("comment-layout-2-dark.png");
  await evaluate(
    `localStorage.setItem('kokomi-theme','light');document.documentElement.classList.remove('dark');true`
  );

  // 移动端 390
  await viewport(390, 844, true);
  await sleep(400);
  await evaluate(`document.querySelector('.comment-item').scrollIntoView({block:'center'})`);
  await sleep(400);
  m = await measure();
  console.log("390 小屏:", JSON.stringify(m, null, 0));
  const overflow = await evaluate(
    `document.documentElement.scrollWidth - document.documentElement.clientWidth`
  );
  console.log("  横向溢出:", overflow);
  await shot("comment-layout-3-mobile.png");

  ws.close();
  proc.kill();
  const ok =
    m && Math.abs(m.nameOffsetFromAvatarCenter) <= 1.5 && m.gapNameBottomToTextTop >= 10;
  console.log("\n结论:", ok ? "PASS 昵称与头像同中线，正文已下移" : "FAIL 见上面的数值");
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
