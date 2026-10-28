// 注销账号：个人中心「危险区域」+ 后台代为注销
//
//   [1] 个人中心底部出现「危险区域」，按钮是红色描边（不是实心，先劝退一次）
//   [2] 点开弹窗：确认键默认不可点（既没输密码也没勾选）
//   [3] 只输密码 / 只勾选，都还是不可点 —— 两个条件缺一不可
//   [4] 两者齐全才可点；点下去真的注销，token 清掉、回到首页
//   [5] 「只是不想收邮件」那句话在弹窗里（引导去解绑而不是注销）
//   [6] 后台：管理员自己的行不显示「注销」（后端也会拒），普通用户有
//   [7] 后台点注销 → 必须手打用户名；输错确认键报错、账号不动
//   [8] 输对才真的注销，行从默认列表消失
//   [9] 「显示已注销」勾上后重新出现，带「已注销」标记且没有操作按钮
//
// 用法：node tools/test-deactivate-ui.js（需 18080 后端 + 5194 预览）
const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
// ⚠️ 每个 UI 脚本必须用自己的调试端口（注册 9441 / center 9457 / modal 9453 /
//    userinfo 9451 / role 9467 / 本脚本 9476）
const DBG_PORT = 9476;
const BASE = process.env.TEST_BASE || "http://localhost:5194";
const API = "http://127.0.0.1:18080";
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

/** 直接打后端（不走浏览器），用来造账号 */
function api(method, p, body) {
  return new Promise((res, rej) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      { host: "127.0.0.1", port: 18080, path: p, method, headers: { "Content-Type": "application/json" } },
      (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => {
          try { res(JSON.parse(d || "{}")); } catch { res({ raw: d }); }
        });
      }
    );
    req.on("error", rej);
    if (data) req.write(data);
    req.end();
  });
}

function rsaEncrypt(pubB64, text) {
  const pem = `-----BEGIN PUBLIC KEY-----\n${pubB64.match(/.{1,64}/g).join("\n")}\n-----END PUBLIC KEY-----`;
  return crypto.publicEncrypt(
    { key: pem, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(text, "utf8")
  ).toString("base64");
}

/** 走真实注册链路造一个「密码已知」的账号 —— 注销弹窗要输密码，随便插库的号用不了 */
async function registerAccount(tag, pub) {
  const email = `ui_del_${tag}_${String(Date.now()).slice(-8)}@example.com`;
  const pwd = "test123456";
  let r = await api("POST", "/user/register/email-code", { email });
  const code = (r.data || {}).devCode;
  if (!code) throw new Error("没拿到验证码: " + JSON.stringify(r));
  r = await api("POST", "/user/register/verify-email", { email, code });
  const ticket = (r.data || {}).ticket;
  if (!ticket) throw new Error("没拿到 ticket: " + JSON.stringify(r));
  const cipher = rsaEncrypt(pub, JSON.stringify({ password: pwd, confirmPassword: pwd }));
  r = await api("POST", "/user/register", { ticket, encryptedData: cipher });
  const d = r.data || {};
  const id = Number((d.user || {}).id || 0);
  if (!id) throw new Error("注册失败: " + JSON.stringify(r));
  return { id, token: d.token, email, pwd };
}

/** 后台场景用的普通用户：不需要密码，插库最省事 */
function makeMember() {
  const stamp = String(Date.now()).slice(-7) + Math.floor(Math.random() * 90 + 10);
  const username = `uidel${stamp}`;
  sql("INSERT INTO user (username, password, name, email, email_verified, primary_role) " +
    `VALUES ('${username}', 'x', '待注销${stamp}', NULL, 1, 'member')`);
  const id = Number(sql(`SELECT id FROM user WHERE username = '${username}'`));
  if (!id) throw new Error("造账号失败");
  sql(`INSERT INTO user_role (user_id, role_code) VALUES (${id}, 'member')`);
  return { id, username };
}

const created = [];
function cleanup() {
  for (const id of created) {
    if (!id) continue;
    sql(`DELETE FROM post WHERE user_id = ${id}`);
    sql(`DELETE FROM user_role WHERE user_id = ${id}`);
    sql(`DELETE FROM user WHERE id = ${id}`);
  }
}

const get = (p) => new Promise((res, rej) => {
  http.get({ host: "127.0.0.1", port: DBG_PORT, path: p }, (r) => {
    let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d)));
  }).on("error", rej);
});

