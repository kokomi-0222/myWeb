// 邮箱中心界面验收（个人中心的邮箱行 + 忘记密码）
//   [1] 登录弹窗脚注多了「忘记密码」，点开是「找回密码」那一屏
//   [2] 空邮箱点发送被拦住
//   [3] 走通「发码 → 错码提示 → 密码校验 → 重置成功」：重置后回登录屏并预填邮箱
//   [4] 个人中心「修改密码」页的「用绑定邮箱重置」直接落到找回密码屏
//   [5] 账号页邮箱行：暗色可读、390 宽不溢出
// 用法：node tools/test-email-center-ui.js（需 18080 后端 + 5194 预览）
const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
// ⚠️ 每个 UI 脚本必须用自己的调试端口：两个脚本同时跑、端口相同的话，
// get('/json/list') 会连到对方那个浏览器上，于是「注册测试」在操作找回密码弹窗，
// 报一堆看不懂的 FAIL（曾经真发生过）。9441 是 test-register-email-ui.js 的。
const DBG_PORT = 9457;
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

function refreshTokens() {
  const r = spawnSync("python", ["refresh_tokens.py"], { cwd: __dirname, encoding: "utf-8" });
  if (r.status !== 0) throw new Error("refresh_tokens.py 失败: " + (r.stderr || r.stdout));
  return JSON.parse(fs.readFileSync(path.join(OUT, "tmp", "tokens.json"), "utf-8"));
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
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(signing).digest("base64url");
  return `${signing}.${sig}`;
}

const created = [];

/** 直接建账号（绕开 RSA + 图形验证码）。默认造「已绑定邮箱的普通用户」 */
function makeUser(tag, { role = "member", withEmail = true, verified = 1 } = {}) {
  const stamp = String(Date.now()).slice(-8) + Math.floor(Math.random() * 90 + 10);
  const username = `mailui_${tag}_${stamp}`;
  const email = `${username}@example.com`;
  const emailSql = withEmail || verified ? `'${email}'` : "NULL";
  sql(
    "INSERT INTO user (username, password, name, email, email_verified, primary_role) " +
    `VALUES ('${username}', 'x', '${username}', ${emailSql}, ${verified}, '${role}')`
  );
  const id = Number(sql(`SELECT id FROM user WHERE username = '${username}'`));
  if (!id) throw new Error("造账号失败 " + username);
  sql(`INSERT INTO user_role (user_id, role_code) VALUES (${id}, '${role}')`);
  created.push(id);
  const tv = Number(sql(`SELECT token_version FROM user WHERE id = ${id}`) || 1);
  return { id, username, email, token: signToken(id, tv) };
}

