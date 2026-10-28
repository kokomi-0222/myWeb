// 移动端后台可用性验收（390 宽）
//   [1] 内容区能滚：滚轮后 .admin-content.scrollTop > 0（曾完全滚不动：
//       .admin-body 是 column 主轴上的 flex:1，min-height:auto 被长表格撑到 3000+px，
//       撑出去的部分又被 .admin-app 的 overflow:hidden 裁掉）
//   [2] 滚到底能看见最后一个用户卡片
//   [3] 用户卡片不再被「禁言/封号/外观」挤扁：名字区 ≥ 200px、卡片高度 < 200px
//   [4] 各后台页在 390 宽下没有横向溢出
//   [5] 桌面 1200 宽不回归
// 用法：node tools/test-admin-mobile-scroll.js（需 18080 后端 + 5194 预览）
const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
// ⚠️ 每个 UI 脚本必须用自己的调试端口（详见 test-email-center-ui.js 的注释）
const DBG_PORT = 9465;
const BASE = process.env.TEST_BASE || "http://localhost:5194";
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PASS = [];
const FAIL = [];
function check(name, ok, detail = "") {
  (ok ? PASS : FAIL).push(name);
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
}

function readLocal(key) {
  const yml = path.join(ROOT, "springboot", "kokomi", "config", "application-local.yaml");
  const txt = fs.readFileSync(yml, "utf-8");
  const m = txt.match(new RegExp(`^\\s*${key}:\\s*(\\S+)\\s*$`, "m"));
  return m ? m[1].replace(/^["']|["']$/g, "") : "";
}
function sql(statement) {
  const pwd = process.env.DB_PASSWORD || readLocal("password");
  const r = spawnSync("mysql", [
    "-uroot", "-p" + pwd, "--default-character-set=utf8mb4",
    "-N", "-B", "kokomi", "-e", statement,
  ], { encoding: "utf-8" });
  if (r.status !== 0) throw new Error("mysql 失败: " + (r.stderr || r.stdout));
  return (r.stdout || "").trim();
}
const JWT_SECRET = process.env.JWT_SECRET || readLocal("secret");
function signToken(uid, tv) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ sub: String(uid), tokenVersion: tv, iat: now, exp: now + 3600 });
  const signing = `${head}.${body}`;
  return `${signing}.${crypto.createHmac("sha256", JWT_SECRET).update(signing).digest("base64url")}`;
}
const get = (p) => new Promise((res, rej) => {
  http.get({ host: "127.0.0.1", port: DBG_PORT, path: p }, (r) => {
    let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d)));
  }).on("error", rej);
});

