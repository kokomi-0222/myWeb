// 话题动态化验证：首页话题栏 / 发布框分类 / 站长新建入口
// 用法：
//   1) 起后端（本地 8091）
//   2) PREVIEW_ROOT=myWeb/vue/dist_topic2 UPSTREAM=http://localhost:8091 PORT=5191 node local-preview.js
//   3) TEST_BASE=http://localhost:5191 node tools/test-topic-dynamic.js
//
// 登录态用真实 token（shots/tmp/tokens.json），不走 MOCK_USER，
// 这样能真正验证「权限 → 前端按钮显隐」这条链路。
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9381;
const BASE = process.env.TEST_BASE || "http://localhost:5191";
const OUT = path.resolve(__dirname, "../shots");
const TOKENS = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../shots/tmp/tokens.json"), "utf-8")
);
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
      "--window-size=1440,1100",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-topic-test",
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
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    return r.result?.result?.value;
  };
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64"));
    console.log("  截图 -> shots/" + name);
  };
  const clickAt = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    await sleep(60);
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
  };
  const clickSel = async (sel) => {
    const p = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return null;
      const b = el.getBoundingClientRect();
      if (!b.width) return null;
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    if (!p) return false;
    await clickAt(p.x, p.y);
    return true;
  };

  const loginAs = async (token) => {
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem('token', ${JSON.stringify(token)}); } catch (e) {}`,
    });
    await send("Page.navigate", { url: BASE + "/" });
    await sleep(3000);
  };

  // ---------- 1. 站长视角：首页话题栏 ----------
  console.log("\n[1] 站长登录，看首页话题栏");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem('token', ${JSON.stringify(TOKENS.admin)}); } catch (e) {}`,
  });
  await send("Page.navigate", { url: BASE + "/" });
  await sleep(3500);

  const homeTopics = await evaluate(`(() => {
    const items = [...document.querySelectorAll('.topic-list .topic-name')].map(e => e.textContent.trim());
    return { items, loggedIn: !!document.querySelector('.header-bar-avatar, .avatar') };
  })()`);
  console.log("  话题栏:", JSON.stringify(homeTopics));
  await shot("topic-home-admin.png");

  // ---------- 2. 发布框分类 + 新建入口 ----------
  console.log("\n[2] 个人空间发布框");
  await send("Page.navigate", { url: BASE + "/space/home" });
  await sleep(3000);
  const pubState = await evaluate(`(() => ({
    tags: [...document.querySelectorAll('.publishing-category .category-tag')].map(e => e.textContent.trim()),
    hasAddBtn: !!document.querySelector('.category-tag--add'),
    url: location.href,
  }))()`);
  console.log("  发布框:", JSON.stringify(pubState));
  await shot("topic-publish-admin.png");

  // ---------- 3. 点「+ 新建话题」 ----------
  console.log("\n[3] 点「+ 新建话题」");
  const clicked = await clickSel(".category-tag--add");
  console.log("  点到按钮:", clicked);
  await sleep(700);
  const dialogUp = await evaluate(
    `!!document.querySelector('.el-overlay-message-box .el-message-box')`
  );
  console.log("  弹框出现:", dialogUp);
  await shot("topic-create-dialog.png");

  // 输入并创建
  if (dialogUp) {
    await evaluate(`(() => {
      const input = document.querySelector('.el-message-box__input input');
      if (input) input.focus();
      return !!input;
    })()`);
    await sleep(200);
    await send("Input.insertText", { text: "摄影" });
    await sleep(300);
    await shot("topic-create-dialog-typed.png");
    await clickSel(".el-message-box__btns .el-button--primary");
    await sleep(1600);
    const afterCreate = await evaluate(`(() => ({
      tags: [...document.querySelectorAll('.publishing-category .category-tag')].map(e => e.textContent.trim()),
      active: document.querySelector('.publishing-category .category-tag.active')?.textContent.trim() || null,
      toast: document.querySelector('.kokomi-toast')?.textContent.trim() || null,
      dialogGone: !document.querySelector('.el-overlay-message-box .el-message-box'),
    }))()`);
    console.log("  创建后:", JSON.stringify(afterCreate));
    await shot("topic-after-create.png");
  }

  // ---------- 4. 普通用户看不到入口 ----------
  console.log("\n[4] 换成普通用户（member），确认看不到新建入口");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem('token', ${JSON.stringify(TOKENS.member)}); } catch (e) {}`,
  });
  await send("Page.navigate", { url: BASE + "/space/home" });
  await sleep(3500);
  const memberState = await evaluate(`(() => ({
    tags: [...document.querySelectorAll('.publishing-category .category-tag')].map(e => e.textContent.trim()),
    hasAddBtn: !!document.querySelector('.category-tag--add'),
    url: location.href,
  }))()`);
  console.log("  普通用户发布框:", JSON.stringify(memberState));
  await shot("topic-publish-member.png");

  console.log("\n完成");
  proc.kill();
  process.exit(0);
})();