function cleanup() {
  for (const id of created) {
    sql(`DELETE FROM user_role WHERE user_id = ${id}`);
    sql(`DELETE FROM user WHERE id = ${id}`);
  }
}

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
  refreshTokens();
  console.log("  token 已刷新");

  const proc = spawn(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-proxy-server",
      `--remote-debugging-port=${DBG_PORT}`,
      "--window-size=1200,1000",
      `--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-mail-ui-${process.pid}`,
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
  // --window-size 在 headless=new 下不一定生效，显式给桌面视口，
  // 否则视口 <768 时顶栏整块隐藏，登录按钮 rect 是 0
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false,
  });

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.result?.exceptionDetails) {
      throw new Error(
        JSON.stringify(r.result.exceptionDetails.exception?.description || "eval error")
      );
    }
    return r.result?.result?.value;
  };
  const until = async (expr, timeout = 12000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try {
        if (await evaluate(expr)) return true;
      } catch {
        /* 页面切换中 */
      }
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
      } catch {
        ok = false;
      }
      if (ok) break;
      await sleep(150);
    }
    await sleep(600);
  };
  const clickAt = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(300);
  };
  const clickEl = async (sel) => {
    const pos = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!pos) throw new Error("找不到元素: " + sel);
    await clickAt(pos.x, pos.y);
  };
  const clickByText = async (sel, text) => {
    const pos = await evaluate(`(() => {
      const el = [...document.querySelectorAll(${JSON.stringify(sel)})]
        .find(e => e.textContent.trim() === ${JSON.stringify(text)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!pos) throw new Error(`找不到文字为「${text}」的 ${sel}`);
    await clickAt(pos.x, pos.y);
  };
  const fill = async (sel, value, index = 0) => {
    await evaluate(`(() => {
      const els = document.querySelectorAll(${JSON.stringify(sel)});
      const el = els[${index}];
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(120);
  };
  const text = async (sel) =>
    (await evaluate(
      `document.querySelector(${JSON.stringify(sel)})?.textContent.trim() || ''`
    )) || "";

  try {
    // ---------------------------------------------------------- 1 入口
    console.log("\n[1] 登录弹窗里的「忘记密码」");
    await nav(BASE + "/");
    await evaluate(`localStorage.removeItem('token')`);
    await nav(BASE + "/");
    await clickEl(".login-button");
    check("登录弹窗已打开", await until(`!!document.querySelector('.modal-overlay')`));
    const links = await evaluate(
      `[...document.querySelectorAll('.footer-link .link-text')].map(e => e.textContent.trim())`
    );
    check("脚注里有「忘记密码」", links.includes("忘记密码"), JSON.stringify(links));

    await clickByText(".footer-link .link-text", "忘记密码");
    check("切到「找回密码」屏", (await until(`document.querySelector('.form-title')?.textContent.trim() === '找回密码'`)));
    const resetSub = await text(".form-subtitle");
    check("副标题说明用邮箱收码", resetSub.includes("邮箱"), resetSub);
    check("有邮箱输入框 + 发送按钮",
      await until(`!!document.querySelector('.reset-send')`));
    await shot("email-forgot-entry.png");

    // ---------------------------------------------------------- 2 空邮箱
    console.log("\n[2] 空邮箱点发送");
    await clickEl(".reset-send");
    check("提示「请输入绑定过的邮箱」",
      await until(`document.querySelector('.err-tip')?.textContent.includes('请输入绑定过的邮箱')`, 6000));
    const emptyTip = await text(".err-tip");
    check("文案正确", emptyTip === "请输入绑定过的邮箱", emptyTip);

    // ---------------------------------------------------------- 3 完整重置
    console.log("\n[3] 完整重置：发码 → 错码 → 密码校验 → 成功");
    const user = makeUser("reset");
    const hashBefore = sql(`SELECT password FROM user WHERE id = ${user.id}`);
    const tvBefore = Number(sql(`SELECT token_version FROM user WHERE id = ${user.id}`) || 1);

    await fill(".captcha-row input", user.email);
    await clickEl(".reset-send");
    check("发码成功后出现 dev-echo 明文码",
      await until(`!!document.querySelector('.reset-dev')`, 15000));
    const devCode = await text(".reset-dev b");
    check("拿到 6 位码", /^\d{6}$/.test(devCode), devCode);
    check("按钮进倒计时",
      await until(`/^\\d+s$/.test(document.querySelector('.reset-send')?.textContent.trim() || '')`, 6000));

    // 表单顺序：邮箱 / 验证码 / 新密码 / 确认
    const inputs = ".form-item .input-line";
    await fill(inputs, devCode === "000000" ? "111111" : "000000", 1);
    await fill(inputs, "NewPass123", 2);
    await fill(inputs, "NewPass123", 3);
    // 逐个 fill 只等 120ms，四点连填后在同一个 tick 里点提交容易拿到旧的 model 值
    // （曾经因此误报「请输入 6 位验证码」）。留一拍再点。
    await sleep(600);
    await clickEl(".submit-button");
    check("错码提示「验证码不正确」",
      await until(`document.querySelector('.err-tip')?.textContent.includes('验证码不正确')`, 12000));
    const wrongTip = await text(".err-tip");
    check("错码提示带剩余次数", wrongTip.includes("再试"), wrongTip);

    // 用错码试过一次后，码还剩 4 次机会：下面改成正确码继续
    await fill(inputs, devCode, 1);
    await fill(inputs, "123", 2);
    await clickEl(".submit-button");
    check("新密码太短被拦",
      await until(`document.querySelector('.err-tip')?.textContent.includes('至少 6 位')`, 8000));

    await fill(inputs, "NewPass123", 2);
    await fill(inputs, "OtherPass123", 3);
    await clickEl(".submit-button");
    check("两次不一致被拦",
      await until(`document.querySelector('.err-tip')?.textContent.includes('不一致')`, 8000));

    await fill(inputs, "NewPass123", 3);
    await clickEl(".submit-button");
    check("重置成功回到登录屏",
      await until(`document.querySelector('.form-title')?.textContent.trim() === '欢迎回来'`, 15000));
    check("登录框已预填邮箱",
      (await evaluate(`document.querySelector('.form-item .input-line')?.value || ''`)) === user.email);
    await shot("email-forgot-done.png");

    const hashAfter = sql(`SELECT password FROM user WHERE id = ${user.id}`);
    const tvAfter = Number(sql(`SELECT token_version FROM user WHERE id = ${user.id}`) || 1);
    check("库里密码哈希变了", hashAfter !== hashBefore && hashAfter.startsWith("$2"));
    check("token_version +1", tvAfter === tvBefore + 1, `${tvBefore} → ${tvAfter}`);

    // ---------------------------------------------------------- 4 修改密码页入口
    console.log("\n[4] 「修改密码」页的「用绑定邮箱重置」");
    await nav(BASE + "/");
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(user.token)})`);
    await nav(BASE + "/space/password");
    // 上一轮重置已经把 token_version +1，旧 token 失效 → 重新签一个
    const freshTv = Number(sql(`SELECT token_version FROM user WHERE id = ${user.id}`) || 1);
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(signToken(user.id, freshTv))})`);
    await nav(BASE + "/space/password");
    check("页面上有「用绑定邮箱重置」入口",
      await until(`!!document.querySelector('.forgot-link')`, 12000));
    await clickEl(".forgot-link");
    check("直接落在「找回密码」屏",
      await until(`document.querySelector('.form-title')?.textContent.trim() === '找回密码'`, 10000));

    // ---------------------------------------------------------- 5 账号页邮箱行的暗色 / 手机
    console.log("\n[5] 账号页邮箱行：暗色 + 390 宽");
    const guest = makeUser("row", { role: "guest", withEmail: false, verified: 0 });
    await evaluate(`localStorage.setItem('kokomi-theme', 'dark')`);
    await evaluate(`document.documentElement.classList.add('dark')`);
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(guest.token)})`);
    await nav(BASE + "/space/account?bind=1");
    check("暗色下绑定弹窗出现", await until(`!!document.querySelector('.bind-dialog')`, 12000));
    const darkRow = await evaluate(`(() => {
      const row = document.querySelector('.email-line');
      // 行内那行长说明已删，小字搬到弹窗底部（.bind-tip）
      const tip = document.querySelector('.bind-dialog .bind-tip');
      const panel = document.querySelector('.bind-dialog');
      return {
        tipColor: tip ? getComputedStyle(tip).color : '',
        panelBg: panel ? getComputedStyle(panel).backgroundColor : '',
        rowVisible: row ? row.getBoundingClientRect().height > 0 : false,
      };
    })()`);
    check("邮箱行可见", darkRow.rowVisible);
    check("弹窗底部小字用的是主题色（不是写死黑）",
      !!darkRow.tipColor && !["rgb(0, 0, 0)", "rgb(24, 25, 28)"].includes(darkRow.tipColor), darkRow.tipColor);
    await shot("email-account-dark.png");

    await send("Emulation.setDeviceMetricsOverride", {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: false,
    });
    await nav(BASE + "/space/account?bind=1");
    check("手机宽度下弹窗还在", await until(`!!document.querySelector('.bind-dialog')`, 12000));
    const mob = await evaluate(`(() => {
      const de = document.documentElement;
      const panel = document.querySelector('.bind-dialog');
      const r = panel ? panel.getBoundingClientRect() : null;
      return {
        vw: de.clientWidth,
        scroll: de.scrollWidth,
        left: r ? Math.round(r.left) : -1,
        right: r ? Math.round(r.right) : -1,
      };
    })()`);
    check("没有横向溢出", mob.scroll <= mob.vw, `${mob.scroll}/${mob.vw}`);
    check("弹窗没超出视口",
      mob.left >= 0 && mob.right <= mob.vw, JSON.stringify(mob));
    await shot("email-account-mobile.png");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false,
    });
  } catch (e) {
    check("执行未抛异常", false, String(e && e.message ? e.message : e).slice(0, 200));
  } finally {
    cleanup();
    try {
      ws.close();
    } catch {}
    try {
      proc.kill();
    } catch {}
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
