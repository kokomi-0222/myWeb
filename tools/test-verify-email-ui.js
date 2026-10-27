// 等级制（游客 / 普通用户 / 会员）界面验收
//   [1] 注册表单是两步：第一步只收邮箱 + 验证码（用户名/密码在第 2 步）
//   [2] 游客进空间页：没有发布框，出现「绑定邮箱后就能评论」的蓝色提示卡；评论区同样拦
//   [3] 绑定邮箱在「个人中心 → 账号管理」：提示卡跳转过去、自动展开面板、
//       空邮箱拦、dev-echo 明文码、错码提示
//   [4] 绑完变普通用户：评论框和发布框都回来，两张提示卡都消失
//   [4.5] 解绑：验当前密码 → 邮箱清空，但仍是普通用户、发布框还在
//   [5] 管理员改成会员：身份标签跟着变，发布框照旧
//   [6] 现造一个「能评论不能发帖」的只读角色：金色兜底卡出现且不给按钮；暗色 / 390 宽不溢出
//   [7] 后台用户列表：未验证标签 + 「激活」兜底（激活顺带把游客升成普通用户）
// 用法：node tools/test-verify-email-ui.js（需 18080 后端 + 5194 预览）
const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9431;
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
/** 临时角色码（只读角色），cleanup 时删掉 */
const createdRoles = [];
/** 管理员 token（refreshTokens 之后才知道），createPostAsAdmin 要用 */
let ADMIN_TOKEN = "";
/** 临时锚点帖 id，cleanup 时删掉 */
let ANCHOR_POST = 0;

/**
 * 直接建账号（绕开 RSA + 图形验证码），返回 { id, username, email, token }。
 * 默认造「刚注册的游客」：没有邮箱、角色 guest —— 注册不再收邮箱了。
 */
function makeUser(tag, { role = "guest", withEmail = false, verified = 0 } = {}) {
  const stamp = String(Date.now()).slice(-8) + Math.floor(Math.random() * 90 + 10);
  const username = `vfy_${tag}_${stamp}`;
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

/** 借管理员的 token 建一条帖，给评论区的提示当靶子 */
const createPostAsAdmin = async (title, content) => {
  const r = await fetch(`${BASE}/api/post/createPost`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ title, content, type: "life", media: [], tags: [] }),
  });
  const j = await r.json();
  if (!j.data) throw new Error("建帖失败: " + JSON.stringify(j));
  return j.data.id || j.data;
};

/**
 * 把测试账号的密码设成已知值。
 *
 * 为什么需要：makeUser 为了省事直接往 password 列塞了占位串 'x'，
 * 而解绑 / 换绑都要 BCrypt 验当前密码 —— 拿假哈希永远验不过。
 * 走的是真实的「忘记密码」链路（发码 + 重置），不往库里塞假 BCrypt。
 * 重置会让 token_version+1，所以顺手把 token 也换掉。
 */
const setKnownPassword = async (user, pwd = "Passw0rd1") => {
  const pub = await (await fetch(`${BASE}/api/publicKey`)).json();
  const b64 = pub.data.publicKey;
  const pem =
    `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join("\n")}\n-----END PUBLIC KEY-----`;
  const enc = crypto
    .publicEncrypt(
      { key: pem, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(JSON.stringify({ newPassword: pwd, confirmPassword: pwd }))
    )
    .toString("base64");

  const s1 = await (
    await fetch(`${BASE}/api/user/password/forgot/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email }),
    })
  ).json();
  const code = (s1.data || {}).devCode;
  if (!code) throw new Error("没拿到重置码：" + JSON.stringify(s1));

  const s2 = await (
    await fetch(`${BASE}/api/user/password/forgot/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, code, encryptedData: enc }),
    })
  ).json();
  if (s2.code !== 200) throw new Error("设密码失败：" + JSON.stringify(s2));

  const tv = Number(sql(`SELECT token_version FROM user WHERE id = ${user.id}`) || 1);
  user.token = signToken(user.id, tv);
  return pwd;
};

