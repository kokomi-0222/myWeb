// 注册 + 邮箱解绑界面验收（两步注册 / 解绑只丢找回密码）
//   [1] 注册第 1 步：只有邮箱 + 验证码，没有用户名/密码/图形验证码
//   [2] 发码后本地调试码出现（SMTP 没配时的 dev-echo）
//   [3] 验证码通过 → 第 2 步：没有用户名输入框、没有用户名说明文字、
//       没有「换一个邮箱」按钮，只有「邮箱已确认 xxx」+ 密码 + 确认密码
//   [4] 注册成功直接登录：弹窗关闭、token 落地、账号是已验证的普通用户，
//       用户名是后端生成的 kokomi_00128、昵称派生为「用户128」
//   [5] 个人中心：已绑定邮箱，有「更换」也有「解绑」
//   [6] 解绑要验当前密码：错密码红字、对密码解绑成功、账号仍是 member
//   [7] 解绑后发布框还在（权限不回收）
//   [8] 390 宽下不横向溢出
// 用法：node tools/test-register-email-ui.js（需 18080 后端 + 5194 预览）
const { spawn, spawnSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9441;
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

const stamp = String(Date.now()).slice(-7);
const EMAIL = `ui_reg_${stamp}@example.com`;
const PWD = "Passw0rd1";
let createdId = 0;
/** 注册时后端生成的用户名（kokomi_00128），用来断言账号页确实把它显示出来 */
let accountName = "";

(async () => {
  const proc = spawn(
    EDGE,
    [
      "--headless=new", "--disable-gpu", "--no-sandbox", "--no-proxy-server",
      `--remote-debugging-port=${DBG_PORT}`,
      "--window-size=1200,1000",
      `--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-reg-email-${process.pid}`,
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  await sleep(2500);
  let list = [];
  for (let i = 0; i < 12; i++) {
    try { list = await get("/json/list"); break; } catch { await sleep(500); }
  }
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false,
  });

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) {
      throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || "eval error"));
    }
    return r.result?.result?.value;
  };
  const until = async (expr, timeout = 12000) => {
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
      try { ok = await evaluate(`location.origin === ${JSON.stringify(origin)}`); } catch { /* 导航中 */ }
      if (ok) break;
      await sleep(150);
    }
    await until("document.readyState === 'complete'");
    await sleep(600);
  };
  const clickText = async (sel, text) => {
    const ok = await evaluate(`(() => {
      const el = [...document.querySelectorAll(${JSON.stringify(sel)})]
        .find(e => (e.textContent || '').includes(${JSON.stringify(text)}));
      if (!el) return false; el.click(); return true;
    })()`);
    if (!ok) throw new Error(`没找到含「${text}」的 ${sel}`);
  };

  /**
   * 过发码前的人机校验（CaptchaPrompt）。
   * 本地 dev-echo 会把图形码明文渲染在 .cp-dev 里，脚本照着填就能过；
   * 线上没有这段文本，所以这条等价于「真人看图」。
   * @returns 填入的明文（拿不到就是空串，说明人机块没出现或后端没开 dev-echo）
   */
  const solveCaptcha = async () => {
    if (!(await until("!!document.querySelector('.cp .cp-dev b')"))) return "";
    const plain = await evaluate("document.querySelector('.cp .cp-dev b')?.textContent || ''");
    if (!plain) return "";
    await evaluate(`(() => {
      const el = document.querySelector('.cp .cp-input');
      if (!el) return false;
      el.value = ${JSON.stringify(plain)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    // 等 Vue 把 v-model 写回去、把「确定」从 disabled 放开
    await sleep(150);
    await evaluate("document.querySelector('.cp .cp-ok')?.click()");
    return plain;
  };

  // 按 InputLine 的 label 文本定位：表单里还有两个防自动填充的隐藏 input，
  // 按序号取会把它们也算进来（数量对不上）。
  const fillByLabel = async (pairs) => {
    return evaluate(`(() => {
      const wraps = [...document.querySelectorAll('.modal-container .input-line-wrapper')];
      const pairs = ${JSON.stringify(pairs)};
      for (const [labelPrefix, val] of pairs) {
        const w = wraps.find(x =>
          (x.querySelector('label')?.textContent || '').trim().startsWith(labelPrefix));
        if (!w) return 'no label: ' + labelPrefix;
        const el = w.querySelector('input');
        if (!el) return 'no input: ' + labelPrefix;
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return 'ok';
    })()`);
  };
  const visibleInputs = () => evaluate(`(() => {
    const box = document.querySelector('.modal-container');
    if (!box) return [];
    return [...box.querySelectorAll('input')]
      // 只算真正在 InputLine 里的输入框：表单顶部还有两个防自动填充的隐藏 input，
      // 它们父容器是 0×0，但自身 offsetWidth 仍有值，按尺寸过滤筛不掉
      .filter(i => i.closest('.input-line-wrapper') && i.offsetWidth > 0)
      .map(i => (i.closest('.input-line-wrapper')?.querySelector('label')?.textContent || i.placeholder || '').trim());
  })()`);

  try {
    // ------------------------------------------------------------------
    console.log("[1] 注册第 1 步：只验邮箱");
    await nav(BASE);
    await until("!!document.querySelector('.login-button')");
    await evaluate("document.querySelector('.login-button').click()");
    await until("!!document.querySelector('.modal-container')");
    await clickText(".link-text", "立即注册");
    check("能切到注册表单",
      await until("document.querySelector('.form-title')?.textContent.includes('创建账号')"));
    // 第 1 步也**没有副标题**：用户明确要求「不要写第几步、不要把刚填的邮箱再显示一遍」，
    // 标题「创建账号」+ 两个输入框已经说清楚了。第 2 步同样没有（下面单独有一条）。
    const sub1 = await evaluate(
      "(document.querySelector('.modal-container .form-subtitle')||{}).textContent || ''");
    check("第 1 步没有副标题（不写步骤号、不回显邮箱）", !sub1.trim(), JSON.stringify(sub1));

    const step1Inputs = await visibleInputs();
    check("第 1 步只有「邮箱 + 验证码」两个输入框", step1Inputs.length === 2,
      JSON.stringify(step1Inputs));
    check("初始不展示人机校验（点「发送验证码」才出现，不占版面）",
      !(await evaluate("!!document.querySelector('.modal-container .cp')")));
    check("没有用户名/密码框", !step1Inputs.some(t => /用户名|密码/.test(t)),
      JSON.stringify(step1Inputs));

    // ------------------------------------------------------------------
    console.log("[2] 发邮箱验证码（先要同意隐私政策）");
    const fillMail = await fillByLabel([["邮箱", EMAIL]]);
    check("邮箱框能按 label 定位", fillMail === "ok", fillMail);

    // 同意勾选框：默认不勾（默认勾选 = 未经同意收集，是通报高频项）
    const agreeState = await evaluate(`(() => {
      const box = document.querySelector('.modal-container .agree-box');
      const link = document.querySelector('.modal-container .agree-link');
      return {
        exists: !!box,
        checked: box ? box.checked : null,
        linkHref: link ? link.getAttribute('href') : '',
        linkTarget: link ? link.getAttribute('target') : '',
      };
    })()`);
    check("注册第 1 步有《隐私政策》勾选框", agreeState.exists, JSON.stringify(agreeState));
    check("勾选框默认不勾选", agreeState.checked === false, String(agreeState.checked));
    check("政策链接指向 /privacy 且新开窗口",
      agreeState.linkHref === "/privacy" && agreeState.linkTarget === "_blank",
      `${agreeState.linkHref} / ${agreeState.linkTarget}`);

    await evaluate("document.querySelector('.modal-container .reset-send').click()");
    const needAgree = await until(
      "(document.querySelector('.modal-container .err-tip')?.textContent||'').includes('隐私政策')", 6000);
    check("未勾选点发送 → 红字要求先同意", needAgree,
      await evaluate("document.querySelector('.modal-container .err-tip')?.textContent.trim()"));
    check("未勾选时不展开人机校验（连图都不拉）",
      !(await evaluate("!!document.querySelector('.modal-container .cp')")));

    await evaluate("document.querySelector('.modal-container .agree-box').click()");
    check("勾选后复选框为选中态",
      (await evaluate("document.querySelector('.modal-container .agree-box').checked")) === true);

    // 勾选后点发送 → 不是直接发信，而是先展开图形验证码
    await evaluate("document.querySelector('.modal-container .reset-send').click()");
    const captchaShown = await until("!!document.querySelector('.modal-container .cp')", 8000);
    check("勾选后点发送 → 先出现人机校验，不直接发信", captchaShown);
    check("人机校验里有输入框和换图按钮",
      await evaluate(`(() => {
        const box = document.querySelector('.modal-container .cp');
        return !!(box?.querySelector('.cp-input') && box?.querySelector('.cp-img'));
      })()`));
    // 图片是挂载后才异步拉的，别在同一个 tick 里查 querySelector('img')
    check("图形码图片能加载出来",
      await until("!!document.querySelector('.modal-container .cp-img img')", 8000));

    const solvedPlain = await solveCaptcha();
    check("图形验证码能填能提交（本地 dev-echo 有明文）", !!solvedPlain, solvedPlain);

    const gotDev = await until("!!document.querySelector('.modal-container .reset-dev')", 12000);
    const devCode = gotDev
      ? await evaluate("document.querySelector('.reset-dev b')?.textContent || ''")
      : "";
    check("人机校验通过后能正常发码（出现本地调试码）", gotDev && /^\d{6}$/.test(devCode), devCode);
    check("发码成功后收起人机校验块",
      !(await evaluate("!!document.querySelector('.modal-container .cp')")));
    await shot("reg-step1-email.png");

    // ------------------------------------------------------------------
    console.log("[3] 验证码通过 → 第 2 步");
    // 先故意填错一次，确认错误落在验证码框而不是整页报错
    await fillByLabel([["邮箱验证码", "000000"]]);
    await evaluate("document.querySelector('.modal-container .submit-button').click()");
    const badCode = await until(
      "(document.querySelector('.modal-container .err-tip')?.textContent||'').includes('验证码')", 12000);
    check("错验证码给红字提示", badCode,
      await evaluate("document.querySelector('.modal-container .err-tip')?.textContent.trim()"));

    await fillByLabel([["邮箱验证码", devCode]]);
    await evaluate("document.querySelector('.modal-container .submit-button').click()");
    check("正确验证码 → 进入第 2 步",
      await until("document.querySelector('.form-title')?.textContent.includes('设置登录密码')", 12000));

    // 第 2 步刻意只留「标题 + 两个密码框 + 按钮」：
    //   不显示步骤进度（「第 2 / 2 步」）、不重复显示刚验过的邮箱、
    //   不放用户名说明、「换一个邮箱」也没有 —— 要换就关弹窗重来。
    const step2Chrome = await evaluate(`(() => {
      const body = document.querySelector('.modal-container').innerText;
      return {
        subtitle: !!(document.querySelector('.form-subtitle')?.textContent || '').trim(),
        showsEmail: body.includes(${JSON.stringify(EMAIL)}),
        hasMailBox: !!document.querySelector('.reg-mail'),
        hasAccInput: [...document.querySelectorAll('.modal-container .input-line-wrapper')]
          .some(x => (x.querySelector('label')?.textContent||'').startsWith('用户名')),
        hasHint: !!document.querySelector('.reg-hint'),
        stepText: /第\\s*\\d+\\s*\\/\\s*\\d+\\s*步/.test(body),
        title: (document.querySelector('.form-title')?.textContent || '').trim(),
      };
    })()`);
    check("第 2 步不显示步骤进度", !step2Chrome.stepText);
    check("第 2 步没有用户名输入框 / 用户名说明", !step2Chrome.hasAccInput && !step2Chrome.hasHint);
    check("第 2 步不重复显示邮箱", !step2Chrome.showsEmail && !step2Chrome.hasMailBox,
      `showsEmail=${step2Chrome.showsEmail} hasMailBox=${step2Chrome.hasMailBox}`);
    check("第 2 步没有副标题", !step2Chrome.subtitle);
    check("第 2 步标题是「设置登录密码」", step2Chrome.title === "设置登录密码", step2Chrome.title);
    const step2Inputs = await visibleInputs();
    check("第 2 步只有「密码 + 确认密码」两个输入", step2Inputs.length === 2,
      JSON.stringify(step2Inputs));
    await shot("reg-step2-password.png");

    // ------------------------------------------------------------------
    console.log("[4] 注册并自动登录");
    await fillByLabel([["密码（", PWD], ["确认密码", PWD]]);
    await evaluate("document.querySelector('.modal-container .submit-button').click()");
    check("注册成功后弹窗关闭",
      await until("!document.querySelector('.modal-container')", 15000));
    check("注册即登录（token 已落地）",
      await until("!!localStorage.getItem('token') || !!localStorage.getItem('kokomi-token')"));
    await shot("reg-logged.png");

    const row = sql(
      `SELECT id, email, email_verified, primary_role, username, name FROM user WHERE email = '${EMAIL}'`);
    const cells = String(row).split("\t");
    createdId = Number(cells[0]) || 0;
    check("账号落库且邮箱已验证", cells[1] === EMAIL && cells[2] === "1", String(row));
    check("注册完就是普通用户（member）", cells[3] === "member", cells[3]);
    accountName = cells[4] || "";
    check("用户名是系统生成的 kokomi_ + 序号（kokomi_00128）",
      /^kokomi_\d{5,}$/.test(accountName), accountName);
    check("昵称派生为「用户+序号」（去前导零）", /^用户\d+$/.test(cells[5] || ""), cells[5]);

    // ------------------------------------------------------------------
    console.log("[5] 个人中心 → 账号管理 / 账号安全");
    await nav(`${BASE}/space/account`);
    await until("document.body.innerText.includes('用户名')");
    const accountText = await evaluate("document.body.innerText");
    check("账号页显示系统生成的用户名",
      !!accountName && accountText.includes(accountName), accountName);
    // 邮箱、改密码、注销都搬到了「账号安全」，账号管理只剩资料
    await nav(`${BASE}/space/security`);
    await until("document.body.innerText.includes('邮箱')");
    const text = await evaluate("document.body.innerText");
    check("账号安全页显示已绑定的邮箱", text.includes(EMAIL), EMAIL);
    check("有「更换」按钮", await evaluate(
      `[...document.querySelectorAll('button, .sec-btn, span')].some(e => (e.textContent||'').trim() === '更换')`));
    check("有「解绑」按钮", await evaluate(
      `[...document.querySelectorAll('button, .sec-btn, span')].some(e => (e.textContent||'').trim() === '解绑')`));
    await shot("reg-account-both.png");

    // ------------------------------------------------------------------
    console.log("[6] 解绑：必须验当前密码");
    await evaluate(
      `[...document.querySelectorAll('button, .sec-btn, span')].find(e => (e.textContent||'').trim() === '解绑')?.click()`);
    check("解绑面板出现「当前密码」输入框",
      await until("!!document.querySelector('.bind-dialog input[type=password]')", 8000));
    check("解绑面板不要验证码（只验密码）",
      !(await evaluate("!!document.querySelector('.bind-dialog .bind-input--code')")));

    await evaluate(`(() => {
      const pwd = document.querySelector('.bind-dialog input[type=password]');
      pwd.value = 'DefinitelyWrong1';
      pwd.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.bind-dialog .bind-submit').click();
      return true;
    })()`);
    check("错密码被拦下且提示是密码问题",
      await until("(document.querySelector('.bind-error')?.textContent||'').includes('密码')", 12000),
      await evaluate("document.querySelector('.bind-error')?.textContent"));
    await shot("reg-unbind-wrong-pwd.png");

    await evaluate(`(() => {
      const pwd = document.querySelector('.bind-dialog input[type=password]');
      pwd.value = ${JSON.stringify(PWD)};
      pwd.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.bind-dialog .bind-submit').click();
      return true;
    })()`);
    check("密码对 → 邮箱行变回「未绑定」",
      await until("document.querySelector('.email-text')?.textContent.trim() === '未绑定'", 12000),
      await evaluate("document.querySelector('.email-text')?.textContent.trim()"));
    check("按钮变回「去绑定」",
      await evaluate("document.querySelector('.sec-row--email .sec-btn')?.textContent.trim()") === "去绑定",
      await evaluate("document.querySelector('.sec-row--email .sec-btn')?.textContent.trim()"));
    await shot("reg-unbind-done.png");

    const after = sql(
      `SELECT IFNULL(email,'NULL'), email_verified, primary_role FROM user WHERE id = ${createdId}`);
    const a = String(after).split("\t");
    check("库里邮箱已清空、验证位归零", a[0] === "NULL" && a[1] === "0", String(after));
    check("解绑不降级（primary_role 仍是 member）", a[2] === "member", a[2]);

    // ------------------------------------------------------------------
    console.log("[7] 解绑后账号照常使用");
    await nav(`${BASE}/space/home`);
    check("发布框还在（权限没被回收）",
      await until("!!document.querySelector('.publishing')", 12000));
    check("没有掉成游客的「绑定邮箱」提示",
      !(await evaluate("!!document.querySelector('.muted-notice--verify')")));

    // ------------------------------------------------------------------
    console.log("[8] 手机宽度不溢出（账号安全页）");
    await nav(`${BASE}/space/security`);
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await sleep(700);
    const overflow = await evaluate(
      "document.documentElement.scrollWidth - document.documentElement.clientWidth");
    check("390 宽下没有横向溢出", overflow <= 1, `overflow=${overflow}`);
    await shot("reg-mobile.png");
  } catch (e) {
    check("脚本执行未抛错", false, String((e && e.message) || e));
  } finally {
    if (createdId) {
      sql(`DELETE FROM user_role WHERE user_id = ${createdId}`);
      sql(`DELETE FROM user WHERE id = ${createdId}`);
    }
    proc.kill();
  }

  console.log();
  console.log(`通过 ${PASS.length} / ${PASS.length + FAIL.length}`);
  if (FAIL.length) {
    console.log("失败项：");
    for (const n of FAIL) console.log("  - " + n);
  }
  // 必须显式退出：WebSocket / Edge 的句柄挂着时 node 不会自己结束，
  // 前台跑会一直挂到超时，管道里的输出也跟着丢
  process.exit(FAIL.length ? 1 : 0);
})();
