// 后台「角色权限」页验证：新建角色 → 勾权限 → 保存 → 用户管理页能看到 → 删掉
// 用法：
//   1) 本地后端跑在 18080
//   2) PREVIEW_ROOT=myWeb/vue/dist_roles UPSTREAM=http://127.0.0.1:18080 PORT=5194 node local-preview.js
//   3) TEST_BASE=http://localhost:5194 node tools/test-roles-page.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9396;
const BASE = process.env.TEST_BASE || "http://localhost:5194";
const OUT = path.resolve(__dirname, "../shots");
const TOKENS = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../shots/tmp/tokens.json"), "utf-8")
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROLE_NAME = "审核员";

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
      "--window-size=1440,900",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-roles-test",
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
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "light" }],
  });

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.result?.exceptionDetails) {
      console.log("  [JS ERROR]", r.result.exceptionDetails.text);
    }
    return r.result?.result?.value;
  };
  const shot = async (name) => {
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 1430,
      y: 890,
      button: "none",
    });
    await sleep(220);
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
  const clickByExpr = async (findExpr) => {
    const p = await evaluate(`(() => {
      const el = (${findExpr});
      if (!el) return null;
      const b = el.getBoundingClientRect();
      if (!b.width) return null;
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    if (!p) return false;
    await clickAt(p.x, p.y);
    return true;
  };
  // 轮询等条件成立，不固定 sleep
  const waitFor = async (expr, label, timeout = 8000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await evaluate(expr)) return true;
      await sleep(150);
    }
    console.log(`  [超时] ${label}`);
    return false;
  };

  const state = () =>
    evaluate(`(() => {
      const active = document.querySelector('.role-item.is-active');
      return {
        count: document.querySelectorAll('.role-item').length,
        names: [...document.querySelectorAll('.role-item__top')].map(el => el.textContent.replace(/\\s+/g,'')),
        activeName: active ? active.querySelector('.role-item__name').textContent.trim() : null,
        groups: [...document.querySelectorAll('.perm-group__title > span')].map(el => el.textContent.trim()),
        chips: document.querySelectorAll('.perm-chip').length,
        on: [...document.querySelectorAll('.perm-chip.is-on')].map(el => el.querySelector('.perm-chip__text').textContent.trim()),
        panelName: document.querySelector('.role-panel__name')?.value ?? null,
        hasDelete: !!document.querySelector('.role-danger'),
        dirtyGuard: false,
      };
    })()`);

  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem('token', ${JSON.stringify(TOKENS.admin)}); } catch (e) {}`,
  });

  console.log("\n[1] 打开 /admin/roles");
  await send("Page.navigate", { url: BASE + "/admin/roles" });
  await waitFor(`document.querySelectorAll('.role-item').length > 0`, "角色列表出现");
  await sleep(400);
  console.log("  ", JSON.stringify(await state()));
  await shot("roles-1-list.png");

  // 内置角色不该有删除按钮
  console.log("\n[2] 点「版主」看现有权限");
  await clickByExpr(`[...document.querySelectorAll('.role-item')].find(el => el.textContent.includes('版主'))`);
  await sleep(400);
  const m = await state();
  console.log("  ", JSON.stringify({ activeName: m.activeName, on: m.on, hasDelete: m.hasDelete }));
  await shot("roles-2-moderator.png");

  console.log("\n[3] 新建角色「审核员」");
  await clickByExpr(`[...document.querySelectorAll('button')].find(el => el.textContent.trim() === '新建角色')`);
  await sleep(300);
  await clickByExpr(`document.querySelector('.role-panel__name')`);
  await send("Input.insertText", { text: ROLE_NAME });
  await sleep(200);
  // 勾「删除他人帖子」+「处理举报」
  await clickByExpr(`[...document.querySelectorAll('.perm-chip')].find(el => el.textContent.includes('删除他人帖子'))`);
  await clickByExpr(`[...document.querySelectorAll('.perm-chip')].find(el => el.textContent.includes('处理举报'))`);
  await sleep(250);
  const d = await state();
  console.log("  草稿:", JSON.stringify({ panelName: d.panelName, on: d.on }));
  await shot("roles-3-new-draft.png");

  await clickByExpr(`[...document.querySelectorAll('button')].find(el => el.textContent.trim() === '保存')`);
  await waitFor(
    `[...document.querySelectorAll('.role-item__name')].some(el => el.textContent.trim() === '${ROLE_NAME}')`,
    "新角色出现在列表"
  );
  await sleep(400);
  const after = await state();
  console.log("  ", JSON.stringify({ count: after.count, names: after.names, on: after.on, hasDelete: after.hasDelete }));
  await shot("roles-4-created.png");

  console.log("\n[4] 用户管理页应该能看到「审核员」标签");
  await send("Page.navigate", { url: BASE + "/admin/users" });
  await waitFor(`document.querySelectorAll('.role-chip').length > 0`, "用户列表出现");
  await sleep(500);
  const chips = await evaluate(
    `[...new Set([...document.querySelectorAll('.role-chip')].map(el => el.textContent.trim()))]`
  );
  console.log("  角色标签:", JSON.stringify(chips));
  console.log("  含审核员:", chips.includes(ROLE_NAME));
  await shot("roles-5-users-chips.png");

  console.log("\n[5] 回角色页删掉它");
  await send("Page.navigate", { url: BASE + "/admin/roles" });
  await waitFor(`document.querySelectorAll('.role-item').length > 0`, "角色列表出现");
  await clickByExpr(`[...document.querySelectorAll('.role-item')].find(el => el.textContent.includes('${ROLE_NAME}'))`);
  await sleep(400);
  const del = await clickByExpr(`document.querySelector('.role-danger')`);
  console.log("  点删除:", del);
  await waitFor(`!!document.querySelector('.el-message-box')`, "确认框出现");
  await sleep(400);
  const box = await evaluate(`(() => {
    const b = document.querySelector('.el-message-box');
    return b ? { title: b.querySelector('.el-message-box__title')?.textContent.trim(),
                 msg: b.querySelector('.el-message-box__message')?.textContent.trim() } : null;
  })()`);
  console.log("  确认框:", JSON.stringify(box));
  await shot("roles-6-delete-confirm.png");
  await clickByExpr(`document.querySelector('.el-message-box__btns .el-button--primary')`);
  await waitFor(
    `![...document.querySelectorAll('.role-item__name')].some(el => el.textContent.trim() === '${ROLE_NAME}')`,
    "角色从列表消失"
  );
  await sleep(500);
  const fin = await state();
  console.log("  ", JSON.stringify({ count: fin.count, names: fin.names }));
  await shot("roles-7-deleted.png");

  console.log("\n[6] 暗色主题");
  await evaluate(`localStorage.setItem('kokomi-theme','dark')`);
  await send("Page.reload", { ignoreCache: true });
  await waitFor(`document.querySelectorAll('.role-item').length > 0`, "角色列表出现");
  await sleep(600);
  console.log("  dark:", await evaluate(`document.documentElement.classList.contains('dark')`));
  await shot("roles-8-dark.png");
  await evaluate(`localStorage.setItem('kokomi-theme','light')`);

  console.log("\n[7] 小屏 390x844");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send("Page.reload", { ignoreCache: true });
  await waitFor(`document.querySelectorAll('.role-item').length > 0`, "角色列表出现");
  await sleep(700);
  const mob = await evaluate(`(() => {
    const list = document.querySelector('.role-list');
    return {
      noHScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
      listScrollX: list ? list.scrollWidth > list.clientWidth : null,
      panelW: Math.round(document.querySelector('.role-panel').getBoundingClientRect().width),
      viewport: window.innerWidth,
      chipsPerRow: getComputedStyle(document.querySelector('.perm-group__items')).flexWrap,
    };
  })()`);
  console.log("  ", JSON.stringify(mob));
  await shot("roles-9-mobile.png");

  ws.close();
  proc.kill();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
