// 后台「外观」功能验证：名字颜色 + 身份标签颜色
// 用法：
//   1) 本地后端跑在 18080（含 role_color 字段）
//   2) PREVIEW_ROOT=myWeb/vue/dist UPSTREAM=http://localhost:18080 PORT=5194 node local-preview.js
//   3) TEST_BASE=http://localhost:5194 node tools/test-user-style.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9387;
const BASE = process.env.TEST_BASE || "http://localhost:5194";
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
      "--window-size=1440,1000",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-user-style-test",
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
    if (r.result?.exceptionDetails) {
      console.log("  [JS ERROR]", r.result.exceptionDetails.text);
    }
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

  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem('token', ${JSON.stringify(TOKENS.admin)}); } catch (e) {}`,
  });

  // ---------- 1. 后台用户管理 ----------
  console.log("\n[1] 后台 · 用户管理");
  await send("Page.navigate", { url: BASE + "/admin/users" });
  await sleep(3200);
  const listInfo = await evaluate(`(() => ({
    rows: document.querySelectorAll('.user-row').length,
    styleBtns: document.querySelectorAll('.user-row__style-btn').length,
    swatches: document.querySelectorAll('.user-row__style-btn .swatch').length,
    me: document.querySelector('.user-row')?.textContent.replace(/\\s+/g,' ').trim().slice(0,40),
  }))()`);
  console.log("  ", JSON.stringify(listInfo));
  await shot("style-users-list.png");

  // ---------- 2. 打开外观面板 ----------
  console.log("\n[2] 点第一行「外观」");
  const opened = await clickByExpr(`document.querySelector('.user-row__style-btn')`);
  await sleep(800);
  const panel = await evaluate(`(() => {
    const p = document.querySelector('.style-panel');
    if (!p) return null;
    const rows = [...p.querySelectorAll('.style-row')];
    return {
      title: p.querySelector('.style-panel__title')?.textContent.trim(),
      labels: rows.map(r => r.querySelector('.style-row__label')?.textContent.trim()),
      hexValues: rows.map(r => r.querySelector('.style-row__hex')?.value),
      tag: p.querySelector('.style-panel__preview-tag')?.textContent.trim(),
      tagBg: getComputedStyle(p.querySelector('.style-panel__preview-tag')).backgroundColor,
      nameColor: getComputedStyle(p.querySelector('.style-panel__preview-name')).color,
    };
  })()`);
  console.log("  打开:", opened, JSON.stringify(panel));
  await shot("style-panel-light.png");

  // ---------- 3. 改颜色，看实时预览 ----------
  console.log("\n[3] 填颜色");
  await evaluate(`(() => {
    const t = document.querySelectorAll('.style-row__hex');
    t[0].value = '#1f8f4e'; t[0].dispatchEvent(new Event('input', { bubbles: true }));
    t[1].value = '#8a2be2'; t[1].dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(500);
  const preview = await evaluate(`(() => {
    const p = document.querySelector('.style-panel');
    return {
      nameColor: getComputedStyle(p.querySelector('.style-panel__preview-name')).color,
      tagBg: getComputedStyle(p.querySelector('.style-panel__preview-tag')).backgroundColor,
      tagColor: getComputedStyle(p.querySelector('.style-panel__preview-tag')).color,
      hex: [...p.querySelectorAll('.style-row__hex')].map(i => i.value),
    };
  })()`);
  console.log("  预览:", JSON.stringify(preview));
  await shot("style-panel-colors.png");

  // ---------- 4. 暗色 ----------
  console.log("\n[4] 暗色下的面板");
  await evaluate(`document.documentElement.classList.add('dark')`);
  await sleep(400);
  const darkInfo = await evaluate(`(() => {
    const p = document.querySelector('.style-panel');
    return {
      panelBg: getComputedStyle(p).backgroundColor,
      titleColor: getComputedStyle(p.querySelector('.style-panel__title')).color,
      inputBg: getComputedStyle(p.querySelector('.style-row__hex')).backgroundColor,
    };
  })()`);
  console.log("  ", JSON.stringify(darkInfo));
  await shot("style-panel-dark.png");
  await evaluate(`document.documentElement.classList.remove('dark')`);
  await sleep(300);

  // ---------- 5. 保存 ----------
  console.log("\n[5] 保存");
  const saved = await clickByExpr(
    `[...document.querySelectorAll('.style-panel__foot .my-button')].find(b => b.textContent.includes('保存'))`
  );
  await sleep(1500);
  const afterSave = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.user-row')].find(r => r.textContent.includes('我'));
    const sw = row ? [...row.querySelectorAll('.swatch')].map(s => getComputedStyle(s).backgroundColor) : [];
    return {
      panelClosed: !document.querySelector('.style-panel'),
      toast: document.querySelector('.kokomi-toast')?.textContent.trim(),
      swatches: sw,
    };
  })()`);
  console.log("  保存:", saved, JSON.stringify(afterSave));
  await shot("style-saved.png");

  // ---------- 6. 首页帖子卡片 ----------
  console.log("\n[6] 首页看帖子里生效");
  await send("Page.navigate", { url: BASE + "/" });
  await sleep(3500);
  const posts = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.post-card')].slice(0, 6);
    return cards.map(c => {
      const n = c.querySelector('.post-card__author-name');
      const t = c.querySelector('.post-card__role-badge');
      return {
        name: n?.textContent.trim(),
        nameColor: n ? getComputedStyle(n).color : '',
        tag: t?.textContent.trim() || '',
        tagColor: t ? getComputedStyle(t).color : '',
        tagBg: t ? getComputedStyle(t).backgroundColor : '',
      };
    });
  })()`);
  posts.forEach((p) =>
    console.log("   ", p.name, p.nameColor, "| 标签:", p.tag || "无", p.tagColor, p.tagBg)
  );
  await shot("style-home-posts.png");

  // ---------- 7. 我的空间方块 ----------
  console.log("\n[7] 我的空间");
  await send("Page.navigate", { url: BASE + "/space/home" });
  await sleep(3000);
  const space = await evaluate(`(() => {
    const b = document.querySelector('.user-role');
    const n = document.querySelector('.user-name span');
    return {
      text: b?.textContent.trim(),
      bg: b ? getComputedStyle(b).backgroundColor : '',
      color: b ? getComputedStyle(b).color : '',
      nameColor: n ? getComputedStyle(n).color : '',
    };
  })()`);
  console.log("  ", JSON.stringify(space));
  await shot("style-space-block.png");

  proc.kill();
  process.exit(0);
})();
