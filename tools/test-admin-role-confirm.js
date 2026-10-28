// 后台「用户管理」改角色要确认（防误触）
//   [1] 点角色标签先弹确认框，标题/正文写清「授予还是移除」「改的是谁」
//   [2] 点「取消」什么都不发生（DOM + 数据库都没变）
//   [3] 点「授予」才写库，标签才点亮
//   [4] 移除已有点亮角色时，确认框换成 warning + 红色确认键
// 用法：node tools/test-admin-role-confirm.js（需 18080 后端 + 5194 预览）
const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
// ⚠️ 每个 UI 脚本必须用自己的调试端口
const DBG_PORT = 9467;
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

const created = [];
// .danger-confirm 的确认键是 #f53f3f，:focus/:hover 是 #e63939。
// 弹框打开后焦点默认落在确认键上，取到的往往就是深一点的那档 —— 只判「是不是红」。
function isRedBox(color) {
  const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(color || "");
  return !!m && Number(m[1]) > 200 && Number(m[2]) < 110 && Number(m[3]) < 110;
}
function makeMember() {
  const stamp = String(Date.now()).slice(-7) + Math.floor(Math.random() * 90 + 10);
  const username = `roleconf${stamp}`;
  sql("INSERT INTO user (username, password, name, email, email_verified, primary_role) " +
    `VALUES ('${username}', 'x', '${username}', NULL, 1, 'member')`);
  const id = Number(sql(`SELECT id FROM user WHERE username = '${username}'`));
  if (!id) throw new Error("造账号失败");
  sql(`INSERT INTO user_role (user_id, role_code) VALUES (${id}, 'member')`);
  created.push(id);
  return { id, username };
}
function rolesOf(id) {
  return sql(`SELECT role_code FROM user_role WHERE user_id = ${id} ORDER BY role_code`);
}
function cleanup() {
  for (const id of created) {
    sql(`DELETE FROM user_role WHERE user_id = ${id}`);
    sql(`DELETE FROM user WHERE id = ${id}`);
  }
}