(async () => {
  const adminId = Number(sql("SELECT id FROM user WHERE primary_role = 'admin' ORDER BY id LIMIT 1"));
  if (!adminId) throw new Error("找不到 admin");
  const adminTv = Number(sql(`SELECT token_version FROM user WHERE id = ${adminId}`) || 1);
  const adminToken = signToken(adminId, adminTv);

  const pubRes = await api("GET", "/publicKey");
  const pub = pubRes.data.publicKey;
  const self = await registerAccount("self", pub);
  created.push(self.id);
  const other = makeMember();
  created.push(other.id);
  console.log(`  admin=${adminId}  自助注销=${self.email}(#${self.id})  代注销=${other.username}(#${other.id})`);

  const proc = spawn(EDGE, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--no-proxy-server",
    `--remote-debugging-port=${DBG_PORT}`, "--window-size=1200,1000",
    `--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-deactivate-${process.pid}`,
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
    await sleep(400);
  };
  const clickEl = async (expr) => {
    const p = await evaluate(`(() => {
      const el = ${expr};
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const b = el.getBoundingClientRect();
      if (!b.width) return null;
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    if (!p) throw new Error("点不到元素: " + expr.slice(0, 60));
    await sleep(250);
    await clickAt(p.x, p.y);
  };

  const login = async (token) => {
    await nav(`${BASE}/`);
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(token)})`);
    await nav(`${BASE}/space/security`);
  };

  try {
    // ==================================================================
    console.log("[1] 账号安全页的注销段");
    await login(self.token);
    // 注销从「账号管理」搬到了「账号安全」，和密码、邮箱放在一起
    const hasZone = await until(`!!document.querySelector('.sec-row--danger')`);
    check("账号安全页出现注销段", hasZone);
    const zone = await evaluate(`(() => {
      const z = document.querySelector('.sec-row--danger');
      const btn = z && z.querySelector('.sec-btn--danger');
      if (!btn) return null;
      const cs = getComputedStyle(btn);
      return {
        text: btn.textContent.trim(),
        disabled: btn.disabled,
        border: cs.borderTopColor,
        bg: cs.backgroundColor,
        title: z.querySelector('.sec-row__title')?.textContent.trim(),
      };
    })()`);
    check("按钮文案是「注销账号」", zone && zone.text === "注销账号", zone && zone.text);
    check("小标题是「注销账号」", zone && zone.title === "注销账号", zone && zone.title);
    // 红色描边 + 透明底（不是实心红块，降低误点）
    const borderRed = zone && /239,\s*68,\s*68/.test(zone.border);
    const notFilled = zone && /rgba\(0,\s*0,\s*0,\s*0\)/.test(zone.bg);
    check("按钮是红色描边、非实心", !!borderRed && !!notFilled,
      zone ? `border=${zone.border} bg=${zone.bg}` : "");
    check("管理员以外的账号按钮可点", zone && zone.disabled === false);

    // ==================================================================
    console.log("[2] 弹窗：两个条件缺一不可");
    // 必须限定在注销段里：邮箱行的「解绑」也是红色描边（.sec-btn--danger），
    // 直接 document.querySelector 会先命中它，弹出的是解绑邮箱弹窗
    await clickEl(`document.querySelector('.sec-row--danger .sec-btn--danger')`);
    const opened = await until(`!!document.querySelector('.dc-overlay')`);
    check("弹窗打开", opened);
    await shot("deactivate-01-modal.png");

    const submitState = () => evaluate(`(() => {
      const b = document.querySelector('.dc-submit');
      return b ? { disabled: b.disabled, text: b.textContent.trim() } : null;
    })()`);
    let st = await submitState();
    check("什么都没填时确认键禁用", st && st.disabled === true, st && `disabled=${st.disabled}`);
    check("确认键文案是「确认注销」", st && st.text === "确认注销", st && st.text);

    const tipText = await evaluate(
      `document.querySelector('.dc-tip')?.textContent.replace(/\\s+/g,'') || ''`);
    check("弹窗里提示「只是不想收邮件就去解绑」", tipText.includes("解绑邮箱"), tipText);

    // 只输密码
    await evaluate(`document.querySelector('.dc-input').focus()`);
    await send("Input.insertText", { text: self.pwd });
    await sleep(300);
    st = await submitState();
    check("只输密码、没勾选 → 仍然禁用", st && st.disabled === true, st && `disabled=${st.disabled}`);

    // 再勾选
    await clickEl(`document.querySelector('.dc-checkbox')`);
    await sleep(300);
    st = await submitState();
    check("密码 + 勾选都齐了 → 可点", st && st.disabled === false, st && `disabled=${st.disabled}`);
    check("勾选状态已生效", await evaluate(`document.querySelector('.dc-checkbox').checked === true`));

    // ==================================================================
    console.log("[3] 真的注销");
    await clickEl(`document.querySelector('.dc-submit')`);
    const backHome = await until(`location.pathname === '/' || location.pathname === '/index'`, 12000);
    check("注销后回到首页", backHome, await evaluate(`location.pathname`));
    const left = await evaluate(`localStorage.getItem('token')`);
    check("本地 token 已清除", !left || left === "null", `token=${String(left).slice(0, 12)}`);
    const toast = await evaluate(
      `[...document.querySelectorAll('.kokomi-toast')].map(e => e.textContent.trim()).join('|')`);
    check("给了「账号已注销」的轻提示", /已注销/.test(toast || ""), toast);

    const row = sql(`SELECT deleted_at, email FROM user WHERE id = ${self.id}`).split("\t");
    check("数据库里确实注销了", row[0] && row[0] !== "NULL", `deleted_at=${row[0]}`);
    check("邮箱已清空", !row[1] || row[1] === "NULL", `email=${row[1]}`);

    // ==================================================================
    console.log("[4] 后台：谁有「注销」按钮");
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(adminToken)})`);
    await nav(`${BASE}/admin/users`);
    const listReady = await until(`document.querySelectorAll('.user-row').length > 0`);
    check("后台用户列表加载出来", listReady);

    const adminRowHasBtn = await evaluate(`(() => {
      const row = [...document.querySelectorAll('.user-row')]
        .find(r => r.textContent.includes('#${adminId}'));
      if (!row) return null;
      return !!row.querySelector('.user-row__deactivate');
    })()`);
    check("管理员自己的行没有「注销」按钮", adminRowHasBtn === false, `has=${adminRowHasBtn}`);

    const memberRowHasBtn = await evaluate(`(() => {
      const row = [...document.querySelectorAll('.user-row')]
        .find(r => r.textContent.includes(${JSON.stringify(other.username)}));
      if (!row) return null;
      return !!row.querySelector('.user-row__deactivate');
    })()`);
    check("普通用户的行有「注销」按钮", memberRowHasBtn === true, `has=${memberRowHasBtn}`);

    // ==================================================================
    console.log("[5] 代注销必须手打用户名");
    await clickEl(`(() => {
      const row = [...document.querySelectorAll('.user-row')]
        .find(r => r.textContent.includes(${JSON.stringify(other.username)}));
      return row ? row.querySelector('.user-row__deactivate') : null;
    })()`);
    const boxOpen = await until(`!!document.querySelector('.el-message-box')`);
    check("弹出确认框", boxOpen);
    const boxTitle = await evaluate(
      `document.querySelector('.el-message-box__title')?.textContent.trim() || ''`);
    check("标题是「注销账号」", boxTitle === "注销账号", boxTitle);
    const boxBody = await evaluate(
      `document.querySelector('.el-message-box__message')?.textContent.replace(/\\s+/g,'') || ''`);
    check("正文说要手打用户名", boxBody.includes(other.username), boxBody.slice(0, 60));
    await shot("deactivate-02-confirm.png");

    // 空输入直接点确认 → 校验拦住
    await clickEl(`[...document.querySelectorAll('.el-message-box__btns .el-button')]
      .find(b => b.textContent.trim() === '确认注销') || null`);
    await sleep(600);
    const stillOpen = await evaluate(`!!document.querySelector('.el-message-box')`);
    const errMsg = await evaluate(
      `document.querySelector('.el-message-box__errormsg')?.textContent.trim() || ''`);
    check("空输入点确认被拦下（弹框还在）", stillOpen === true);
    check("给出「用户名不一致」的提示", /不一致/.test(errMsg), errMsg);

    // 输错 → 还是拦住
    await evaluate(`document.querySelector('.el-message-box__input input').focus()`);
    await send("Input.insertText", { text: "wrong_name" });
    await sleep(300);
    await clickEl(`[...document.querySelectorAll('.el-message-box__btns .el-button')]
      .find(b => b.textContent.trim() === '确认注销') || null`);
    await sleep(600);
    check("输错用户名也过不去", await evaluate(`!!document.querySelector('.el-message-box')`));
    let still = sql(`SELECT deleted_at FROM user WHERE id = ${other.id}`);
    check("被拦下时数据库没动", still === "NULL" || still === "", `deleted_at=${still}`);

    // 输对 → 真的注销
    await evaluate(`(() => {
      const el = document.querySelector('.el-message-box__input input');
      if (!el) return false;
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await evaluate(`document.querySelector('.el-message-box__input input').focus()`);
    await send("Input.insertText", { text: other.username });
    await sleep(300);
    await clickEl(`[...document.querySelectorAll('.el-message-box__btns .el-button')]
      .find(b => b.textContent.trim() === '确认注销') || null`);
    const closed = await until(`!document.querySelector('.el-message-box')`, 8000);
    check("输对后确认框关闭", closed);
    await sleep(800);

    still = sql(`SELECT deleted_at, email FROM user WHERE id = ${other.id}`).split("\t");
    check("后台代注销真的生效", still[0] && still[0] !== "NULL", `deleted_at=${still[0]}`);
    check("代注销也清空了邮箱", !still[1] || still[1] === "NULL", `email=${still[1]}`);

    const goneFromList = await evaluate(`(() => {
      return ![...document.querySelectorAll('.user-row')]
        .some(r => r.textContent.includes(${JSON.stringify(other.username)}));
    })()`);
    check("默认列表里不再出现（已注销默认隐藏）", goneFromList);

    // ==================================================================
    console.log("[6] 「显示已注销」开关");
    await clickEl(`document.querySelector('.users-head__filter input')`);
    await sleep(1200);
    const backInList = await until(`(() => [...document.querySelectorAll('.user-row')]
      .some(r => r.classList.contains('is-deleted')))()`, 8000);
    check("勾上后已注销的行回来了", backInList);

    const deletedRow = await evaluate(`(() => {
      const row = [...document.querySelectorAll('.user-row')]
        .find(r => r.classList.contains('is-deleted'));
      if (!row) return null;
      const cs = getComputedStyle(row);
      return {
        chip: row.querySelector('.deleted-chip')?.textContent.trim() || '',
        opacity: Number(cs.opacity),
        hasDeactivate: !!row.querySelector('.user-row__deactivate'),
        hasPunish: [...row.querySelectorAll('.user-row__style-btn')]
          .some(b => ['禁言', '封号', '解除', '注销'].includes(b.textContent.trim())),
        name: row.querySelector('.user-row__name')?.textContent.trim() || '',
      };
    })()`);
    check("带「已注销」标记", deletedRow && deletedRow.chip === "已注销", deletedRow && deletedRow.chip);
    check("整行压暗（opacity < 0.8）", deletedRow && deletedRow.opacity < 0.8,
      deletedRow && `opacity=${deletedRow.opacity}`);
    check("名字显示「已注销用户」", deletedRow && deletedRow.name === "已注销用户",
      deletedRow && deletedRow.name);
    check("注销按钮不再出现", deletedRow && deletedRow.hasDeactivate === false);
    check("处罚按钮也不再出现", deletedRow && deletedRow.hasPunish === false);
    await shot("deactivate-03-deleted-row.png");
  } finally {
    try { ws.close(); } catch { /* ignore */ }
    try { proc.kill(); } catch { /* ignore */ }
    cleanup();
    console.log(`\n通过 ${PASS.length} / ${PASS.length + FAIL.length}`);
    if (FAIL.length) {
      console.log("失败项：");
      FAIL.forEach((f) => console.log("  - " + f));
    }
    process.exit(FAIL.length ? 1 : 0);
  }
})().catch((e) => {
  console.error("脚本异常:", e.message);
  cleanup();
  process.exit(1);
});