(async () => {
  const adminId = Number(sql("SELECT id FROM user WHERE primary_role = 'admin' ORDER BY id LIMIT 1"));
  if (!adminId) throw new Error("找不到 admin 账号");
  const tv = Number(sql(`SELECT token_version FROM user WHERE id = ${adminId}`) || 1);
  const token = signToken(adminId, tv);
  console.log(`  admin id=${adminId} token_version=${tv}`);

  const proc = spawn(EDGE, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--no-proxy-server",
    `--remote-debugging-port=${DBG_PORT}`, "--window-size=390,844",
    `--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-admin-mobile-${process.pid}`,
    "about:blank",
  ], { stdio: "ignore" });
  await sleep(2500);
  let list = [];
  for (let i = 0; i < 12; i++) {
    try { list = await get("/json/list"); break; } catch { await sleep(500); }
  }
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((r) => {
    const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params }));
  });
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) {
      throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || "eval error").slice(0, 200));
    }
    return r.result?.result?.value;
  };
  const until = async (expr, timeout = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { if (await evaluate(expr)) return true; } catch { /* 页面切换中 */ }
      await sleep(150);
    }
    return false;
  };
  const shot = async (name) => {
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(s.result.data, "base64"));
    console.log("  截图 -> shots/" + name);
  };
  const nav = async (url) => {
    const origin = new URL(url).origin;
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) {
      let ok = false;
      try {
        ok = await evaluate(
          `location.origin === ${JSON.stringify(origin)} && document.readyState === 'complete'`
        );
      } catch { ok = false; }
      if (ok) break;
      await sleep(150);
    }
    await sleep(1100);
  };
  const wheel = async (x, y, deltaY) => {
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY });
    await sleep(700);
  };
  // 后台布局的尺寸快照
  const layout = () => evaluate(`(() => {
    const box = (s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top),
               clientH: el.clientHeight, scrollH: el.scrollHeight, overflowY: cs.overflowY };
    };
    return {
      innerH: innerHeight, innerW: innerWidth,
      docScrollH: document.documentElement.scrollHeight,
      docScrollW: document.documentElement.scrollWidth,
      app: box(".admin-app"), body: box(".admin-body"), content: box(".admin-content"),
      contentTop: box(".admin-content")?.top ?? null,
    };
  })()`);

  try {
    // ---------------------------------------------------------- 1 能滚
    console.log("\n[1] 用户管理页：内容区可滚动");
    await nav(BASE + "/");
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(token)})`);
    await nav(BASE + "/admin/users");
    check("进到用户管理页", await until(`!!document.querySelector('.admin-content')`, 15000));
    check("用户卡片已渲染", await until(`document.querySelectorAll('.user-row').length > 1`, 15000));

    const L = await layout();
    check("外层没被内容撑破（.admin-app 不裁内容）",
      L.app.scrollH <= L.app.clientH + 1, `app ${L.app.scrollH}/${L.app.clientH}`);
    check("内容区确实比视口长 → 需要滚",
      L.content.scrollH > L.content.clientH, `${L.content.scrollH}/${L.content.clientH}`);
    check("滚动落在 .admin-content 上（overflow-y:auto）",
      L.content.overflowY === "auto", L.content.overflowY);
    check("页面本身不滚（后台是内部滚动）",
      L.docScrollH <= L.innerH + 1, `doc ${L.docScrollH}/${L.innerH}`);

    const before = await evaluate(`document.querySelector('.admin-content').scrollTop`);
    await wheel(195, 600, 900);
    const after = await evaluate(`document.querySelector('.admin-content').scrollTop`);
    check("滚轮能滚下去", after > before, `scrollTop ${before} → ${after}`);
    await shot("admin-mobile-scrolled.png");

    await wheel(195, 600, 20000);
    const tail = await evaluate(`(() => {
      const c = document.querySelector('.admin-content');
      const rows = document.querySelectorAll('.user-row');
      const last = rows[rows.length - 1];
      const cr = c.getBoundingClientRect(), lr = last.getBoundingClientRect();
      return { scrollTop: c.scrollTop, max: c.scrollHeight - c.clientHeight,
               lastTop: Math.round(lr.top), lastBottom: Math.round(lr.bottom), contentBottom: Math.round(cr.bottom) };
    })()`);
    check("滚到底部", Math.abs(tail.scrollTop - tail.max) <= 2, `${tail.scrollTop}/${tail.max}`);
    check("最后一个用户卡片能完整看到",
      tail.lastBottom <= tail.contentBottom + 1, JSON.stringify(tail));
    await shot("admin-mobile-bottom.png");

    // ---------------------------------------------------------- 2 卡片没被挤扁
    console.log("\n[2] 用户卡片：名字区不被动作按钮挤扁");
    await evaluate(`document.querySelector('.admin-content').scrollTop = 0`);
    await sleep(400);
    const card = await evaluate(`(() => {
      const row = document.querySelector('.user-row');
      const main = row.querySelector('.user-row__main');
      const roles = row.querySelector('.user-row__roles');
      const chips = [...roles.querySelectorAll('.role-chip')];
      const tops = chips.map(c => Math.round(c.getBoundingClientRect().top));
      return {
        mainW: Math.round(main.getBoundingClientRect().width),
        rowH: Math.round(row.getBoundingClientRect().height),
        rolesW: Math.round(roles.getBoundingClientRect().width),
        chips: chips.length,
        distinctTops: new Set(tops).size,
        rowW: Math.round(row.getBoundingClientRect().width),
      };
    })()`);
    check("名字区宽度合理（≥200px，曾被挤到 69px）", card.mainW >= 200, `${card.mainW}px`);
    check("角色标签横排而不是竖着一列",
      card.chips < 4 || card.distinctTops <= Math.ceil(card.chips / 2),
      `${card.chips} 个标签占 ${card.distinctTops} 行`);
    check("单张卡片高度 < 200px（曾 290px）", card.rowH < 200, `${card.rowH}px`);

    // ---------------------------------------------------------- 3 其它页不溢出
    console.log("\n[3] 其余后台页：390 宽无横向溢出");
    for (const p of ["dashboard", "topics", "roles", "reports"]) {
      await nav(BASE + "/admin/" + p);
      const ok = await until(`!!document.querySelector('.admin-content')`, 15000);
      await sleep(600);
      const m = await evaluate(`(() => {
        const de = document.documentElement;
        const c = document.querySelector('.admin-content');
        const app = document.querySelector('.admin-app');
        return { vw: de.clientWidth, scrollW: de.scrollWidth,
                 appCutsH: app.scrollHeight - app.clientHeight,
                 contentW: c ? Math.round(c.getBoundingClientRect().width) : -1,
                 contentScrollW: c ? c.scrollWidth : -1 };
      })()`);
      check(`/admin/${p} 加载`, ok);
      check(`/admin/${p} 页面不横向溢出`, m.scrollW <= m.vw, `${m.scrollW}/${m.vw}`);
      check(`/admin/${p} 内容区没被外层裁掉`, m.appCutsH <= 1, `溢出 ${m.appCutsH}px`);
    }

    // ---------------------------------------------------------- 4 桌面不回归
    console.log("\n[4] 桌面 1200 宽不回归");
    await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
    await nav(BASE + "/admin/users");
    await until(`document.querySelectorAll('.user-row').length > 1`, 15000);
    const D = await layout();
    check("桌面侧栏仍在左侧（不是上下布局）",
      D.body.top === 0 || D.body.top < 10, `admin-body top=${D.body.top}`);
    check("桌面内容区可滚", D.content.scrollH > D.content.clientH, `${D.content.scrollH}/${D.content.clientH}`);
    const dBefore = await evaluate(`document.querySelector('.admin-content').scrollTop`);
    await wheel(700, 500, 900);
    const dAfter = await evaluate(`document.querySelector('.admin-content').scrollTop`);
    check("桌面滚轮有效", dAfter > dBefore, `${dBefore} → ${dAfter}`);
    const deskCard = await evaluate(`(() => {
      const main = document.querySelector('.user-row__main');
      return Math.round(main.getBoundingClientRect().width);
    })()`);
    check("桌面卡片名字区 >= 300px", deskCard >= 300, `${deskCard}px`);
    await shot("admin-desktop-users.png");
  } catch (e) {
    check("执行未抛异常", false, String(e && e.message ? e.message : e).slice(0, 200));
  } finally {
    try { ws.close(); } catch { }
    try { proc.kill(); } catch { }
  }

  console.log();
  console.log(`通过 ${PASS.length} / ${PASS.length + FAIL.length}`);
  if (FAIL.length) {
    console.log("失败项：");
    for (const n of FAIL) console.log("  - " + n);
    process.exit(1);
  }
  process.exit(0);
})();
