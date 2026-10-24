// 自建角色的身份标签验证：把「审核员」临时挂到 user 10 身上（这人只有这一个角色），
// 首页帖子卡片上应该显示「审核员」而不是编码。跑完还原成 member 并删掉临时角色。
// 用法：node tools/test-role-badge.js （需要 18080 后端 + 5194 预览）
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9397;
const BASE = process.env.TEST_BASE || "http://localhost:5194";
const API = "http://localhost:18080";
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

const api = async (method, p, body) => {
  const r = await fetch(API + p, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + TOKENS.admin,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return j;
};

(async () => {
  // ---------- 1. 造数据 ----------
  const created = await api("POST", "/admin/role", {
    roleName: "审核员",
    description: "临时验证用",
    permissions: ["post:delete"],
  });
  const code = created?.data?.roleCode;
  console.log("建角色:", code, "|", created.msg);
  if (!code) throw new Error("建角色失败：" + JSON.stringify(created));

  let r = await api("PUT", "/admin/user/10/roles", { roles: [code] });
  console.log("user10 ->", code, "|", r.msg);

  const posts = await api("GET", "/admin/users?keyword=kokomi_000010");
  console.log(
    "user10 现状:",
    JSON.stringify((posts?.data?.list || [])[0]?.roles || [])
  );

  // ---------- 2. 打开首页看标签 ----------
  const proc = spawn(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-proxy-server",
      `--remote-debugging-port=${DBG_PORT}`,
      "--window-size=1440,900",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-role-badge",
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

  // 匿名访问（不注入 token），验证「未登录也能看到中文角色名」
  await send("Page.navigate", { url: BASE + "/" });
  for (let i = 0; i < 40; i++) {
    if (await evaluate(`!!document.querySelector('.post-card')`)) break;
    await sleep(200);
  }
  await sleep(800);
  const badges = await evaluate(
    `[...new Set([...document.querySelectorAll('.post-card__role-badge')].map(el => el.textContent.trim()))]`
  );
  console.log("首页帖子上的身份标签:", JSON.stringify(badges));
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(
    path.join(OUT, "roles-10-custom-badge.png"),
    Buffer.from(shot.result.data, "base64")
  );
  console.log("  截图 -> shots/roles-10-custom-badge.png");

  ws.close();
  proc.kill();

  // ---------- 3. 还原 ----------
  r = await api("PUT", "/admin/user/10/roles", { roles: ["member"] });
  console.log("user10 还原 member |", r.msg);
  r = await api("DELETE", "/admin/role/" + code);
  console.log("删角色 |", r.msg);

  const check = await api("GET", "/admin/role/list");
  const left = (check?.data || []).filter((x) => x.roleCode === code);
  console.log("残留角色:", left.length);
  process.exit(badges.includes("审核员") && left.length === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
