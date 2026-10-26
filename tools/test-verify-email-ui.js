// 等级制（游客 / 普通用户 / 会员）界面验收
//   [1] 注册表单只收用户名：带 @ 和过短的用户名都被前端拦下
//   [2] 游客进空间页：没有发布框，出现「绑定邮箱后就能评论」的蓝色提示卡；评论区同样拦
//   [3] 绑定邮箱弹窗：新账号要自己填邮箱，空邮箱发不出去，dev-echo 给明文码，错码有提示
//   [4] 绑完变普通用户：蓝卡换成金色「发帖需要会员权限」卡（这张卡故意不给按钮）
//   [5] 管理员改成会员：发布框立刻回来，身份标签变「会员」
//   [6] 降回普通用户：暗色 / 390 宽下提示卡不溢出
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

function cleanup() {
  if (ANCHOR_POST) {
    sql(`DELETE FROM comment WHERE post_id = ${ANCHOR_POST}`);
    sql(`DELETE FROM post WHERE id = ${ANCHOR_POST}`);
  }
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
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-verify-email",
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
    await send("Page.navigate", { url });
    await until(`document.readyState === 'complete'`, 15000);
    await sleep(800);
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
    // ---------------------------------------------------------- 1 注册表单：用户名
    console.log("\n[1] 注册表单：用户名 + 密码（不再强制邮箱）");
    await nav(BASE + "/");
    await evaluate(`localStorage.removeItem('token')`);
    await nav(BASE + "/");
    await clickEl(".login-button");
    check("登录弹窗已打开", await until(`!!document.querySelector('.modal-overlay')`));
    await clickEl(".footer-link .link-text");
    check("切到注册表单", await until(`!!document.querySelector('.form-subtitle')`));
    const subtitle = await evaluate(`document.querySelector('.form-subtitle')?.textContent.trim()`);
    check("副标题说清楚注册后是游客", (subtitle || "").includes("游客"), subtitle);

    // ⚠️ 注册表单最前面有一组隐藏的 autocomplete 填坑 input，
    // 直接 `.form-body input` 会选到它们（值设不进去，断言全是假阳性）→ 用 .form-item
    await fill(".form-item input", "abc@qq.com", 0);
    await clickEl(".submit-button");
    check("邮箱样式的用户名被前端拦下", await until(`!!document.querySelector('.err-tip')`));
    const accErr = await evaluate(`document.querySelector('.err-tip')?.textContent.trim() || ''`);
    check("提示说明只允许中文/字母/数字/下划线",
      accErr === "用户名只能包含中文、字母、数字和下划线", JSON.stringify(accErr));

    await fill(".form-item input", "a", 0);
    await clickEl(".submit-button");
    await sleep(200);
    const shortErr = await evaluate(`document.querySelector('.err-tip')?.textContent.trim() || ''`);
    check("太短的用户名也被拦", shortErr === "用户名需要 2~20 个字符", JSON.stringify(shortErr));

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

    // ---------------------------------------------------------- 3 绑定邮箱弹窗
    console.log("\n[3] 绑定邮箱弹窗：新账号没有预填邮箱，要自己填");
    await clickEl(".comment-muted-tip--verify");
    check("弹窗已打开", await until(`!!document.querySelector('.verify-card')`));
    check("有邮箱输入框", await until(`!!document.querySelector('.verify-input--email')`));
    const modalTitle = await evaluate(
      `document.querySelector('.verify-head__title')?.textContent.trim()`);
    check("标题是「绑定邮箱」", modalTitle === "绑定邮箱", modalTitle);

    await clickEl(".verify-resend");
    check("没填邮箱就点发送会被拦住",
      await until(`document.querySelector('.verify-error')?.textContent.includes('先填写')`, 6000));
    const emptyErr = await evaluate(
      `document.querySelector('.verify-error')?.textContent.trim() || ''`);
    check("提示「请先填写要绑定的邮箱」", emptyErr.includes("请先填写要绑定的邮箱"), emptyErr);

    await fill(".verify-input--email", guest.email);
    await clickEl(".verify-resend");
    check("填了邮箱后发码成功", await until(`!!document.querySelector('.verify-dev')`, 12000));
    const devCode = await evaluate(
      `document.querySelector('.verify-dev b')?.textContent.trim() || ''`);
    check("拿到本地 dev-echo 的 6 位码", /^\d{6}$/.test(devCode), devCode);
    check("发送后按钮进倒计时",
      await until(`document.querySelector('.verify-resend')?.textContent.includes('后可重发')`, 6000));
    await shot("tier-bind-modal.png");

    const CODE_SEL = ".verify-input:not(.verify-input--email)";
    await fill(CODE_SEL, devCode === "000000" ? "111111" : "000000");
    await clickEl(".verify-submit");
    check("错码有提示", await until(`!!document.querySelector('.verify-error')`, 10000));

    await fill(CODE_SEL, devCode);
    await clickEl(".verify-submit");
    check("正确码后弹窗自己关掉", await until(`!document.querySelector('.verify-card')`, 15000));
    check("绑定后评论区变成真输入框",
      await until(`!!document.querySelector('.comment-input-area textarea')`, 12000));

    // ---------------------------------------------------------- 4 普通用户：能评论不能发帖
    console.log("\n[4] 升级成普通用户：能评论，发帖还是不行");
    await nav(BASE + "/space/home");
    check("出现「发帖需要会员权限」提示卡",
      await until(`!!document.querySelector('.muted-notice--vip')`, 12000));
    const memberCard = await evaluate(`(() => {
      const c = document.querySelector('.muted-notice--vip');
      return {
        title: c?.querySelector('.muted-notice__title')?.textContent.trim() || '',
        role: document.querySelector('.user-role')?.textContent.trim() || '',
        color: c ? getComputedStyle(c).color : '',
        hasBtn: !!c?.querySelector('.muted-notice__refresh'),
      };
    })()`);
    check("标题是「发帖需要会员权限」", memberCard.title === "发帖需要会员权限", memberCard.title);
    check("身份标签变成「普通用户」", memberCard.role === "普通用户", memberCard.role);
    check("卡片是金色的", memberCard.color === "rgb(230, 162, 60)", memberCard.color);
    check("这张卡不给按钮（用户自己解决不了）", memberCard.hasBtn === false, String(memberCard.hasBtn));
    check("还是没有发布框", !(await evaluate(`!!document.querySelector('.publishing')`)));
    await shot("tier-member-space.png");

    // ---------------------------------------------------------- 5 管理员升会员
    console.log("\n[5] 管理员改成会员后，发布框回来");
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
    check("发布框回来了", await until(`!!document.querySelector('.publishing')`, 12000));
    check("提示卡都消失了", !(await evaluate(`!!document.querySelector('.muted-notice--vip')`)));
    const roleTag = await evaluate(`document.querySelector('.user-role')?.textContent.trim()`);
    check("身份标签变成「会员」", roleTag === "会员", roleTag);
    await shot("tier-vip-space.png");

    // ---------------------------------------------------------- 6 降回普通用户：暗色 / 手机
    console.log("\n[6] 降回普通用户：暗色与手机宽度");
    await evaluate(`(async () => {
      await fetch('/api/admin/user/${guest.id}/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ${tokens.admin}' },
        body: JSON.stringify({ roles: ['member'] }),
      });
    })()`);
    await evaluate(`localStorage.setItem('kokomi-theme', 'dark')`);
    await nav(BASE + "/space/home");
    check("暗色已生效", await evaluate(`document.documentElement.classList.contains('dark')`));
    check("暗色下会员提示卡还在",
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
    check("手机宽度下提示卡还在",
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
    const chipUser = makeUser("chip", { role: "guest" });
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
