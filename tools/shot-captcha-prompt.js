// 发验证码前的人机校验（CaptchaPrompt）视觉验收：注册页 / 找回密码 / 手机宽度。
// 用法：node tools/shot-captcha-prompt.js（需 18080 后端 + 5194 预览，后端开 app.captcha.dev-echo）
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9480;
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
  const proc = spawn(
    EDGE,
    [
      "--headless=new", "--disable-gpu", "--no-sandbox", "--no-proxy-server",
      `--remote-debugging-port=${DBG_PORT}`,
      "--window-size=1200,900",
      `--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-captcha-prompt-${process.pid}`,
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

  const setViewport = (width, height) =>
    send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: false,
    });

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) {
      throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || "eval error"));
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

  /** 打开注册第 1 步并点一次「发送验证码」，返回人机校验是否展开 */
  const openRegisterCaptcha = async () => {
    await nav(BASE);
    await until("!!document.querySelector('.login-button')");
    await evaluate("document.querySelector('.login-button').click()");
    await until("!!document.querySelector('.modal-container')");
    await clickText(".link-text", "立即注册");
    await until("document.querySelector('.form-title')?.textContent.includes('创建账号')");
    const mail = `cap_shot_${Date.now()}@example.com`;
    await fillByLabel([["邮箱", mail]]);
    await evaluate("document.querySelector('.modal-container .agree-box').click()");
    await evaluate("document.querySelector('.modal-container .reset-send').click()");
    return until("!!document.querySelector('.modal-container .cp')", 8000);
  };

  try {
    console.log("[1] 注册第 1 步：点「发送验证码」展开人机校验");
    check("人机校验展开", await openRegisterCaptcha());
    check("图片已加载", await until("!!document.querySelector('.cp-img img')", 8000));
    // 弹窗是透明度过渡淡入的，until() 只保证元素进了 DOM，
    // 立刻截图会截到半透明的中间态（整张图发白、内容看不清）
    await sleep(700);
    await shot("captcha-register.png");

    // 量一下几何：下划线输入框、图、按钮的底边要落在同一条线上，
    // 否则看着就是「线悬在图片下面」那种错位（之前踩过）
    const geo = await evaluate(`(() => {
      const box = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { top: Math.round(b.top), bottom: Math.round(b.bottom),
                 left: Math.round(b.left), right: Math.round(b.right), h: Math.round(b.height) };
      };
      return {
        field: box('.cp-field'),
        img: box('.cp-img'),
        ok: box('.cp-ok'),
        mail: box('.modal-container .input-line-wrapper'),
      };
    })()`);
    console.log("  几何：" + JSON.stringify(geo));
    check("输入框 / 图 / 确定按钮底边同线",
      !!geo?.field && !!geo?.img && !!geo?.ok &&
      Math.abs(geo.field.bottom - geo.img.bottom) <= 1 &&
      Math.abs(geo.field.bottom - geo.ok.bottom) <= 1,
      JSON.stringify(geo));

    console.log("[2] 输错一次：红字落在人机校验块里，图自动换一张");
    const before = await evaluate("document.querySelector('.cp-img img')?.src || ''");
    await evaluate(`(() => {
      const el = document.querySelector('.cp .cp-input');
      el.value = 'zzzz';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(200);
    await evaluate("document.querySelector('.cp .cp-ok')?.click()");
    check("错误提示出现在人机校验块内",
      await until("document.querySelector('.cp-err')?.textContent.includes('图形验证码')", 10000));
    await sleep(800);
    const after = await evaluate("document.querySelector('.cp-img img')?.src || ''");
    check("图已换成新的一张", !!before && !!after && before !== after);
    await shot("captcha-register-error.png");

    console.log("[3] 手机 390 宽：不溢出，按钮不占满整行");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: false,
    });
    await sleep(600);
    const overflow = await evaluate(
      "document.documentElement.scrollWidth - document.documentElement.clientWidth");
    check("390 宽无横向溢出", overflow <= 1, `overflow=${overflow}`);
    const okBox = await evaluate(`(() => {
      const el = document.querySelector('.cp .cp-ok');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    })()`);
    check("「确定」按钮尺寸正常", !!okBox && okBox.w > 40 && okBox.h >= 36, JSON.stringify(okBox));
    await shot("captcha-mobile.png");
    await send("Emulation.clearDeviceMetricsOverride");

    console.log("[4] 暗色主题：下划线 / 图片 / 按钮都不能被吃掉");
    await evaluate("localStorage.setItem('kokomi-theme', 'dark')");
    const darkOpen = await openRegisterCaptcha();
    check("暗色下人机校验仍能展开", darkOpen);
    check("暗色已生效",
      await evaluate("document.documentElement.classList.contains('dark')"));
    await sleep(700);
    await shot("captcha-dark.png");
  } catch (e) {
    check("脚本执行未抛错", false, String((e && e.message) || e));
  } finally {
    try { ws.close(); } catch { /* 已关 */ }
    proc.kill();
  }

  console.log();
  console.log(`通过 ${PASS.length} / ${PASS.length + FAIL.length}`);
  if (FAIL.length) {
    console.log("失败项：");
    for (const n of FAIL) console.log("  - " + n);
  }
  process.exit(FAIL.length ? 1 : 0);
})();
