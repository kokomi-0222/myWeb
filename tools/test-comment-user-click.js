// 验证评论区「点头像/昵称跳用户主页」
// 用法：MSYS_NO_PATHCONV=1 TEST_BASE=http://localhost:5180 node tools/test-comment-user-click.js
// 用 CDP 派发真实鼠标事件（不是 el.click()），能测出被遮挡的情况
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9345;
const BASE = process.env.TEST_BASE || "http://localhost:5180";
const POST = process.env.POST_ID || "16";
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
      "--window-size=1440,1200",
      "--force-device-scale-factor=1",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-comment-click",
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

  // 详情页 / 评论接口需要登录态
  const TOKEN = process.env.TEST_TOKEN || "";
  if (TOKEN) {
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem('token', ${JSON.stringify(TOKEN)}); } catch (e) {}`,
    });
  }

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    return r.result?.result?.value;
  };

  const clickAt = async (x, y) => {
    for (const type of ["mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", {
        type,
        x,
        y,
        button: "left",
        clickCount: 1,
        buttons: type === "mousePressed" ? 1 : 0,
      });
      await sleep(60);
    }
  };

  const open = async (url, wait = 3500) => {
    await send("Page.navigate", { url });
    await sleep(wait);
  };

  const findTarget = (sel) => `(() => {
    const els = [...document.querySelectorAll('${sel}')];
    const el = els[0];
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    // 用 elementFromPoint 确认这个坐标真的能点到目标（不是被别的元素压住）
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return JSON.stringify({
      count: els.length,
      text: (el.textContent || '').trim().slice(0, 20),
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
      hitTag: hit ? hit.tagName.toLowerCase() : null,
      hitInside: hit ? el.contains(hit) : false,
    });
  })()`;

  await open(`${BASE}/post/${POST}`, 5000);

  const cases = [
    [".comment-author", "评论作者昵称"],
    [".comment-avatar", "评论作者头像"],
  ];

  for (const [sel, label] of cases) {
    await open(`${BASE}/post/${POST}`, 4000);
    const raw = await evaluate(findTarget(sel));
    if (!raw) {
      console.log(`✗ ${label}: 页面上没找到 ${sel}`);
      continue;
    }
    const info = JSON.parse(raw);
    console.log(`\n[${label}] 共 ${info.count} 个，第一个是「${info.text}」`);
    console.log(`  坐标 (${info.x}, ${info.y})，该点内部元素: ${info.hitTag}，命中目标内: ${info.hitInside}`);
    await clickAt(info.x, info.y);
    await sleep(1200);
    const after = await evaluate("location.pathname");
    console.log(`  点击后路径: ${after}  ${(after.startsWith("/user/") || after.startsWith("/space")) ? "✓ 跳转成功" : "✗ 没跳转"}`);
  }

  // 回复里的作者（如果有）。折叠状态下只显示高赞回复，
  // 没有高赞时要先点「共 N 条回复，点击查看」把回复展开
  await open(`${BASE}/post/${POST}`, 4000);
  let hasReply = await evaluate("!!document.querySelector('.reply-author')");
  if (!hasReply) {
    const summary = await evaluate(`(() => {
      const btn = document.querySelector('.reply-summary-action');
      if (!btn) return null;
      btn.scrollIntoView({ block: 'center' });
      const r = btn.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    })()`);
    if (summary) {
      const p = JSON.parse(summary);
      console.log(`\n  折叠中，先点「点击查看」展开 (${p.x}, ${p.y})`);
      await clickAt(p.x, p.y);
      await sleep(900);
      hasReply = await evaluate("!!document.querySelector('.reply-author')");
    }
  }
  if (hasReply) {
    const raw = await evaluate(findTarget(".reply-author"));
    const info = JSON.parse(raw);
    console.log(`\n[回复作者昵称] 共 ${info.count} 个，第一个是「${info.text}」`);
    await clickAt(info.x, info.y);
    await sleep(1200);
    const after = await evaluate("location.pathname");
    console.log(`  点击后路径: ${after}  ${(after.startsWith("/user/") || after.startsWith("/space")) ? "✓ 跳转成功" : "✗ 没跳转"}`);
  } else {
    console.log("\n[回复作者昵称] 页面无回复，跳过");
  }

  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const shot = await send("Page.captureScreenshot", { format: "png" });
  if (shot.result?.data) {
    fs.writeFileSync(path.join(OUT, "comment-click-result.png"), Buffer.from(shot.result.data, "base64"));
    console.log("\n截图 -> shots/comment-click-result.png");
  }

  proc.kill();
  process.exit(0);
})();
