// 后台按钮尺寸体检：/admin/roles 的「新建角色」「保存」，以及 /admin/users 外观弹窗的「保存」。
// .my-button 组件只给配色、不给尺寸，漏写 class 就会变成贴着文字的小色块。
// 用法：node tools/test-admin-buttons.js（需 18080 后端 + 5194 预览）
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9401;
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
      "--window-size=1440,900",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-admin-btn",
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
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem('token', ${JSON.stringify(TOKENS.admin)}); } catch (e) {}`,
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
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
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 5,
      y: 5,
      button: "none",
    });
    await sleep(150);
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(s.result.data, "base64"));
    console.log("  截图 -> shots/" + name);
  };

  // 量一个按钮的盒子：高度 / 内边距 / 圆角 / 字号 / 底色
  const probe = (sel) => `(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return null;
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return {
        text: el.textContent.trim(),
        w: +b.width.toFixed(1), h: +b.height.toFixed(1),
        padding: cs.padding, radius: cs.borderRadius, fontSize: cs.fontSize,
        weight: cs.fontWeight, bg: cs.backgroundColor, color: cs.color,
        display: cs.display
      };
    })()`;

  const rows = [];
  const record = async (label, sel) => {
    const v = await evaluate(probe(sel));
    rows.push([label, v]);
    console.log(label + ":", JSON.stringify(v));
    return v;
  };

  // ---------- /admin/roles ----------
  await send("Page.navigate", { url: BASE + "/admin/roles" });
  for (let i = 0; i < 50; i++) {
    if (await evaluate(`document.querySelectorAll('.role-item').length > 0`)) break;
    await sleep(200);
  }
  await sleep(500);
  await evaluate(`document.querySelector('.role-item').click()`);
  await sleep(500);

  await record("新建角色", ".roles-head .my-button");
  await record("保存", ".role-panel__foot .my-button");
  await record("放弃修改", ".role-ghost");
  await record("删除角色", ".role-danger");
  await shot("admin-btn-1-roles.png");

  // 暗色
  await evaluate(
    `localStorage.setItem('kokomi-theme','dark');document.documentElement.classList.add('dark');true`
  );
  await sleep(400);
  await record("保存（暗色）", ".role-panel__foot .my-button");
  await shot("admin-btn-2-roles-dark.png");
  await evaluate(
    `localStorage.setItem('kokomi-theme','light');document.documentElement.classList.remove('dark');true`
  );

  // ---------- /admin/users 外观弹窗 ----------
  await send("Page.navigate", { url: BASE + "/admin/users" });
  for (let i = 0; i < 50; i++) {
    if (await evaluate(`document.querySelectorAll('.user-row').length > 0`)) break;
    await sleep(200);
  }
  await sleep(500);
  await evaluate(
    `(() => { const b = document.querySelector('.user-row .style-btn') || [...document.querySelectorAll('.user-row button')].find(x => x.textContent.includes('外观')); if (b) b.click(); })()`
  );
  await sleep(600);
  const usersSave = await record("外观弹窗-保存", ".style-panel__foot .my-button");
  await record("外观弹窗-取消", ".style-ghost");
  await shot("admin-btn-3-users-dialog.png");

  ws.close();
  proc.kill();

  // 判定：主按钮必须有足够高度和内边距，圆角不能是 0
  // 「删除角色」只有自建角色才渲染，库里全是内置角色时找不到属正常
  const OPTIONAL = new Set(["删除角色"]);
  const bad = rows
    .filter(([k, v]) => !v && !OPTIONAL.has(k))
    .map(([k]) => k + "（没找到）");
  for (const [k, v] of rows) {
    if (!v) continue;
    if (v.h < 28) bad.push(`${k} 高度只有 ${v.h}px`);
    if (v.radius === "0px") bad.push(`${k} 圆角是 0`);
    if (parseFloat(v.padding.split(" ")[0]) === 0 && parseFloat(v.padding.split(" ")[1]) === 0)
      bad.push(`${k} 没有内边距`);
  }
  console.log("\n结论:", bad.length ? "FAIL\n  - " + bad.join("\n  - ") : "PASS 按钮尺寸正常");
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
