// 处罚分级（禁言 / 封号）的界面验收（真实浏览器 + 真实后端）
//   [1] 正常账号：空间页有发布框
//   [2] 原地被禁言：不刷新页面，点发布被拒后界面自己切成提示卡（不掉线）
//   [3] 刷新后仍是禁言态：提示卡在、发布框消失、文案带期限和理由
//   [4] 详情页评论框换成只读提示
//   [5] 后台用户管理：显示「已禁言」、别人能禁言、自己不能
//   [6] 后台举报处理：处罚力度二选一（禁言 / 封号）
//   [7] 暗色 / 390 宽手机
//   [8] 提示卡上的「刷新状态」：到期后不用整页刷新就能恢复发布框
// 用法：node tools/test-ban-ui.js（需 18080 后端 + 5194 预览）
const { spawn, spawnSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9413;
const BASE = process.env.TEST_BASE || "http://localhost:5194";
const API = process.env.TEST_API || "http://localhost:18080";
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PASS = [];
const FAIL = [];

function check(name, ok, detail = "") {
  (ok ? PASS : FAIL).push(name);
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
}

/** 处罚会 +1 token_version，旧 token 立刻失效 → 每次都要重签 */
function refreshTokens() {
  const r = spawnSync("python", ["refresh_tokens.py"], { cwd: __dirname, encoding: "utf-8" });
  if (r.status !== 0) {
    throw new Error("refresh_tokens.py 失败: " + (r.stderr || r.stdout));
  }
  return JSON.parse(fs.readFileSync(path.join(OUT, "tmp", "tokens.json"), "utf-8"));
}

/**
 * 直接改库。用来造「处罚已经到期」这种纯时间场景 —— 接口没有这种参数，
 * 而等 7 天显然不现实。密码和 tools/_local.py 一样不写明文：
 * 先看环境变量，再读 gitignore 掉的 application-local.yaml。
 */
function sql(statement) {
  let pwd = process.env.DB_PASSWORD || "";
  if (!pwd) {
    const yml = path.join(ROOT, "springboot", "kokomi", "config", "application-local.yaml");
    const m = fs.readFileSync(yml, "utf-8").match(/^\s*password:\s*(\S+)\s*$/m);
    pwd = m ? m[1].replace(/^["']|["']$/g, "") : "";
  }
  const r = spawnSync("mysql", [
    "-uroot", "-p" + pwd, "--default-character-set=utf8mb4",
    "-N", "-B", "kokomi", "-e", statement,
  ], { encoding: "utf-8" });
  if (r.status !== 0) {
    throw new Error("mysql 失败: " + (r.stderr || r.stdout));
  }
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

const api = async (method, p, body, token) => {
  const r = await fetch(API + p, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
};

const MEMBER_ID = 9;
const ADMIN_ID = 1;
const TITLE = "禁言界面验收帖";
const REASON = "界面验收-刷屏广告";
const VIEW = { w: 1000, h: 1100 };

let postId = null;
let reportId = null;
let tokens = null;

(async () => {
  tokens = refreshTokens();
  console.log("  token 已刷新");

  // 先用成员身份建一条帖子：禁言之后他就发不出来了
  const created = await api("POST", "/post/createPost",
    { title: TITLE, content: "这条帖子用来验收禁言后的界面表现", type: "tech" },
    tokens.member);
  postId = created?.data?.id;
  check("准备：成员帖子已创建", !!postId, `id=${postId}`);

  const proc = spawn(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-proxy-server",
      `--remote-debugging-port=${DBG_PORT}`,
      `--window-size=${VIEW.w},${VIEW.h}`,
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-ban",
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
  const shot = async (name, w = VIEW.w, h = VIEW.h) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: w < 500,
    });
    await sleep(400);
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(s.result.data, "base64"));
    console.log("  截图 -> shots/" + name);
  };
  const nav = async (url) => {
    await send("Page.navigate", { url });
    await until(`document.readyState === 'complete'`, 15000);
    await sleep(700);
  };
  const loginAs = async (token) => {
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(token)})`);
  };

  try {
    // ---------------------------------------------------------- 1 基线
    console.log("\n[1] 正常账号的空间页");
    // 先落到站点上，否则 localStorage 在 about:blank 里访问会抛 SecurityError
    await nav(BASE + "/");
    await evaluate(`localStorage.removeItem('kokomi-theme')`);
    await loginAs(tokens.member);
    await nav(BASE + "/space/home");
    const hasEditor = await until(`!!document.querySelector('.publishing .input-content')`, 12000);
    check("正常账号能看到发布框", hasEditor);
    check("正常账号没有禁言提示", (await evaluate(`!document.querySelector('.muted-notice')`)) === true);

    // ---------------------------------------------------------- 2 原地被禁言
    console.log("\n[2] 不刷新页面：被禁言后点发布，界面自己切成提示卡");
    // 先填好内容——此刻前端还以为自己能发，这正是要验的状态
    // 发布框是原生 textarea，class 直接就是 input-content（不是容器）
    const filled = await evaluate(`(() => {
      const ta = document.querySelector('.publishing textarea.input-content');
      if (!ta) return false;
      ta.value = '这条在禁言后点发布，应该被拦下来';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    check("准备：发布框里填了内容", filled);

    const punished = await api("POST", `/admin/user/${MEMBER_ID}/punish`,
      { level: 1, days: 7, reason: REASON }, tokens.admin);
    check("后台禁言成功", punished.code === 200, punished.msg || "");

    // 页面没刷新、token 也没换（禁言不动 token_version），直接点发布
    await evaluate(`document.querySelector('.publishing .comment-submit-button')?.click()`);
    const autoSwitched = await until(`!!document.querySelector('.muted-notice')`, 12000);
    check("被拒后发布框自动换成提示卡（没有掉线）", autoSwitched);
    check("登录态还在",
      (await evaluate(`!!localStorage.getItem('token')`)) === true);
    await shot("ban-muted-auto.png");

    // ---------------------------------------------------------- 3 刷新后仍是禁言态
    console.log("\n[3] 重新进入空间页：仍然是禁言态");
    await nav(BASE + "/space/home");
    const noticeUp = await until(`!!document.querySelector('.muted-notice')`, 12000);
    check("出现禁言提示卡", noticeUp);
    check("发布框已经消失", (await evaluate(`!document.querySelector('.publishing')`)) === true);
    check("提示卡上有「刷新状态」按钮",
      (await evaluate(`!!document.querySelector('.muted-notice__refresh')`)) === true);

    const noticeText = await evaluate(
      `document.querySelector('.muted-notice')?.innerText || ''`
    );
    check("提示里有「禁言」两个字", noticeText.includes("禁言"), noticeText.slice(0, 60));
    check("提示里带了理由", noticeText.includes(REASON));
    check("提示里带了期限（解除时间或永久）",
      noticeText.includes("解除") || noticeText.includes("永久"));
    // 标题已经是「你已被禁言」，副标题不该再重复一遍
    const repeatCount = (noticeText.match(/你已被禁言/g) || []).length;
    check("卡片上「你已被禁言」只出现一次", repeatCount === 1, `出现 ${repeatCount} 次`);
    await shot("ban-muted-space.png");

    // ---------------------------------------------------------- 4 评论框
    console.log("\n[4] 详情页的评论框");
    await nav(`${BASE}/post/${postId}`);
    const tipUp = await until(`!!document.querySelector('.comment-muted-tip')`, 12000);
    check("评论框换成禁言提示", tipUp);
    check("评论输入框不再渲染", (await evaluate(`!document.querySelector('.comment-input textarea')`)) === true);
    const tipText = await evaluate(
      `document.querySelector('.comment-muted-tip')?.innerText || ''`
    );
    check("评论提示里也有理由", tipText.includes(REASON), tipText.slice(0, 60));
    await shot("ban-muted-comment.png");

    // ---------------------------------------------------------- 4 后台用户管理
    console.log("\n[5] 后台用户管理页");
    await loginAs(tokens.admin);
    await nav(BASE + "/admin/users");
    await until(`document.querySelectorAll('.user-row').length > 1`, 12000);

    const memberRow = await evaluate(`(() => {
      const rows = [...document.querySelectorAll('.user-row')];
      const row = rows.find(r => [...r.querySelectorAll('.user-row__meta')]
        .some(s => s.textContent.trim() === '#${MEMBER_ID}'));
      if (!row) return null;
      const chip = row.querySelector('.ban-chip');
      return {
        chip: chip ? chip.innerText.trim() : '',
        chipMute: chip ? chip.classList.contains('ban-chip--mute') : false,
        buttons: [...row.querySelectorAll('.user-row__style-btn')].map(b => b.innerText.trim()),
      };
    })()`);
    check("成员那一行有处罚标签", !!memberRow?.chip, JSON.stringify(memberRow));
    check("标签写的是「已禁言」", (memberRow?.chip || "").includes("已禁言"), memberRow?.chip);
    check("禁言标签用琥珀色（和封号的红色区分）", memberRow?.chipMute === true);
    check("被禁言的行只剩「解除」", (memberRow?.buttons || []).includes("解除"), JSON.stringify(memberRow?.buttons));
    check("被禁言的行不再显示「封号」按钮", !(memberRow?.buttons || []).includes("封号"));

    const adminRow = await evaluate(`(() => {
      const rows = [...document.querySelectorAll('.user-row')];
      const row = rows.find(r => [...r.querySelectorAll('.user-row__meta')]
        .some(s => s.textContent.trim() === '#${ADMIN_ID}'));
      if (!row) return null;
      const btns = [...row.querySelectorAll('.user-row__style-btn')];
      return btns.map(b => ({ text: b.innerText.trim(), disabled: b.disabled }));
    })()`);
    const selfBan = (adminRow || []).find((b) => b.text === "封号");
    check("自己的封号按钮是禁用的", selfBan?.disabled === true, JSON.stringify(adminRow));
    await shot("ban-admin-users.png");

    // 打开处罚面板，确认能选力度和时长
    // 挑第一个「还能处罚」的人：被禁言的没有按钮，管理员的是 disabled
    const pickedName = await evaluate(`(() => {
      const rows = [...document.querySelectorAll('.user-row')];
      for (const row of rows) {
        const btn = [...row.querySelectorAll('.user-row__style-btn')]
          .find(b => b.innerText.trim() === '禁言' && !b.disabled);
        if (btn) {
          btn.click();
          return row.querySelector('.user-row__name')?.innerText.trim() || 'unknown';
        }
      }
      return '';
    })()`);
    const panelUp = await until(`!!document.querySelector('.punish-panel')`, 5000);
    check("点「禁言」弹出处罚面板", panelUp, pickedName);
    if (panelUp) {
      const levels = await evaluate(
        `[...document.querySelectorAll('.punish-panel .punish-level__name')].map(e => e.innerText.trim())`
      );
      check("面板里有禁言 / 封号两种力度", JSON.stringify(levels) === '["禁言","封号"]', JSON.stringify(levels));
      const days = await evaluate(
        `[...document.querySelectorAll('.punish-panel .punish-days__item')].map(e => e.innerText.trim())`
      );
      check("面板里有 5 档时长", (days || []).length === 5, JSON.stringify(days));
      await shot("ban-punish-panel.png");
      await evaluate(`document.querySelector('.punish-panel .style-ghost')?.click()`);
      await sleep(300);
    }

    // ---------------------------------------------------------- 5 举报处理
    console.log("\n[6] 举报处理里的处罚力度");
    const rep = await api("POST", "/report",
      { targetType: "post", targetId: postId, reasonCode: "spam" }, tokens.admin);
    reportId = rep?.data;
    check("准备：举报帖子成功", !!reportId, JSON.stringify(rep?.msg || ""));

    await nav(BASE + "/admin/reports");
    await until(`document.querySelectorAll('.report-list li').length > 0`, 12000);
    await evaluate(`document.querySelector('.report-list li')?.click()`);
    const detailUp = await until(`!!document.querySelector('.detail-block--handle')`, 8000);
    check("举报详情打开", detailUp);

    await evaluate(`(() => {
      const cb = document.querySelector('#ban-toggle');
      if (cb && !cb.checked) cb.click();
    })()`);
    const levelsUp = await until(`document.querySelectorAll('.punish-level__item').length === 2`, 5000);
    check("勾选处罚后出现力度二选一", levelsUp);
    const levelNames = await evaluate(
      `[...document.querySelectorAll('.punish-level__item .punish-level__name')].map(e => e.innerText.trim())`
    );
    check("两个选项是禁言 / 封号", JSON.stringify(levelNames) === '["禁言","封号"]', JSON.stringify(levelNames));
    const defaultOn = await evaluate(
      `document.querySelector('.punish-level__item.is-on .punish-level__name')?.innerText.trim()`
    );
    check("默认选中封号（和旧行为一致）", defaultOn === "封号", defaultOn);
    await shot("ban-report-punish.png");

    // ---------------------------------------------------------- 6 暗色 + 手机
    console.log("\n[7] 暗色与手机宽度");
    await loginAs(tokens.member);
    await nav(BASE + "/space/home");
    await evaluate(`localStorage.setItem('kokomi-theme', 'dark')`);
    await nav(BASE + "/space/home");
    await until(`!!document.querySelector('.muted-notice')`, 12000);
    const dark = await evaluate(`(() => {
      const el = document.querySelector('.muted-notice__desc');
      if (!el) return null;
      const s = getComputedStyle(el);
      return { color: s.color, bg: getComputedStyle(document.querySelector('.muted-notice')).backgroundColor };
    })()`);
    check("暗色下提示文字不是黑色", dark && !/rgb\(0, 0, 0\)/.test(dark.color), JSON.stringify(dark));
    await shot("ban-muted-dark.png");

    await shot("ban-muted-mobile.png", 390, 844);
    // 无 viewport meta 时 headless 会按缩放后的宽度算 innerWidth（实测 712），
    // 所以不能直接和 390 比，只能看「页面宽度 ≤ 视口宽度」且视口确实已经收窄
    const overflow = await evaluate(
      `({ page: document.documentElement.scrollWidth, view: window.innerWidth })`
    );
    check("390 宽没有横向溢出",
      overflow.page <= overflow.view && overflow.view < 1000, JSON.stringify(overflow));

    // ---------------------------------------------------------- 7 刷新状态
    console.log("\n[8] 提示卡上的「刷新状态」");
    // 手机视口还原成桌面，否则下面读 DOM 会受 mobile 缩放影响
    await send("Emulation.setDeviceMetricsOverride", {
      width: VIEW.w, height: VIEW.h, deviceScaleFactor: 1, mobile: false,
    });
    await sleep(300);
    await evaluate(`localStorage.removeItem('kokomi-theme')`);
    await nav(BASE + "/space/home");
    const stillMuted = await until(`!!document.querySelector('.muted-notice')`, 12000);
    check("准备：仍是禁言状态", stillMuted);

    // 还在处罚期点一下：卡片应该留着，不能假装已经恢复
    await evaluate(`document.querySelector('.muted-notice__refresh')?.click()`);
    await sleep(1200);
    check("没到期时点刷新，提示卡还在",
      (await evaluate(`!!document.querySelector('.muted-notice')`)) === true);

    // 把解除时间改到一分钟前 = 模拟「7 天过去了」
    sql(`UPDATE user SET ban_until = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ${MEMBER_ID}`);
    await evaluate(`document.querySelector('.muted-notice__refresh')?.click()`);
    const backToEditor = await until(`!!document.querySelector('.publishing .input-content')`, 10000);
    check("到期后点刷新，发布框自己回来了", backToEditor);
    check("提示卡已经消失",
      (await evaluate(`!document.querySelector('.muted-notice')`)) === true);
    // findById 里会顺手把过期处罚清掉，所以库里也该是 0
    check("库里 status 也清回 0",
      sql(`SELECT status FROM user WHERE id = ${MEMBER_ID}`) === "0");
    await shot("ban-muted-refreshed.png");

  } finally {
    // 收尾：一定要解禁，否则后面的测试会莫名其妙发不出帖
    try {
      await api("POST", `/admin/user/${MEMBER_ID}/unban`, null, tokens.admin);
    } catch {
      /* token 可能已经失效，下面用库里的状态兜底 */
    }
    const state = await api("GET", "/admin/users?pageNum=1&pageSize=50", null, tokens.admin);
    const me = (state?.data?.list || []).find((u) => u.id === MEMBER_ID);
    if (me && me.status !== 0) {
      // 上面那次可能因为 token 过期没成功，换新 token 再解一次
      tokens = refreshTokens();
      await api("POST", `/admin/user/${MEMBER_ID}/unban`, null, tokens.admin);
    }
    if (postId) await api("DELETE", `/post/${postId}`, null, tokens.admin);
    console.log("\n  已解禁并清理临时帖");
    try {
      proc.kill();
    } catch {
      /* 已退出 */
    }
  }

  console.log(`\n===== ${PASS.length} 通过 / ${FAIL.length} 失败 =====`);
  if (FAIL.length) {
    FAIL.forEach((n) => console.log("  ✗ " + n));
    process.exit(1);
  }
})();
