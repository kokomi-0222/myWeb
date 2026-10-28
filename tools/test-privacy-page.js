// 隐私政策页 + 首页页脚 验收
//   [1] /privacy 免登录直达：标题、十个章节、备案号、联系方式、生效日期
//   [2] 首页页脚：备案号（可点回工信部）、隐私政策、联系我们
//   [3] 390 宽：不横向溢出、正文字号可读、页脚不挤成竖排
//   [4] 深色主题：底色转暗、正文仍是浅色（不是白底黑字硬撑）
//   [5] 注册弹窗：关掉再打开，勾选框回到未勾选（同意不跨会话保留）
// 用法：node tools/test-privacy-page.js（需 18080 后端 + 5194 预览）
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9472;
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

// 联系邮箱从 config/site.js 读，别在断言里写死 —— 换个邮箱不该让测试挂掉
const SITE_SRC = fs.readFileSync(
  path.join(ROOT, "vue/src/config/site.js"), "utf-8");
const pickQuoted = (key) => {
  const after = (SITE_SRC.split(key + ":")[1] || "").trim();
  const m = after.match(/^["']([^"']+)["']/);
  return m ? m[1] : "";
};
const CONTACT = pickQuoted("contactEmail");
const ICP = pickQuoted("icp");

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
      "--window-size=1200,1000",
      `--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-privacy-${process.pid}`,
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
      try { if (await evaluate(expr)) return true; } catch { /* 导航中 */ }
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
    await sleep(700);
  };
  const text = (sel) =>
    evaluate(`(document.querySelector(${JSON.stringify(sel)})?.textContent || '').trim()`);

  try {
    // ------------------------------------------------------------------
    console.log("[1] /privacy 免登录直达");
    await nav(BASE + "/privacy");
    check("未登录也能停在 /privacy（没被守卫踢回首页）",
      (await evaluate("location.pathname")) === "/privacy",
      await evaluate("location.pathname"));
    check("标题是「隐私政策」",
      (await text(".privacy-title")) === "隐私政策", await text(".privacy-title"));

    const secs = await evaluate(`[...document.querySelectorAll('.privacy-sec h2')].map(h => h.textContent.trim())`);
    check("十个章节都在", secs.length === 10, JSON.stringify(secs));
    check("第一章讲收集哪些信息", (secs[0] || "").includes("收集"), secs[0]);
    check("有一章讲第三方/谁会看到", (secs[2] || "").includes("接触"), secs[2]);
    check("有一章讲注销/你的权利", (secs[6] || "").includes("权利"), secs[6]);

    const body = await text(".privacy-card");
    check("写明备案号", !!ICP && body.includes(ICP), ICP);
    check("写明联系邮箱", !!CONTACT && body.includes(CONTACT), CONTACT);
    check("写明生效日期", body.includes("2026 年 10 月 28 日"));
    check("写明注销走人工邮件（不是假装有自助入口）",
      body.includes("注销账号") && body.includes("7 个工作日"));
    check("如实披露阿里云邮件推送", body.includes("DirectMail") || body.includes("邮件推送"));
    check("如实披露 Google Fonts 字体请求", body.includes("Google Fonts"));
    check("有两个以上返回首页的入口",
      (await evaluate(`[...document.querySelectorAll('.privacy-page a')].filter(a => a.getAttribute('href') === '/').length`)) >= 2);
    await shot("privacy-desktop.png");

    // ------------------------------------------------------------------
    console.log("[2] 首页页脚");
    await nav(BASE + "/");
    await until("!!document.querySelector('.kokomi-footer')");
    const foot = await text(".kokomi-footer");
    check("页脚显示网站备案号", foot.includes("赣ICP备2025059521号-1"), foot);
    const links = await evaluate(`(() => {
      const f = document.querySelector('.kokomi-footer');
      const out = [...f.querySelectorAll('a')].map(a => ({
        href: a.getAttribute('href'), text: a.textContent.trim(), target: a.getAttribute('target'),
      }));
      return { out, height: Math.round(f.getBoundingClientRect().height) };
    })()`);
    check("备案号链到工信部系统且新开窗口",
      links.out.some(l => l.href === "https://beian.miit.gov.cn/" && l.target === "_blank"),
      JSON.stringify(links.out));
    check("页脚有隐私政策入口", links.out.some(l => l.href === "/privacy"), JSON.stringify(links.out));
    check("页脚有 mailto 联系方式",
      links.out.some(l => (l.href || "").startsWith("mailto:" + CONTACT)));
    check("页脚不再是空占位（高度够放内容）", links.height >= 30, links.height + "px");
    await shot("home-footer.png");

    // 点页脚里的隐私政策能真的跳过去
    await evaluate(`document.querySelector('.kokomi-footer a[href="/privacy"]').click()`);
    check("点页脚「隐私政策」能跳转",
      await until(`location.pathname === '/privacy' && !!document.querySelector('.privacy-title')`));

    // ------------------------------------------------------------------
    console.log("[3] 390 宽");
    await nav(BASE + "/privacy");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: false,
    });
    await sleep(600);
    const narrow = await evaluate(`(() => {
      const de = document.documentElement;
      const card = document.querySelector('.privacy-card');
      const li = document.querySelector('.privacy-sec li');
      const r = card.getBoundingClientRect();
      return {
        overflowX: de.scrollWidth - de.clientWidth,
        cardW: Math.round(r.width),
        left: Math.round(r.left),
        right: Math.round(r.right),
        fontSize: parseFloat(getComputedStyle(li).fontSize),
        lineHeight: getComputedStyle(li).lineHeight,
      };
    })()`);
    check("390 宽无横向溢出", narrow.overflowX <= 0, String(narrow.overflowX));
    check("卡片左右都留了边距（没贴屏幕）",
      narrow.left >= 8 && narrow.right <= 390 - 8, `${narrow.left}~${narrow.right}`);
    check("正文不小于 13px（手机上能读）", narrow.fontSize >= 13, narrow.fontSize + "px");

    await nav(BASE + "/");
    await sleep(500);
    const footNarrow = await evaluate(`(() => {
      const f = document.querySelector('.kokomi-footer');
      const r = f.getBoundingClientRect();
      const groups = [...f.querySelectorAll('.kokomi-footer__meta, .kokomi-footer__links')];
      const rows = new Set(groups.map(e => Math.round(e.getBoundingClientRect().top)));
      return {
        h: Math.round(r.height),
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        rows: rows.size,
        tops: groups.map(e => Math.round(e.getBoundingClientRect().top)),
      };
    })()`);
    check("390 宽首页页脚不横向溢出", footNarrow.overflowX <= 0, String(footNarrow.overflowX));
    check("页脚在手机上分成「版权+备案」「链接」两行",
      footNarrow.rows === 2, JSON.stringify(footNarrow.tops));
    check("页脚高度没失控（两行 + 上下留白，不会撑出第三行）",
      footNarrow.h <= 100, footNarrow.h + "px");
    await shot("home-footer-mobile.png");

    // ------------------------------------------------------------------
    console.log("[4] 深色主题");
    await nav(BASE + "/privacy");
    await evaluate(`localStorage.setItem('kokomi-theme','dark')`);
    await nav(BASE + "/privacy");
    check("html 挂上了 dark 类",
      await until("document.documentElement.classList.contains('dark')", 5000));
    const dark = await evaluate(`(() => {
      const parse = (c) => (c.match(/\\d+/g) || []).slice(0, 3).map(Number);
      const lum = (rgb) => (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
      const card = document.querySelector('.privacy-card');
      const li = document.querySelector('.privacy-sec li');
      const page = document.querySelector('.privacy-page');
      return {
        cardBg: getComputedStyle(card).backgroundColor,
        pageBg: getComputedStyle(page).backgroundColor,
        text: getComputedStyle(li).color,
        cardLum: lum(parse(getComputedStyle(card).backgroundColor)),
        textLum: lum(parse(getComputedStyle(li).color)),
      };
    })()`);
    check("深色下卡片是暗底（不是白卡片）", dark.cardLum < 0.25, dark.cardBg);
    check("深色下正文是浅字", dark.textLum > 0.6, dark.text);
    check("深色下正文与底色有足够反差", dark.textLum - dark.cardLum > 0.5,
      `${dark.textLum.toFixed(2)} vs ${dark.cardLum.toFixed(2)}`);
    await shot("privacy-dark.png");
    await evaluate(`localStorage.removeItem('kokomi-theme')`);

    // ------------------------------------------------------------------
    console.log("[5] 注册弹窗：同意不跨会话保留");
    await nav(BASE + "/");
    await until("!!document.querySelector('.login-button')");
    await evaluate("document.querySelector('.login-button').click()");
    await until("!!document.querySelector('.modal-container')");
    await evaluate(`[...document.querySelectorAll('.link-text')].find(e => e.textContent.includes('立即注册')).click()`);
    await until("document.querySelector('.form-title')?.textContent.includes('创建账号')");
    check("注册第 1 步能看到勾选框", !!(await evaluate("!!document.querySelector('.agree-box')")));
    check("默认未勾选", (await evaluate("document.querySelector('.agree-box').checked")) === false);
    await evaluate("document.querySelector('.agree-box').click()");
    check("可以勾上", (await evaluate("document.querySelector('.agree-box').checked")) === true);
    // 关掉弹窗再打开
    await evaluate("document.querySelector('.modal-close').click()");
    await until("!document.querySelector('.modal-container')");
    await evaluate("document.querySelector('.login-button').click()");
    await until("!!document.querySelector('.modal-container')");
    await evaluate(`[...document.querySelectorAll('.link-text')].find(e => e.textContent.includes('立即注册')).click()`);
    await until("document.querySelector('.form-title')?.textContent.includes('创建账号')");
    check("关掉重开后回到未勾选（不把上次的同意带过来）",
      (await evaluate("document.querySelector('.agree-box').checked")) === false);
    // 弹窗有 0.2s 淡入，立刻截图会拍到半透明的中间态
    await sleep(700);
    await shot("reg-agree-default.png");
  } catch (e) {
    check("脚本执行未抛异常", false, e.message);
  }

  console.log(`\n合计 ${PASS.length} 通过 / ${FAIL.length} 失败`);
  if (FAIL.length) console.log("失败项：\n - " + FAIL.join("\n - "));
  try { proc.kill(); } catch { /* ignore */ }
  await sleep(300);
  process.exit(FAIL.length ? 1 : 0);
})();
