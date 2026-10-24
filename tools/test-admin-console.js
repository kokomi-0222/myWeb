// 后台管理（/admin）验证：布局 / 概览 / 话题管理 / 用户管理 / 权限隔离
// 用法：
//   1) 起后端（本地 8091）
//   2) PREVIEW_ROOT=myWeb/vue/dist_admin3 UPSTREAM=http://localhost:8091 PORT=5193 node local-preview.js
//   3) TEST_BASE=http://localhost:5193 node tools/test-admin-console.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9385;
const BASE = process.env.TEST_BASE || "http://localhost:5193";
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
      "--window-size=1440,1000",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-admin-console-test",
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
    height: 1000,
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
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await sleep(60);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  };
  /** 用 JS 找到元素中心再发真实鼠标事件 */
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

  // ---------- 1. 概览 ----------
  console.log("\n[1] 站长进后台概览");
  // 注意：addScriptToEvaluateOnNewDocument 对**每个**新文档都生效，
  // 后面测普通用户前必须先移除，否则 token 又会被改回站长，测不出拦截。
  const injected = await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem('token', ${JSON.stringify(TOKENS.admin)}); } catch (e) {}`,
  });
  const injectedId = injected.result?.identifier;
  await send("Page.navigate", { url: BASE + "/admin/dashboard" });
  await sleep(3500);

  const dash = await evaluate(`(() => ({
    url: location.pathname,
    nav: [...document.querySelectorAll('.admin-nav__item')].map(e => e.textContent.trim()),
    title: document.querySelector('.admin-top__title')?.textContent.trim(),
    cards: [...document.querySelectorAll('.stat-card')].map(c => ({
      label: c.querySelector('.stat-card__label')?.textContent.trim(),
      value: c.querySelector('.stat-card__value')?.textContent.trim(),
      today: c.querySelector('.stat-card__today')?.textContent.trim(),
    })),
    users: [...document.querySelectorAll('.panel')][0]
      ? [...document.querySelectorAll('.panel')][0].querySelectorAll('.plain-row').length : 0,
    posts: [...document.querySelectorAll('.panel')][1]
      ? [...document.querySelectorAll('.panel')][1].querySelectorAll('.plain-row').length : 0,
    firstPost: [...document.querySelectorAll('.panel')][1]?.querySelector('.plain-row__title')?.textContent.trim(),
    firstPostTag: [...document.querySelectorAll('.panel')][1]?.querySelector('.plain-row__tag')?.textContent.trim(),
  }))()`);
  console.log("  URL:", dash.url);
  console.log("  侧栏:", JSON.stringify(dash.nav));
  console.log("  标题:", dash.title);
  dash.cards.forEach((c) => console.log("   ", c.label, c.value, "|", c.today));
  console.log("  最近注册行数:", dash.users, "最新帖子行数:", dash.posts);
  console.log("  第一条帖子:", dash.firstPost, "| 话题标签:", dash.firstPostTag);
  await shot("admin-dashboard.png");

  // ---------- 2. 暗色 ----------
  console.log("\n[2] 切暗色");
  await clickByExpr(`document.querySelector('.admin-top__icon')`);
  await sleep(900);
  const dark = await evaluate(`(() => {
    const side = document.querySelector('.admin-side');
    const card = document.querySelector('.stat-card');
    const title = document.querySelector('.stat-card__label');
    return {
      isDark: document.documentElement.classList.contains('dark'),
      sideBg: getComputedStyle(side).backgroundColor,
      cardBg: getComputedStyle(card).backgroundColor,
      labelColor: getComputedStyle(title).color,
    };
  })()`);
  console.log("  ", JSON.stringify(dark));
  await shot("admin-dashboard-dark.png");

  // 切回亮色，后面截图统一
  await clickByExpr(`document.querySelector('.admin-top__icon')`);
  await sleep(700);

  // ---------- 3. 话题管理 ----------
  console.log("\n[3] 话题管理");
  await clickByExpr(`[...document.querySelectorAll('.admin-nav__item')].find(a => a.textContent.includes('话题'))`);
  await sleep(2000);
  const topics = await evaluate(`(() => ({
    url: location.pathname,
    rows: [...document.querySelectorAll('.topic-row')].map(r => ({
      name: r.querySelector('.topic-row__title')?.textContent.trim(),
      value: r.querySelector('.topic-row__cell--value')?.textContent.trim(),
      count: [...r.querySelectorAll('.topic-row__cell')][1]?.textContent.trim(),
      delDisabled: [...r.querySelectorAll('.btn')].find(b => b.textContent.trim() === '删除')?.disabled ?? null,
    })),
  }))()`);
  console.log("  URL:", topics.url, "行数:", topics.rows.length);
  topics.rows.forEach((r) =>
    console.log("   ", r.name, "/", r.value, "帖子", r.count, "删除禁用:", r.delDisabled)
  );
  await shot("admin-topics.png");

  // 点第一行「编辑」进内联编辑态
  console.log("\n[4] 点第一行「编辑」");  const editOpened = await clickByExpr(
    `[...document.querySelectorAll('.topic-row')][0]?.querySelector('.btn')`
  );
  await sleep(600);
  const editState = await evaluate(`(() => {
    const row = document.querySelector('.topic-row');
    const sw = row?.querySelector('.swatch');
    const ci = row?.querySelector('.color-input');
    return {
      hasInput: !!row?.querySelector('.inline-input'),
      name: row?.querySelector('.inline-input')?.value,
      sort: row?.querySelector('.inline-input--num')?.value,
      buttons: [...(row?.querySelectorAll('.btn') || [])].map(b => b.textContent.trim()),
      swatchBg: sw ? getComputedStyle(sw).backgroundColor : null,
      swatchStyleAttr: sw?.getAttribute('style') || null,
      colorInputOpacity: ci ? getComputedStyle(ci).opacity : null,
    };
  })()`);
  console.log("  点到:", editOpened, JSON.stringify(editState));
  await shot("admin-topics-edit.png");

  // 取消
  await clickByExpr(
    `[...document.querySelectorAll('.topic-row .btn')].find(b => b.textContent.trim() === '取消')`
  );
  await sleep(400);

  // ---------- 4.5 新建 + 删除（顺带验确认弹框） ----------
  console.log("\n[4.5] 新建话题「验证话题」再删掉");
  await clickByExpr(`document.querySelector('.create-bar__input')`);
  await send("Input.insertText", { text: "验证话题" });
  await sleep(300);
  await clickByExpr(
    `[...document.querySelectorAll('.create-bar .btn')].find(b => b.textContent.includes('新建'))`
  );
  await sleep(1800);
  const afterCreate = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.topic-row')];
    const last = rows[rows.length - 1];
    return {
      total: rows.length,
      lastName: last?.querySelector('.topic-row__title')?.textContent.trim(),
      toast: document.querySelector('.kokomi-toast')?.textContent.trim() || null,
    };
  })()`);
  console.log("  新建后:", JSON.stringify(afterCreate));

  // 点最后一行的「删除」
  const delClicked = await clickByExpr(`(() => {
    const rows = [...document.querySelectorAll('.topic-row')];
    const last = rows[rows.length - 1];
    return [...last.querySelectorAll('.btn')].find(b => b.textContent.trim() === '删除');
  })()`);
  await sleep(900);
  const boxState = await evaluate(`(() => {
    const ov = document.querySelector('.el-overlay');
    const box = document.querySelector('.el-message-box');
    const cs = ov ? getComputedStyle(ov) : null;
    const bs = box ? getComputedStyle(box) : null;
    return {
      overlayDisplay: cs?.display,
      overlayOpacity: cs?.opacity,
      overlayPosition: cs?.position,
      overlayRect: ov ? JSON.stringify(ov.getBoundingClientRect()) : null,
      boxDisplay: bs?.display,
      boxTransform: bs?.transform,
      boxRect: box ? JSON.stringify(box.getBoundingClientRect()) : null,
      boxParent: box?.parentElement?.className,
      scrollY: window.scrollY,
      innerH: window.innerHeight,
      bodyH: document.body.scrollHeight,
      htmlH: document.documentElement.scrollHeight,
      title: box?.querySelector('.el-message-box__title')?.textContent.trim(),
      message: box?.querySelector('.el-message-box__message')?.textContent.trim(),
      danger: box?.classList.contains('danger-confirm'),
      btns: [...(box?.querySelectorAll('.el-message-box__btns .el-button') || [])].map(b => b.textContent.trim()),
    };
  })()`);
  console.log("  点删除:", delClicked, JSON.stringify(boxState));
  await shot("admin-topic-delete-confirm.png");

  // 确认删除：直接派发 DOM click，比按坐标点更稳（弹框可能在动画中）
  const confirmed = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.el-message-box__btns .el-button')]
      .find(b => b.textContent.trim() === '删除');
    if (!btn) return 'no-btn';
    btn.click();
    return 'clicked';
  })()`);
  console.log("  确认键:", confirmed);
  await sleep(1800);
  const afterDelete = await evaluate(`(() => ({
    total: document.querySelectorAll('.topic-row').length,
    toast: document.querySelector('.kokomi-toast')?.textContent.trim() || null,
  }))()`);
  console.log("  删除后:", JSON.stringify(afterDelete));

  // ---------- 5. 用户管理 ----------
  console.log("\n[5] 用户管理");
  await clickByExpr(`[...document.querySelectorAll('.admin-nav__item')].find(a => a.textContent.includes('用户'))`);
  await sleep(2000);
  const users = await evaluate(`(() => ({
    url: location.pathname,
    count: document.querySelector('.users-head__count')?.textContent.trim(),
    rows: document.querySelectorAll('.user-row').length,
    hasTitle: !!document.querySelector('.users-head__title'),
  }))()`);
  console.log("  URL:", users.url, "|", users.count, "| 行数:", users.rows, "| 旧标题已移除:", !users.hasTitle);
  await shot("admin-users.png");

  // ---------- 6. 前台顶栏的后台入口 ----------
  console.log("\n[6] 前台顶栏应多一个后台图标");
  await send("Page.navigate", { url: BASE + "/" });
  await sleep(3500);
  const front = await evaluate(`(() => ({
    switchButtons: [...document.querySelectorAll('.header-bar-switch button')].map(b => b.title),
  }))()`);
  console.log("  ", JSON.stringify(front));
  await shot("admin-entry-front.png");

  // ---------- 7. 普通用户被挡在门外 ----------
  console.log("\n[7] 换普通用户直接敲 /admin/dashboard");
  if (injectedId) {
    await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: injectedId });
  }
  await evaluate(`localStorage.setItem('token', ${JSON.stringify(TOKENS.member)})`);
  await send("Page.navigate", { url: BASE + "/admin/dashboard" });
  await sleep(3500);
  const blocked = await evaluate(`(() => ({
    url: location.pathname,
    hasAdmin: !!document.querySelector('.admin-app'),
    toast: document.querySelector('.kokomi-toast')?.textContent.trim() || null,
  }))()`);
  console.log("  ", JSON.stringify(blocked));

  // ---------- 8. 小屏 ----------
  console.log("\n[8] 890px 宽下的后台（侧栏转顶部）");
  await evaluate(`localStorage.setItem('token', ${JSON.stringify(TOKENS.admin)})`);
  await send("Emulation.setDeviceMetricsOverride", {
    width: 890,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: BASE + "/admin/dashboard" });
  await sleep(3200);
  const narrow = await evaluate(`(() => {
    const side = document.querySelector('.admin-side');
    const nav = document.querySelector('.admin-nav');
    return {
      flexDir: getComputedStyle(document.querySelector('.admin-app')).flexDirection,
      sideWidth: side.getBoundingClientRect().width,
      navDir: getComputedStyle(nav).flexDirection,
      contentWidth: document.querySelector('.admin-content').getBoundingClientRect().width,
    };
  })()`);
  console.log("  ", JSON.stringify(narrow));
  await shot("admin-narrow.png");

  proc.kill();
  process.exit(0);
})();
