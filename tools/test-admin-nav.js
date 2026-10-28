// 后台窄屏导航「还能滑」提示验收（390 宽）
//   [1] 5 项放不进一行：scrollWidth > clientWidth，且滚动条被藏掉（offsetHeight == clientHeight）
//   [2] 初始停在左端：只有 can-right（右缘渐隐），左缘不渐隐
//   [3] 滚到中间：两端都渐隐
//   [4] 滚到最右：只剩 can-left
//   [5] 深链接直达「话题管理」：当前项完整落在视口内（自动滚进视口）
//   [6] 竖滚轮能横滑（桌面窄窗口没有触摸时的兜底）
//   [7] 桌面 1200 宽不回归：无渐隐、五项全在
// 用法：node tools/test-admin-nav.js（需 18080 后端 + 5194 预览）
const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
// ⚠️ 每个 UI 脚本必须用自己的调试端口（详见 test-email-center-ui.js 的注释）
const DBG_PORT = 9468;
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
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64({ sub: String(uid), tokenVersion: tv, iat: now, exp: now + 3600 });
  return `${h}.${p}.${crypto.createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest("base64url")}`;
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
    `--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-admin-nav-${process.pid}`,
    "about:blank",
  ], { stdio: "ignore" });
  await sleep(2500);
  let list = [];
  for (let i = 0; i < 12; i++) { try { list = await get("/json/list"); break; } catch { await sleep(500); } }
  const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
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
      try { if (await evaluate(expr)) return true; } catch { /* 切页中 */ }
      await sleep(150);
    }
    return false;
  };
  const shot = async (name) => {
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(s.result.data, "base64"));
    console.log("  截图 -> shots/" + name);
  };
  const navTo = async (url) => {
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) {
      let ok = false;
      try { ok = await evaluate(`document.readyState === 'complete'`); } catch { ok = false; }
      if (ok) break;
      await sleep(150);
    }
    await sleep(1100);
  };
  const clickAt = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(700);
  };
  const rectOf = (expr) => evaluate(`(() => { const el = ${expr}; if (!el) return null;
    const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
      left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) }; })()`);

  // 导航当前状态快照
  const navInfo = () => evaluate(`(() => {
    const nav = document.querySelector('.admin-nav');
    if (!nav) return null;
    const cs = getComputedStyle(nav);
    const nr = nav.getBoundingClientRect();
    const max = nav.scrollWidth - nav.clientWidth;
    const items = [...nav.querySelectorAll('.admin-nav__item')].map((el) => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent.trim(), active: el.classList.contains('is-active'),
               fullyVisible: r.left >= nr.left - 1 && r.right <= nr.right + 1 };
    });
    return {
      clientW: nav.clientWidth, scrollW: nav.scrollWidth, max: Math.round(max),
      scrollLeft: Math.round(nav.scrollLeft),
      hiddenBar: nav.offsetHeight - nav.clientHeight,
      canLeft: nav.classList.contains('can-left'),
      canRight: nav.classList.contains('can-right'),
      mask: cs.maskImage || cs.webkitMaskImage || 'none',
      items,
    };
  })()`);

  try {
    // ---------------------------------------------------------- 1 溢出与滚动条
    console.log("\n[1] 390 宽：五项放不下一行，且滚动条不可见");
    await navTo(BASE + "/");
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(token)})`);
    await navTo(BASE + "/admin/dashboard");
    check("进到后台", await until(`!!document.querySelector('.admin-nav')`, 15000));
    let info = await navInfo();
    check("五项都渲染出来", info.items.length === 5, `${info.items.length} 项`);
    check("横向溢出（需要滑）", info.max > 50, `screen ${info.clientW} / content ${info.scrollW}，溢出 ${info.max}px`);
    check("滚动条已藏掉（高度差为 0）", info.hiddenBar === 0, `${info.hiddenBar}px`);
    await shot("admin-nav-fade-right.png");

    // ---------------------------------------------------------- 2 左端
    console.log("\n[2] 停在左端：只有右缘渐隐");
    check("有 can-right", info.canRight === true, String(info.canRight));
    check("没有 can-left", info.canLeft === false, String(info.canLeft));
    check("右缘 mask 生效", /gradient/.test(info.mask), info.mask.slice(0, 60));

    // ---------------------------------------------------------- 3 中间
    console.log("\n[3] 滚到中间：两端都渐隐");
    await evaluate(`(() => { const n = document.querySelector('.admin-nav'); n.scrollLeft = Math.round((n.scrollWidth - n.clientWidth) / 2); })()`);
    await sleep(500);
    info = await navInfo();
    check("中间位置两端都渐隐", info.canLeft && info.canRight, `left=${info.canLeft} right=${info.canRight}`);
    check("两端渐隐的 mask 同时含左右透明", /gradient/.test(info.mask), info.mask.slice(0, 60));
    await shot("admin-nav-fade-mid.png");

    // ---------------------------------------------------------- 4 右端
    console.log("\n[4] 滚到最右：只剩左缘渐隐");
    await evaluate(`(() => { const n = document.querySelector('.admin-nav'); n.scrollLeft = n.scrollWidth; })()`);
    await sleep(500);
    info = await navInfo();
    check("滑到底", info.scrollLeft >= info.max - 4, `scrollLeft=${info.scrollLeft} / max=${info.max}`);
    check("有 can-left、没有 can-right", info.canLeft && !info.canRight, `left=${info.canLeft} right=${info.canRight}`);
    check("最右一项完整可见", info.items[4].fullyVisible, JSON.stringify(info.items[4]));
    await shot("admin-nav-fade-left.png");

    // ---------------------------------------------------------- 5 深链接自动滚入
    console.log("\n[5] 深链接直达「话题管理」：当前项自动滚进视口");
    await navTo(BASE + "/admin/topics");
    check("进到话题管理", await until(`!!document.querySelector('.admin-nav__item.is-active')`, 15000));
    await sleep(1200);
    info = await navInfo();
    const active = info.items.find((i) => i.active);
    check("高亮的是话题管理", active && active.text.includes("话题"), JSON.stringify(active));
    check("当前项完整落在视口内（不是被切在屏幕外）", active && active.fullyVisible, JSON.stringify(active));
    // 最后一项没法「居中」（右边没内容了），只能贴到最右 —— 关键是别停在最左
    check("导航已经滚过去（不是仍停在最左）", info.scrollLeft >= info.max - 4, `${info.scrollLeft}/${info.max}`);
    await shot("admin-nav-topics-active.png");

    console.log("\n[5b] 深链接直达中间项「角色权限」：当前项居中");
    await navTo(BASE + "/admin/roles");
    check("进到角色权限", await until(`!!document.querySelector('.admin-nav__item.is-active')`, 15000));
    await sleep(1200);
    info = await navInfo();
    const mid = info.items.find((i) => i.active);
    check("当前项完整可见", mid && mid.fullyVisible, JSON.stringify(mid));
    check("两侧都还有内容（真的居中了）", info.scrollLeft > 8 && info.scrollLeft < info.max - 8, `${info.scrollLeft}/${info.max}`);

    // ---------------------------------------------------------- 6 竖滚轮横滑
    console.log("\n[6] 竖滚轮转成横滑（桌面窄窗口兜底）");
    await evaluate(`document.querySelector('.admin-nav').scrollLeft = 0`);
    await sleep(300);
    const navBox = await rectOf(`document.querySelector('.admin-nav')`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: navBox.x, y: navBox.y });
    await sleep(150);
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: navBox.x, y: navBox.y, deltaX: 0, deltaY: 140 });
    await sleep(600);
    const afterWheel = await evaluate(`Math.round(document.querySelector('.admin-nav').scrollLeft)`);
    check("滚轮让导航横移", afterWheel > 40, `scrollLeft=${afterWheel}`);

    // ---------------------------------------------------------- 7 桌面不回归
    console.log("\n[7] 桌面 1200 宽：不渐隐、五项全在");
    await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navTo(BASE + "/admin/users");
    await sleep(900);
    info = await navInfo();
    check("桌面无溢出", info.max <= 0, `${info.clientW} / ${info.scrollW}`);
    check("桌面不加渐隐 class", !info.canLeft && !info.canRight, `left=${info.canLeft} right=${info.canRight}`);
    check("桌面 mask 为 none", info.mask === "none", info.mask);
    check("五项全在侧栏里", info.items.every((i) => i.fullyVisible), JSON.stringify(info.items.map((i) => i.fullyVisible)));
    await shot("admin-nav-desktop.png");
  } catch (e) {
    FAIL.push("脚本异常");
    console.log("  FAIL 脚本异常: " + (e && e.message));
  } finally {
    console.log(`\n结果：${PASS.length} 通过 / ${FAIL.length} 失败`);
    if (FAIL.length) console.log("失败项：" + FAIL.join("；"));
    try { proc.kill(); } catch {}
    await sleep(300);
    process.exit(FAIL.length ? 1 : 0);
  }
})();
