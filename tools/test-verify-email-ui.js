// 邮箱验证（防批量注册幽灵号）界面验收
//   [1] 注册表单只收邮箱：填手机号直接报「请输入正确的邮箱」
//   [2] 未验证账号进个人空间：发布框换成「验证邮箱后才能发布」提示卡
//   [3] 点「去验证」弹出验证弹窗：打码邮箱 + 本地 dev-echo 的明文码
//   [4] 错码有提示；正确码验证后提示卡消失、发布框回来
//   [5] 暗色主题下弹窗是深底浅字，手机 390 宽不溢出
//   [6] 后台用户列表：未验证标签 + 「激活」兜底按钮
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

/** 直接建账号（绕开 RSA + 图形验证码），返回 { id, username, token } */
function makeUser(tag, verified = 0) {
  const stamp = String(Date.now()).slice(-8) + Math.floor(Math.random() * 90 + 10);
  const username = `vfy_${tag}_${stamp}`;
  sql(
    "INSERT INTO user (username, password, name, email, email_verified, primary_role) " +
    `VALUES ('${username}', 'x', '${username}', '${username}@example.com', ${verified}, 'member')`
  );
  const id = Number(sql(`SELECT id FROM user WHERE username = '${username}'`));
  if (!id) throw new Error("造账号失败 " + username);
  sql(`INSERT INTO user_role (user_id, role_code) VALUES (${id}, 'member')`);
  created.push(id);
  const tv = Number(sql(`SELECT token_version FROM user WHERE id = ${id}`) || 1);
  return { id, username, token: signToken(id, tv) };
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
  const tokens = refreshTokens();
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
    // ---------------------------------------------------------- 1 注册只收邮箱
    console.log("\n[1] 注册表单只收邮箱");
    await nav(BASE + "/");
    await evaluate(`localStorage.removeItem('token')`);
    await nav(BASE + "/");
    await clickEl(".login-button");
    check("登录弹窗已打开", await until(`!!document.querySelector('.modal-overlay')`));
    await clickEl(".footer-link .link-text");
    check("切到注册表单", await until(`!!document.querySelector('.form-subtitle')`));
    const subtitle = await evaluate(`document.querySelector('.form-subtitle')?.textContent.trim()`);
    check("副标题提示要验证邮箱", (subtitle || "").includes("验证"), subtitle);

    // ⚠️ 注册表单最前面有一组隐藏的 autocomplete 填坑 input，
    // 用 .form-body input 会选中它们，必须限定在 .form-item 里
    await fill(".form-item input", "13900001111", 0);
    await clickEl(".submit-button");
    await sleep(300);
    const accErr = await evaluate(`document.querySelector('.err-tip')?.textContent.trim()`);
    check("填手机号被拦下", accErr === "请输入正确的邮箱", accErr);

    await fill(".form-item input", "someone@example.com", 0);
    await clickEl(".submit-button");
    await sleep(300);
    const errs = await evaluate(
      `[...document.querySelectorAll('.err-tip')].map(e => e.textContent.trim())`
    );
    check("改成邮箱后账号错误消失", !errs.some((e) => e.includes("邮箱")), JSON.stringify(errs));
    check("这时才开始要图形验证码", errs.some((e) => e.includes("验证码")), JSON.stringify(errs));

    // ---------------------------------------------------------- 2 未验证的发布框
    console.log("\n[2] 未验证账号的发布框");
    const userA = makeUser("a", 0);
    await nav(BASE + "/");
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(userA.token)})`);
    await nav(BASE + "/space/home");
    check("发布提示卡出现", await until(`!!document.querySelector('.muted-notice--verify')`));
    const notice = await evaluate(`(() => {
      const n = document.querySelector('.muted-notice--verify');
      return {
        title: n?.querySelector('.muted-notice__title')?.textContent.trim() || '',
        desc: n?.querySelector('.muted-notice__desc')?.textContent.trim() || '',
        btn: n?.querySelector('.muted-notice__refresh')?.textContent.trim() || '',
        hasEditor: !!document.querySelector('.publishing'),
        color: getComputedStyle(n).color,
      };
    })()`);
    check("标题是「验证邮箱后才能发布」", notice?.title === "验证邮箱后才能发布", notice?.title);
    check("提示里写了验证码发到哪个邮箱", (notice?.desc || "").includes("@example.com"), notice?.desc);
    check("按钮是「去验证」", notice?.btn === "去验证", notice?.btn);
    check("不给可编辑的发布框", notice?.hasEditor === false);
    check("用的是主色蓝（不是禁言粉）", notice?.color === "rgb(0, 174, 236)", notice?.color);
    await shot("verify-notice-space.png");

    // ---------------------------------------------------------- 3 验证弹窗
    console.log("\n[3] 验证邮箱弹窗");
    await clickEl(".muted-notice--verify .muted-notice__refresh");
    check("弹窗已打开", await until(`!!document.querySelector('.verify-card')`));
    check("验证码已自动发出（dev-echo 有明文）",
      await until(`!!document.querySelector('.verify-dev')`, 8000));
    const modal = await evaluate(`(() => {
      const card = document.querySelector('.verify-card');
      const cs = getComputedStyle(card);
      return {
        title: card.querySelector('.verify-head__title')?.textContent.trim() || '',
        desc: card.querySelector('.verify-head__desc')?.textContent.trim() || '',
        dev: card.querySelector('.verify-dev b')?.textContent.trim() || '',
        radius: cs.borderTopLeftRadius,
        bg: cs.backgroundColor,
        submitDisabled: card.querySelector('.verify-submit')?.disabled,
        foot: card.querySelector('.verify-resend')?.textContent.trim() || '',
      };
    })()`);
    check("标题「验证邮箱」", modal?.title === "验证邮箱", modal?.title);
    check("邮箱打码（带 ***）", (modal?.desc || "").includes("***"), modal?.desc);
    check("dev-echo 给了 6 位码", /^\d{6}$/.test(modal?.dev || ""), modal?.dev);
    check("卡片圆角 16px", modal?.radius === "16px", modal?.radius);
    check("6 位码没填时提交键禁用", modal?.submitDisabled === true);
    check("有重发倒计时", /\d+s 后可重发/.test(modal?.foot || ""), modal?.foot);
    await shot("verify-modal.png");
    const devCode = modal?.dev;

    // ---------------------------------------------------------- 4 错码 / 正确码
    console.log("\n[4] 错码与正确码");
    await fill(".verify-input", devCode === "000000" ? "111111" : "000000");
    await clickEl(".verify-submit");
    check("错码出现提示", await until(`!!document.querySelector('.verify-error')`, 8000));
    const errText = await evaluate(`document.querySelector('.verify-error')?.textContent.trim()`);
    check("提示说清还可以再试几次", (errText || "").includes("还可以再试"), errText);

    await fill(".verify-input", devCode);
    await clickEl(".verify-submit");
    check("验证成功后弹窗关闭", await until(`!document.querySelector('.verify-card')`, 10000));
    check("提示卡消失", await until(`!document.querySelector('.muted-notice--verify')`, 8000));
    check("发布框回来了", await until(`!!document.querySelector('.publishing')`, 8000));
    const dbFlag = sql(`SELECT email_verified FROM user WHERE id = ${userA.id}`);
    check("库里 email_verified 变成 1", dbFlag === "1", dbFlag);
    await shot("verify-done-space.png");

    // ---------------------------------------------------------- 5 暗色 + 手机
    console.log("\n[5] 暗色主题与手机宽度");
    const userB = makeUser("b", 0);
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(userB.token)})`);
    await evaluate(`localStorage.setItem('kokomi-theme', 'dark')`);
    await nav(BASE + "/space/home");
    check("暗色已生效", await evaluate(`document.documentElement.classList.contains('dark')`));
    await until(`!!document.querySelector('.muted-notice--verify')`);
    await clickEl(".muted-notice--verify .muted-notice__refresh");
    check("弹窗已打开", await until(`!!document.querySelector('.verify-card')`));
    await until(`!!document.querySelector('.verify-dev')`, 8000);
    const darkCard = await evaluate(`(() => {
      const card = document.querySelector('.verify-card');
      const cs = getComputedStyle(card);
      const title = getComputedStyle(card.querySelector('.verify-head__title'));
      return { bg: cs.backgroundColor, color: title.color };
    })()`);
    check("暗色下卡片是深底", darkCard?.bg === "rgb(30, 30, 30)", darkCard?.bg);
    check("暗色下标题是浅字", darkCard?.color === "rgb(240, 240, 240)", darkCard?.color);

    // 手机 390 宽。⚠️ 这里必须用「窄窗口」(mobile:false) 来量，别用 mobile:true 的模拟：
    // mobile 模拟下 Chrome 会按内容做 shrink-to-fit，`window.innerWidth` 报的是**内容宽度**
    // （本页 712），而真正可见的只有 390 —— 拿 innerWidth 当视口宽，断言 `546 <= 712` 天然成立
    // （假阳性），截图也只剩左边一块，看着像卡片跑出屏幕外。真实视口宽取 `documentElement.clientWidth`。
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: false,
    });
    await nav(BASE + "/space/home");
    await until(`!!document.querySelector('.muted-notice--verify')`);
    await clickEl(".muted-notice--verify .muted-notice__refresh");
    check("手机上弹窗也能打开", await until(`!!document.querySelector('.verify-card')`));
    const mobile = await evaluate(`(() => {
      const card = document.querySelector('.verify-card').getBoundingClientRect();
      return {
        w: Math.round(card.width), left: Math.round(card.left), right: Math.round(card.right),
        vw: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      };
    })()`);
    check("窄窗口布局视口就是 390", mobile.vw === 390, String(mobile.vw));
    check("卡片完整落在视口里", mobile.left >= 0 && mobile.right <= mobile.vw, JSON.stringify(mobile));
    check("卡片左右留白对称（居中）", Math.abs(mobile.left - (mobile.vw - mobile.right)) <= 1,
      `${mobile.left}/${mobile.vw - mobile.right}`);
    check("页面没有横向溢出", mobile.scroll <= mobile.vw + 1, `${mobile.scroll}/${mobile.vw}`);
    await shot("verify-modal-mobile.png");
    await clickEl(".verify-later");

    // 再用真 mobile 模拟量一次：可见区 = visualViewport，不是 innerWidth
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
    });
    await sleep(400);
    await clickEl(".muted-notice--verify .muted-notice__refresh");
    await until(`!!document.querySelector('.verify-card')`);
    const mobEmu = await evaluate(`(() => {
      const card = document.querySelector('.verify-card').getBoundingClientRect();
      const vv = window.visualViewport;
      return { left: Math.round(card.left), right: Math.round(card.right),
               vvw: Math.round(vv.width), vvleft: Math.round(vv.offsetLeft) };
    })()`);
    check("mobile 模拟下也在可见区内",
      mobEmu.left >= mobEmu.vvleft && mobEmu.right <= mobEmu.vvleft + mobEmu.vvw,
      JSON.stringify(mobEmu));
    await clickEl(".verify-later");

    // ---------------------------------------------------------- 6 后台兜底入口
    console.log("\n[6] 后台用户列表：未验证标签 + 激活");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false,
    });
    await evaluate(`localStorage.setItem('kokomi-theme', 'light')`);
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(tokens.admin)})`);
    await nav(BASE + "/admin/users");
    await until(`!!document.querySelector('.user-row')`, 15000);
    await fill(".users-head__input", userB.username);
    // fill 只设值不聚焦，不 focus 的话 Enter 落在 body 上，搜索不会触发
    // （之前没注意，列表还是全量，断言就变成了假阳性）
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
    await shot("verify-admin-chip.png");

    await clickByText(".user-row__style-btn", "激活");
    check("弹站内确认框", await until(`!!document.querySelector('.el-message-box')`, 8000));
    await sleep(400);
    await evaluate(`document.querySelector('.el-message-box__btns .el-button--primary')?.click()`);
    // 确认后要等接口 + 列表重新拉一遍，给足时间（偶发过一次 10s 不够）
    check("激活后「未验证」标签消失",
      await until(`!document.querySelector('.verify-chip')`, 15000));
    const flagB = sql(`SELECT email_verified FROM user WHERE id = ${userB.id}`);
    check("库里 email_verified 变成 1", flagB === "1", flagB);
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