(async () => {
  const adminId = Number(sql("SELECT id FROM user WHERE primary_role = 'admin' ORDER BY id LIMIT 1"));
  if (!adminId) throw new Error("找不到 admin");
  const tv = Number(sql(`SELECT token_version FROM user WHERE id = ${adminId}`) || 1);
  const token = signToken(adminId, tv);
  const target = makeMember();
  console.log(`  admin=${adminId}  测试用户=${target.username}(#${target.id})`);

  const proc = spawn(EDGE, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--no-proxy-server",
    `--remote-debugging-port=${DBG_PORT}`, "--window-size=1200,1000",
    `--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-role-confirm-${process.pid}`,
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
  await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false });

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
  const clickAt = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(500);
  };
  const rectOf = (expr) => evaluate(`(() => {
    const el = ${expr};
    if (!el) return null;
    const b = el.getBoundingClientRect();
    if (!b.width) return null;
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  })()`);
  // 点某用户行里文字为 roleName 的角色标签
  // （先 scrollIntoView：手机上列表够长时标签可能在视口外，按视口坐标点会落空）
  const clickChip = async (roleName) => {
    const found = await evaluate(`(() => {
      const row = [...document.querySelectorAll('.user-row')]
        .find(r => r.textContent.includes(${JSON.stringify(target.username)}));
      if (!row) return { err: 'no-row' };
      const chip = [...row.querySelectorAll('.role-chip')]
        .find(c => c.textContent.trim() === ${JSON.stringify(roleName)});
      if (!chip) return { err: 'no-chip' };
      chip.scrollIntoView({ block: 'center' });
      return { ok: true };
    })()`);
    if (!found.ok) throw new Error(`找不到「${roleName}」标签: ${JSON.stringify(found)}`);
    await sleep(400);
    const p = await evaluate(`(() => {
      const row = [...document.querySelectorAll('.user-row')]
        .find(r => r.textContent.includes(${JSON.stringify(target.username)}));
      const chip = [...row.querySelectorAll('.role-chip')]
        .find(c => c.textContent.trim() === ${JSON.stringify(roleName)});
      const b = chip.getBoundingClientRect();
      const x = b.left + b.width / 2, y = b.top + b.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x, y, w: Math.round(b.width), hit: hit ? (hit.className || hit.tagName).toString().slice(0, 40) : null,
               same: !!hit && (hit === chip || chip.contains(hit)) };
    })()`);
    if (!p.same) throw new Error(`「${roleName}」标签被遮挡: ${p.hit}（点在 ${Math.round(p.x)},${Math.round(p.y)}）`);
    await clickAt(p.x, p.y);
  };
  // 点确认框里的按钮（按文字）
  const clickBoxButton = async (text) => {
    const p = await rectOf(`[...document.querySelectorAll('.el-message-box__btns .el-button')]
      .find(b => b.textContent.trim() === ${JSON.stringify(text)}) || null`);
    if (!p) throw new Error(`确认框里没有「${text}」按钮`);
    await clickAt(p.x, p.y);
  };
  const boxInfo = () => evaluate(`(() => {
    const box = document.querySelector('.el-message-box');
    if (!box) return null;
    return {
      title: box.querySelector('.el-message-box__title')?.textContent.trim() || '',
      content: box.querySelector('.el-message-box__message')?.textContent.trim() || '',
      buttons: [...box.querySelectorAll('.el-message-box__btns .el-button')].map(b => b.textContent.trim()),
      danger: box.classList.contains('danger-confirm'),
      primaryBg: (() => {
        const p = box.querySelector('.el-message-box__btns .el-button--primary');
        return p ? getComputedStyle(p).backgroundColor : '';
      })(),
    };
  })()`);
  const chipOn = async (roleName) => evaluate(`(() => {
    const row = [...document.querySelectorAll('.user-row')]
      .find(r => r.textContent.includes(${JSON.stringify(target.username)}));
    if (!row) return null;
    const chip = [...row.querySelectorAll('.role-chip')].find(c => c.textContent.trim() === ${JSON.stringify(roleName)});
    return chip ? chip.classList.contains('is-on') : null;
  })()`);

  try {
    console.log("\n[1] 点「版主」先弹确认框");
    await nav(BASE + "/");
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(token)})`);
    await nav(BASE + "/admin/users");
    check("进到用户管理", await until(`!!document.querySelector('.users-head__input')`, 15000));

    // 用搜索框定位到刚造的账号（列表 20 条一页，新用户在最后）
    await evaluate(`(() => {
      const el = document.querySelector('.users-head__input');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(target.username)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
      return true;
    })()`);
    check("搜索到测试用户", await until(
      `[...document.querySelectorAll('.user-row')].some(r => r.textContent.includes(${JSON.stringify(target.username)}))`, 15000));

    const dbBefore = rolesOf(target.id);
    await clickChip("版主");
    check("弹出确认框", await until(`!!document.querySelector('.el-message-box')`, 8000));
    const box = await boxInfo();
    console.log("  确认框:", JSON.stringify(box));
    check("标题是「授予「版主」？」", box.title === "授予「版主」？", box.title);
    check("正文点明改的是谁", box.content.includes(target.username), box.content.slice(0, 40));
    check("正文说清「获得」+ 立即生效",
      box.content.includes("获得「版主」") && box.content.includes("立即生效"), box.content);
    check("按钮是「授予 / 取消」", JSON.stringify(box.buttons) === JSON.stringify(["取消", "授予"]),
      JSON.stringify(box.buttons));
    check("授予不是危险操作（确认键不是红的）", box.danger === false && box.primaryBg !== "rgb(245, 63, 63)",
      `${box.danger} / ${box.primaryBg}`);
    check("弹框前没写库（还是只有 member）", rolesOf(target.id) === "member", rolesOf(target.id));
    await shot("admin-role-confirm-grant.png");

    console.log("\n[2] 点「取消」什么都不发生");
    await clickBoxButton("取消");
    check("确认框关掉", await until(`!document.querySelector('.el-message-box')`, 6000));
    await sleep(600);
    check("标签没有点亮", (await chipOn("版主")) === false, String(await chipOn("版主")));
    check("数据库没变", rolesOf(target.id) === dbBefore && dbBefore === "member", rolesOf(target.id));

    console.log("\n[3] 再点一次，这次点「授予」");
    await clickChip("版主");
    await until(`!!document.querySelector('.el-message-box')`, 8000);
    await clickBoxButton("授予");
    check("确认框关掉", await until(`!document.querySelector('.el-message-box')`, 6000));
    check("标签点亮", await until(
      `(() => {const row=[...document.querySelectorAll('.user-row')].find(r=>r.textContent.includes(${JSON.stringify(target.username)}));
        if(!row) return false;
        const c=[...row.querySelectorAll('.role-chip')].find(c=>c.textContent.trim()==='版主');
        return !!c && c.classList.contains('is-on');})()`, 12000));
    check("数据库写入 moderator", (await waitDb(() => rolesOf(target.id).includes("moderator"), 6000)),
      rolesOf(target.id));
    check("有成功提示", await until(`!!document.querySelector('.kokomi-toast')`, 6000));

    console.log("\n[4] 移除已有点亮的角色：warning + 红色确认键");
    await clickChip("版主");
    await until(`!!document.querySelector('.el-message-box')`, 8000);
    const box2 = await boxInfo();
    console.log("  确认框:", JSON.stringify(box2));
    check("标题是「移除「版主」？」", box2.title === "移除「版主」？", box2.title);
    check("正文说清「失去」", box2.content.includes("失去「版主」"), box2.content.slice(0, 40));
    check("确认键是红的", box2.danger && isRedBox(box2.primaryBg),
      `${box2.danger} / ${box2.primaryBg}`);
    check("按钮是「移除 / 取消」", JSON.stringify(box2.buttons) === JSON.stringify(["取消", "移除"]),
      JSON.stringify(box2.buttons));
    await shot("admin-role-confirm-remove.png");
    await clickBoxButton("移除");
    check("标签熄灭", await until(
      `(() => {const row=[...document.querySelectorAll('.user-row')].find(r=>r.textContent.includes(${JSON.stringify(target.username)}));
        if(!row) return false;
        const c=[...row.querySelectorAll('.role-chip')].find(c=>c.textContent.trim()==='版主');
        return !!c && !c.classList.contains('is-on');})()`, 12000));
    check("数据库移除 moderator", await waitDb(() => !rolesOf(target.id).includes("moderator"), 6000),
      rolesOf(target.id));

    console.log("\n[5] 「管理员」要额外点明能进后台");
    await clickChip("管理员");
    await until(`!!document.querySelector('.el-message-box')`, 8000);
    const box3 = await boxInfo();
    check("正文提到后台管理", box3.content.includes("后台"), box3.content);
    await clickBoxButton("取消");
    await until(`!document.querySelector('.el-message-box')`, 6000);

    // ---------------------------------------------------------- 6 手机上不溢出
    // 误触点主要发生在手机上（标签小、间距 6px），确认框得保证在小屏能看全
    console.log("\n[6] 390 宽：确认框不超出屏幕");
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await nav(BASE + "/admin/users");
    await until(`!!document.querySelector('.users-head__input')`, 15000);
    await evaluate(`(() => {
      const el = document.querySelector('.users-head__input');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(target.username)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
      return true;
    })()`);
    check("手机上搜索到测试用户", await until(
      `[...document.querySelectorAll('.user-row')].some(r => r.textContent.includes(${JSON.stringify(target.username)}))`, 15000));
    await clickChip("版主");
    check("手机上也能弹出确认框", await until(`!!document.querySelector('.el-message-box')`, 8000));
    const mob = await evaluate(`(() => {
      const box = document.querySelector('.el-message-box');
      const b = box.getBoundingClientRect();
      const btns = [...box.querySelectorAll('.el-message-box__btns .el-button')].map(x => {
        const r = x.getBoundingClientRect();
        return { t: x.textContent.trim(), left: Math.round(r.left), right: Math.round(r.right) };
      });
      return { vw: document.documentElement.clientWidth, scrollW: document.documentElement.scrollWidth,
               left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width), btns };
    })()`);
    console.log("  弹框:", JSON.stringify(mob));
    check("确认框在视口内", mob.left >= 0 && mob.right <= mob.vw, JSON.stringify(mob));
    check("确认框不引起横向滚动", mob.scrollW <= mob.vw, `${mob.scrollW}/${mob.vw}`);
    check("两个按钮都完整可见",
      mob.btns.length === 2 && mob.btns.every((x) => x.left >= 0 && x.right <= mob.vw), JSON.stringify(mob.btns));
    await shot("admin-role-confirm-mobile.png");
    await clickBoxButton("取消");
  } catch (e) {
    check("执行未抛异常", false, String(e && e.message ? e.message : e).slice(0, 200));
  } finally {
    cleanup();
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

  // 接口是异步的：点完确认后等一会儿再查库
  async function waitDb(fn, timeout = 5000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (fn()) return true;
      await sleep(250);
    }
    return false;
  }
})();