function cleanup() {
  if (ANCHOR_POST) {
    sql(`DELETE FROM comment WHERE post_id = ${ANCHOR_POST}`);
    sql(`DELETE FROM post WHERE id = ${ANCHOR_POST}`);
  }
  for (const id of created) {
    sql(`DELETE FROM user_role WHERE user_id = ${id}`);
    sql(`DELETE FROM user WHERE id = ${id}`);
  }
  for (const code of createdRoles) {
    sql(`DELETE FROM role_permission WHERE role_code = '${code}'`);
    sql("DELETE FROM `role` WHERE role_code = '" + code + "'");
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
  const tokens = refreshTokens();
  ADMIN_TOKEN = tokens.admin;
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
      // 每轮换一个 profile 目录：固定目录时上一轮残留的 Edge 进程会占着它，
      // 新进程直接退出，CDP 连上的是上一次那个空白页
      `--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-verify-email-${process.pid}`,
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
  // 显式给桌面视口：--window-size 在 headless=new 下不一定生效，
  // 一旦视口 <768px 顶栏整块隐藏，`.login-button` 的 rect 是 0，
  // 点击会落在 (0,0) 的移动端导航上（表现为「点了没反应」，很难查）。
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
    // 不能只等 readyState：about:blank 一开始就是 complete，
    // 拿到的还是空白页（读 localStorage 会抛 SecurityError）。
    // 必须等到 location.origin 真的换成目标站点。
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
  /** 按可见文字点按钮（列表里一排同名 class 的按钮只能这样找） */
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
  const pressEnter = async () => {
    for (const type of ["keyDown", "keyUp"]) {
      await send("Input.dispatchKeyEvent", {
        type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13,
      });
    }
    await sleep(600);
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

  try {
    // ---------------------------------------------------------- 1 注册表单：两步
    console.log("\n[1] 注册表单：第一步只验邮箱（用户名 / 密码在第 2 步）");
    await nav(BASE + "/");
    await evaluate(`localStorage.removeItem('token')`);
    await nav(BASE + "/");
    await clickEl(".login-button");
    check("登录弹窗已打开", await until(`!!document.querySelector('.modal-overlay')`));
    await clickEl(".footer-link .link-text");
    check("切到注册表单", await until(`!!document.querySelector('.form-subtitle')`));
    // 副标题只说明邮箱用来找回密码，不写「第 1 / 2 步」这类进度
    const subtitle = await evaluate(`document.querySelector('.form-subtitle')?.textContent.trim()`);
    check("副标题说明邮箱用途且不写步骤号",
      (subtitle || "").includes("找回密码") && !/第\s*\d+/.test(subtitle || ""), subtitle);

    const step1Labels = await evaluate(`(() =>
      [...document.querySelectorAll('.modal-container .input-line-wrapper')]
        .map(w => (w.querySelector('label')?.textContent || '').trim()))()`);
    check("第一步只有「邮箱 + 验证码」两行", step1Labels.length === 2,
      JSON.stringify(step1Labels));
    check("用户名 / 密码还没出现",
      !step1Labels.some((t) => /用户名|密码/.test(t)), JSON.stringify(step1Labels));
    check("注册不再要图形验证码",
      !(await evaluate(`!!document.querySelector('.modal-container .captcha-img')`)));

    await clickEl(".submit-button");
    check("空着点「下一步」会被拦",
      await until(`!!document.querySelector('.modal-container .err-tip')`, 6000));
    const step1Err = await evaluate(
      `document.querySelector('.modal-container .err-tip')?.textContent.trim() || ''`);
    check("提示要填邮箱", step1Err.includes("请输入邮箱"), step1Err);

    // ---------------------------------------------------------- 2 游客：绑定邮箱提示
    console.log("\n[2] 游客进空间页：发布框换成「绑定邮箱后就能评论」");
    const guest = makeUser("guest", { role: "guest" });
    await evaluate(`localStorage.setItem('kokomi-theme', 'light')`);
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(guest.token)})`);
    await nav(BASE + "/space/home");
    check("出现绑定邮箱提示卡", await until(`!!document.querySelector('.muted-notice--verify')`, 12000));
    const guestCard = await evaluate(`(() => {
      const c = document.querySelector('.muted-notice--verify');
      return {
        title: c?.querySelector('.muted-notice__title')?.textContent.trim() || '',
        btn: c?.querySelector('.muted-notice__refresh')?.textContent.trim() || '',
        role: document.querySelector('.user-role')?.textContent.trim() || '',
      };
    })()`);
    check("标题是「绑定邮箱后就能评论」", guestCard.title === "绑定邮箱后就能评论", guestCard.title);
    check("按钮是「去绑定」", guestCard.btn === "去绑定", guestCard.btn);
    check("身份标签显示「游客」", guestCard.role === "游客", guestCard.role);
    check("没给发布框", !(await evaluate(`!!document.querySelector('.publishing')`)));
    await shot("tier-guest-space.png");

    // 评论区同样拦：游客进帖子详情看到的是提示而不是输入框
    const pid = await createPostAsAdmin("等级制界面测试帖", "给评论区当靶子");
    check("锚点帖已创建", !!pid, `id=${pid}`);
    ANCHOR_POST = pid;
    await nav(BASE + "/post/" + pid);
    check("游客在评论区看到绑定提示",
      await until(`!!document.querySelector('.comment-muted-tip--verify')`, 12000));
    const cTip = await evaluate(
      `document.querySelector('.comment-muted-tip--verify')?.textContent.trim() || ''`);
    check("评论提示文案提到绑定邮箱", cTip.includes("绑定邮箱"), cTip);
    check("游客没有评论输入框",
      !(await evaluate(`!!document.querySelector('.comment-input-area textarea')`)));

    // ---------------------------------------------------------- 3 绑定邮箱（个人中心）
    console.log("\n[3] 绑定邮箱搬到了个人中心：点提示卡跳过去，在账号页填邮箱验证");
    await clickEl(".comment-muted-tip--verify");
    check("跳到了个人中心账号页",
      await until(`location.pathname === '/space/account'`, 12000));
    check("绑定面板自动展开（?bind=1）",
      await until(`!!document.querySelector('.bind-panel')`, 12000));
    check("有邮箱输入框", await until(`!!document.querySelector('.bind-input--email')`));
    check("不再是弹窗（没有 .verify-card 遮罩）",
      !(await evaluate(`!!document.querySelector('.verify-card')`)));
    check("邮箱行还是「未绑定」",
      (await evaluate(`document.querySelector('.email-text')?.textContent.trim() || ''`)) === "未绑定");

    await clickEl(".bind-send");
    check("没填邮箱就点发送会被拦住",
      await until(`document.querySelector('.bind-error')?.textContent.includes('先填写')`, 6000));
    const emptyErr = await evaluate(
      `document.querySelector('.bind-error')?.textContent.trim() || ''`);
    check("提示「请先填写要绑定的邮箱」", emptyErr.includes("请先填写要绑定的邮箱"), emptyErr);

    await fill(".bind-input--email", guest.email);
    await clickEl(".bind-send");
    check("填了邮箱后发码成功", await until(`!!document.querySelector('.bind-dev')`, 12000));
    const devCode = await evaluate(
      `document.querySelector('.bind-dev b')?.textContent.trim() || ''`);
    check("拿到本地 dev-echo 的 6 位码", /^\d{6}$/.test(devCode), devCode);
    check("发送后按钮进倒计时",
      await until(`/^\\d+s$/.test(document.querySelector('.bind-send')?.textContent.trim() || '')`, 6000));
    await shot("email-bind-panel.png");

    await fill(".bind-input--code", devCode === "000000" ? "111111" : "000000");
    await clickEl(".bind-submit");
    check("错码有提示", await until(`!!document.querySelector('.bind-error')`, 10000));
    const wrongErr = await evaluate(
      `document.querySelector('.bind-error')?.textContent.trim() || ''`);
    check("错码提示带剩余次数", wrongErr.includes("再试"), wrongErr);

    await fill(".bind-input--code", devCode);
    await clickEl(".bind-submit");
    check("绑定成功后面板自己收起来",
      await until(`!document.querySelector('.bind-panel')`, 15000));
    check("邮箱行显示邮箱 + 「换绑」按钮",
      await until(`!!document.querySelector('.email-link')`, 10000));
    const boundEmail = await evaluate(
      `document.querySelector('.email-text')?.textContent.trim() || ''`);
    check("邮箱行显示的就是刚绑的邮箱", boundEmail === guest.email, boundEmail);
    check("提示文案说明能找回密码",
      (await evaluate(`document.querySelector('.email-hint')?.textContent.trim() || ''`))
        .includes("找回密码"));
    await shot("email-bound-row.png");

    // ---------------------------------------------------------- 4 普通用户：评论 + 发帖都通
    console.log("\n[4] 升级成普通用户：评论框和发布框都回来了");
    await nav(BASE + "/post/" + pid);
    check("绑定后评论区变成真输入框",
      await until(`!!document.querySelector('.comment-input-area textarea')`, 12000));
    await nav(BASE + "/space/home");
    check("发布框出现了", await until(`!!document.querySelector('.publishing')`, 12000));
    check("没有「发帖权未开通」的金卡",
      !(await evaluate(`!!document.querySelector('.muted-notice--vip')`)));
    check("也没有「绑定邮箱」的蓝卡",
      !(await evaluate(`!!document.querySelector('.muted-notice--verify')`)));
    const memberWho = await evaluate(`(() => ({
      role: document.querySelector('.user-role')?.textContent.trim() || '',
      tip: document.querySelector('.user-tips-text')?.textContent.trim() || '',
    }))()`);
    check("身份标签变成「普通用户」", memberWho.role === "普通用户", memberWho.role);
    check("副标题回到「今天想说些什么呢？」", memberWho.tip.includes("今天想说"), memberWho.tip);
    await shot("tier-member-space.png");

    // ---------------------------------------------------------- 4.5 解绑
    console.log("\n[4.5] 解绑邮箱：验当前密码 → 邮箱清空，但仍是普通用户");
    // 解绑要 BCrypt 验密码，而 makeUser 写的是占位串，先把密码设成已知值
    const KNOWN_PWD = await setKnownPassword(guest);
    check("把测试账号密码设成已知值（为解绑做准备）", !!KNOWN_PWD, KNOWN_PWD);

    await evaluate(`localStorage.setItem('token', ${JSON.stringify(guest.token)})`);
    await nav(BASE + "/space/account");
    check("账号页有「解绑」按钮",
      await until(`[...document.querySelectorAll('.email-link')]
        .some(e => e.textContent.trim() === '解绑')`, 12000));

    await clickByText(".email-link", "解绑");
    check("解绑面板只有密码框、没有验证码",
      await until(`!!document.querySelector('.bind-panel input[type=password]')
        && !document.querySelector('.bind-panel .bind-input--code')`, 8000));

    await fill(".bind-panel input[type=password]", "WrongPass123");
    await clickEl(".bind-submit");
    check("密码错被拦下",
      await until(`(document.querySelector('.bind-error')?.textContent || '').includes('密码')`, 12000));
    const unbindErr = await evaluate(
      `document.querySelector('.bind-error')?.textContent.trim() || ''`);
    check("提示是「当前密码不正确」", unbindErr.includes("当前密码不正确"), unbindErr);
    await shot("email-unbind-wrong-pwd.png");

    await fill(".bind-panel input[type=password]", KNOWN_PWD);
    await clickEl(".bind-submit");
    check("解绑成功 → 邮箱行变回「未绑定」",
      await until(`document.querySelector('.email-text')?.textContent.trim() === '未绑定'`, 15000));
    check("按钮变回「去绑定」",
      (await evaluate(`document.querySelector('.email-link')?.textContent.trim() || ''`)) === "去绑定",
      await evaluate(`document.querySelector('.email-link')?.textContent.trim() || ''`));
    await shot("email-unbound-row.png");

    const unboundRow = sql(
      `SELECT IFNULL(email,'NULL'), email_verified, primary_role FROM user WHERE id = ${guest.id}`);
    const unboundCells = String(unboundRow).split("\t");
    check("库里邮箱清空、验证位归零",
      unboundCells[0] === "NULL" && unboundCells[1] === "0", unboundRow);
    check("解绑不降级（primary_role 仍是 member）", unboundCells[2] === "member", unboundCells[2]);

    await nav(BASE + "/space/home");
    check("解绑后发布框还在（权限没被回收）",
      await until(`!!document.querySelector('.publishing')`, 12000));
    check("也没有掉成游客的蓝卡",
      !(await evaluate(`!!document.querySelector('.muted-notice--verify')`)));
    await shot("email-unbound-space.png");

    console.log("\n[5] 管理员改成会员：身份标签跟着变，发布框照旧");
    const roleRes = await evaluate(`(async () => {
      const r = await fetch('/api/admin/user/${guest.id}/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ${tokens.admin}' },
        body: JSON.stringify({ roles: ['vip'] }),
      });
      const j = await r.json();
      return j.code;
    })()`);
    check("后台改角色成功", roleRes === 200, String(roleRes));
    await nav(BASE + "/space/home");
    check("发布框还在", await until(`!!document.querySelector('.publishing')`, 12000));
    const roleTag = await evaluate(`document.querySelector('.user-role')?.textContent.trim()`);
    check("身份标签变成「会员」", roleTag === "会员", roleTag);
    await shot("tier-vip-space.png");

    // ---------------------------------------------------------- 6 只读角色：金卡兜底
    // 默认矩阵里会员和普通用户都能发帖，金色卡在正常流程里不会出现。
    // 它留给「后台造一个能评论不能发帖的角色」，这里就现造一个来验。
    console.log("\n[6] 只读角色：金卡出现且不给按钮（509 分支的界面）");
    const roCode = "tier_ro_" + String(Date.now()).slice(-6);
    sql("INSERT INTO `role` (role_code, role_name, is_system, sort) " +
        `VALUES ('${roCode}', '只读测试角色', 0, 90)`);
    sql("INSERT INTO role_permission (role_code, perm_code) " +
        `VALUES ('${roCode}', 'comment:create')`);
    createdRoles.push(roCode);
    await evaluate(`(async () => {
      await fetch('/api/admin/user/${guest.id}/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ${tokens.admin}' },
        body: JSON.stringify({ roles: ['${roCode}'] }),
      });
    })()`);
    await nav(BASE + "/space/home");
    check("金卡出现了", await until(`!!document.querySelector('.muted-notice--vip')`, 12000));
    const roCard = await evaluate(`(() => {
      const c = document.querySelector('.muted-notice--vip');
      return {
        title: c?.querySelector('.muted-notice__title')?.textContent.trim() || '',
        color: c ? getComputedStyle(c).color : '',
        hasBtn: !!c?.querySelector('.muted-notice__refresh'),
        hasPublishing: !!document.querySelector('.publishing'),
      };
    })()`);
    check("标题是「你的账号还没有发帖权限」",
      roCard.title === "你的账号还没有发帖权限", roCard.title);
    check("卡片是金色的", roCard.color === "rgb(230, 162, 60)", roCard.color);
    check("这张卡不给按钮（用户自己解决不了）", roCard.hasBtn === false, String(roCard.hasBtn));
    check("只读角色没有发布框", roCard.hasPublishing === false);
    await shot("tier-readonly-space.png");

    // 暗色 / 手机就直接拿这张卡来量
    await evaluate(`localStorage.setItem('kokomi-theme', 'dark')`);
    await nav(BASE + "/space/home");
    check("暗色已生效", await evaluate(`document.documentElement.classList.contains('dark')`));
    check("暗色下金卡还在",
      await until(`!!document.querySelector('.muted-notice--vip')`, 12000));
    const darkColor = await evaluate(
      `getComputedStyle(document.querySelector('.muted-notice--vip')).color`);
    check("暗色下卡片主色没被吃掉", darkColor === "rgb(230, 162, 60)", darkColor);
    await shot("tier-member-dark.png");

    // ⚠️ 量手机布局必须用真窄窗口（mobile:false + 390）：
    // mobile:true 的模拟里 innerWidth 会报成内容宽度（页面溢出时 712），
    // 拿它断言「不溢出」恒成立 = 假阳性，截图也只是把宽布局压进 390。
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: false,
    });
    await nav(BASE + "/space/home");
    check("手机宽度下金卡还在",
      await until(`!!document.querySelector('.muted-notice--vip')`, 12000));
    const mob = await evaluate(`(() => {
      const c = document.querySelector('.muted-notice--vip').getBoundingClientRect();
      return {
        left: Math.round(c.left), right: Math.round(c.right),
        vw: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      };
    })()`);
    check("布局视口就是 390", mob.vw === 390, String(mob.vw));
    check("卡片不超出视口", mob.left >= 0 && mob.right <= mob.vw, JSON.stringify(mob));
    check("页面没有横向溢出", mob.scroll <= mob.vw + 1, `${mob.scroll}/${mob.vw}`);
    await shot("tier-member-mobile.png");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false,
    });

    // ---------------------------------------------------------- 7 后台兜底入口
    console.log("\n[7] 后台用户列表：未验证标签 + 激活");
    // 「激活」只给**有邮箱但没验证**的账号：以前无邮箱也能点，会造出
    // 「email 为空但 email_verified=1」的死状态（用户在个人中心看到"未绑定"，
    // 去绑却一直提示"已验证"）。所以这里要两种账号都验一遍。
    const chipUser = makeUser("chip", { role: "guest", withEmail: true, verified: 0 });
    const noMailUser = makeUser("nomail", { role: "guest" });
    await evaluate(`localStorage.setItem('kokomi-theme', 'light')`);
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(tokens.admin)})`);
    await nav(BASE + "/admin/users");
    await until(`!!document.querySelector('.user-row')`, 15000);
    await fill(".users-head__input", chipUser.username);
    // fill 只设值不聚焦，不 focus 的话 Enter 落在 body 上，搜索不会触发
    await evaluate(`document.querySelector('.users-head__input')?.focus()`);
    await pressEnter();
    check("搜到未验证的那个用户", await until(`!!document.querySelector('.verify-chip')`, 10000));
    const rowCount = await evaluate(`document.querySelectorAll('.user-row').length`);
    check("搜索结果只剩这一行", rowCount === 1, `${rowCount} 行`);
    const row = await evaluate(`(() => {
      const chip = document.querySelector('.verify-chip');
      const row = chip?.closest('.user-row');
      const btns = [...(row?.querySelectorAll('.user-row__style-btn') || [])]
        .map(b => b.textContent.trim());
      return { chip: chip?.textContent.trim() || '', btns };
    })()`);
    check("标签文字是「未验证」", row?.chip === "未验证", row?.chip);
    check("多了「激活」按钮", (row?.btns || []).includes("激活"), JSON.stringify(row?.btns));
    await shot("tier-admin-chip.png");

    // 没邮箱的账号不能激活（否则又是那个死状态），只能等他自己去绑
    await fill(".users-head__input", noMailUser.username);
    await evaluate(`document.querySelector('.users-head__input')?.focus()`);
    await pressEnter();
    await until(`!!document.querySelector('.user-row')`, 10000);
    const noMailRow = await evaluate(`(() => {
      const row = document.querySelector('.user-row');
      return {
        chip: row?.querySelector('.verify-chip')?.textContent.trim() || '',
        btns: [...(row?.querySelectorAll('.user-row__style-btn') || [])].map(b => b.textContent.trim()),
      };
    })()`);
    check("没邮箱的账号标签是「未绑邮箱」", noMailRow.chip === "未绑邮箱", noMailRow.chip);
    check("没邮箱的不给「激活」按钮（防死锁）",
      !noMailRow.btns.includes("激活"), JSON.stringify(noMailRow.btns));

    // 回到有邮箱那个账号上点激活
    await fill(".users-head__input", chipUser.username);
    await evaluate(`document.querySelector('.users-head__input')?.focus()`);
    await pressEnter();
    await until(`!!document.querySelector('.verify-chip')`, 10000);

    await clickByText(".user-row__style-btn", "激活");
    check("弹站内确认框", await until(`!!document.querySelector('.el-message-box')`, 8000));
    await sleep(400);
    await evaluate(`document.querySelector('.el-message-box__btns .el-button--primary')?.click()`);
    // 确认后要等接口 + 列表重新拉一遍，给足时间（偶发过一次 10s 不够）
    check("激活后「未验证」标签消失",
      await until(`!document.querySelector('.verify-chip')`, 15000));
    const flag = sql(`SELECT email_verified FROM user WHERE id = ${chipUser.id}`);
    check("库里 email_verified 变成 1", flag === "1", flag);
    const roleAfter = sql(
      `SELECT IFNULL(GROUP_CONCAT(role_code), '') FROM user_role WHERE user_id = ${chipUser.id}`);
    check("激活顺带把游客升成普通用户", roleAfter.includes("member"), roleAfter);
  } catch (e) {
    check("执行未抛异常", false, e.message);
  } finally {
    cleanup();
    console.log(`\n通过 ${PASS.length} / 失败 ${FAIL.length}`);
    if (FAIL.length) console.log("失败项：\n - " + FAIL.join("\n - "));
    ws.close();
    proc.kill();
    process.exit(FAIL.length ? 1 : 0);
  }
})();
