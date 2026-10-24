// 用户管理页验证：菜单显隐 / 列表 / 角色切换 / 搜索 / 自我保护
// 用法：
//   1) 起后端（本地 8091）
//   2) PREVIEW_ROOT=myWeb/vue/dist_admin2 UPSTREAM=http://localhost:8091 PORT=5192 node local-preview.js
//   3) TEST_BASE=http://localhost:5192 node tools/test-user-admin.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9383;
const BASE = process.env.TEST_BASE || "http://localhost:5192";
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
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-user-admin-test",
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
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await sleep(60);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
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
  /** 点某个用户那一行里的指定角色标签 */
  const clickRoleChip = async (userId, roleCode) => {
    const p = await evaluate(`(() => {
      const rows = [...document.querySelectorAll('.user-row')];
      for (const row of rows) {
        const meta = row.querySelector('.user-row__meta');
        if (!meta) continue;
        if (!meta.textContent.includes('#${userId}')) continue;
        const idx = ${JSON.stringify(
          ["admin", "moderator", "editor", "vip", "member", "guest"]
        )}.indexOf(${JSON.stringify(roleCode)});
        const chip = row.querySelectorAll('.role-chip')[idx];
        if (!chip) return null;
        const b = chip.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      }
      return null;
    })()`);
    if (!p) return false;
    await clickAt(p.x, p.y);
    return true;
  };

  // ---------- 1. 站长：菜单 + 列表 ----------
  console.log("\n[1] 站长登录，进用户管理");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem('token', ${JSON.stringify(TOKENS.admin)}); } catch (e) {}`,
  });
  await send("Page.navigate", { url: BASE + "/space/users" });
  await sleep(3500);

  const menuState = await evaluate(`(() => ({
    menus: [...document.querySelectorAll('.menu-item__text')].map(e => e.textContent.trim()),
    title: document.querySelector('.users-head__title')?.textContent.trim() || null,
    count: document.querySelector('.users-head__count')?.textContent.trim() || null,
    rows: [...document.querySelectorAll('.user-row')].map(r => ({
      meta: r.querySelector('.user-row__meta')?.textContent.trim(),
      name: r.querySelector('.user-row__name')?.textContent.trim(),
      roles: [...r.querySelectorAll('.role-chip.is-on')].map(c => c.textContent.trim()),
    })),
  }))()`);
  console.log("  左侧菜单:", JSON.stringify(menuState.menus));
  console.log("  页面标题:", menuState.title, "|", menuState.count);
  console.log("  行数:", menuState.rows.length);
  menuState.rows.forEach((r) => console.log("   ", r.meta, r.name, r.roles));
  await shot("user-admin-list.png");

  // ---------- 2. 自我保护：自己的 admin 标签是禁用的 ----------
  console.log("\n[2] 自己的「管理员」标签应为禁用");
  const lockState = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.user-row')].find(r =>
      r.querySelector('.user-row__me'));
    if (!row) return null;
    const chips = [...row.querySelectorAll('.role-chip')];
    const admin = chips.find(c => c.textContent.trim() === '管理员');
    return { locked: admin?.classList.contains('is-locked'), disabled: admin?.disabled };
  })()`);
  console.log("  自身 admin 标签:", JSON.stringify(lockState));

  // ---------- 3. 给 10 号用户加「版主」，再取消 ----------
  console.log("\n[3] 点 10 号用户的「版主」");
  const clicked = await clickRoleChip(10, "moderator");
  console.log("  点到:", clicked);
  await sleep(1200);
  const afterAdd = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.user-row')].find(r =>
      r.querySelector('.user-row__meta')?.textContent.includes('#10'));
    return {
      roles: [...row.querySelectorAll('.role-chip.is-on')].map(c => c.textContent.trim()),
      toast: document.querySelector('.kokomi-toast')?.textContent.trim() || null,
    };
  })()`);
  console.log("  点击后:", JSON.stringify(afterAdd));
  await shot("user-admin-after-toggle.png");

  // 再点一次取消
  await clickRoleChip(10, "moderator");
  await sleep(1200);
  const afterRemove = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.user-row')].find(r =>
      r.querySelector('.user-row__meta')?.textContent.includes('#10'));
    return [...row.querySelectorAll('.role-chip.is-on')].map(c => c.textContent.trim());
  })()`);
  console.log("  再点一次后:", JSON.stringify(afterRemove));

  // ---------- 4. 搜索 ----------
  console.log("\n[4] 搜索「杨间」");
  await evaluate(`(() => {
    const input = document.querySelector('.users-head__input');
    input.focus();
    return true;
  })()`);
  await send("Input.insertText", { text: "杨间" });
  await sleep(200);
  await evaluate(`(() => {
    const input = document.querySelector('.users-head__input');
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    return true;
  })()`);
  await sleep(1400);
  const searchState = await evaluate(`(() => ({
    count: document.querySelector('.users-head__count')?.textContent.trim(),
    rows: [...document.querySelectorAll('.user-row__name')].map(e => e.textContent.trim()),
  }))()`);
  console.log("  搜索结果:", JSON.stringify(searchState));
  await shot("user-admin-search.png");

  // ---------- 5. 暗色主题下的可读性 ----------
  console.log("\n[5] 切暗色主题");
  await send("Page.navigate", { url: BASE + "/space/users" });
  await sleep(2500);
  const toggled = await clickSel(".theme-toggle");
  console.log("  点到主题开关:", toggled);
  await sleep(900);
  const darkState = await evaluate(`(() => ({
    dark: document.documentElement.classList.contains('dark'),
    rowBg: getComputedStyle(document.querySelector('.user-row')).backgroundColor,
    nameColor: getComputedStyle(document.querySelector('.user-row__name')).color,
    chipOnBg: getComputedStyle(document.querySelector('.role-chip.is-on')).backgroundColor,
  }))()`);
  console.log("  暗色状态:", JSON.stringify(darkState));
  await shot("user-admin-dark.png");
  // 切回亮色，避免影响后面的截图
  await clickSel(".theme-toggle");
  await sleep(700);

  // ---------- 6. 普通用户：菜单里没有「用户管理」 ----------
  console.log("\n[6] 换普通用户登录");
  await send("Page.navigate", { url: "about:blank" });
  await sleep(300);
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem('token', ${JSON.stringify(TOKENS.member)}); } catch (e) {}`,
  });
  await send("Page.navigate", { url: BASE + "/space/home" });
  await sleep(3500);
  const memberMenu = await evaluate(`(() => ({
    menus: [...document.querySelectorAll('.menu-item__text')].map(e => e.textContent.trim()),
  }))()`);
  console.log("  普通用户菜单:", JSON.stringify(memberMenu.menus));
  await shot("user-admin-menu-member.png");

  // 直接访问也拿不到数据
  await send("Page.navigate", { url: BASE + "/space/users" });
  await sleep(2500);
  const memberDirect = await evaluate(`(() => ({
    rows: document.querySelectorAll('.user-row').length,
    empty: !!document.querySelector('.users-empty'),
    toast: document.querySelector('.kokomi-toast')?.textContent.trim() || null,
  }))()`);
  console.log("  直接访问 /space/users:", JSON.stringify(memberDirect));

  ws.close();
  proc.kill();
  console.log("\n完成");
})();
