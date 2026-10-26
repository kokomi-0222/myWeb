// 后台 / 移动端的三处界面问题修复验收（真实浏览器 + 真实后端）
//   [1] 后台用户管理：点「禁言」→ 确定 → 弹的是站内弹窗（不是浏览器原生 confirm）
//   [2] 举报处理：类型下拉框 / 时长下拉框 / 列表行按钮 三者尺寸圆角一致
//   [3] 举报详情里「永久封号」的二次确认也是站内弹窗，并且盖在详情弹窗之上
//   [4] 移动端 390 宽：禁言提示卡文案不挤、按钮换行、无横向溢出
// 用法：node tools/test-ui-polish.js（需 18080 后端 + 5194 预览）
const { spawn, spawnSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9417;
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

function refreshTokens() {
  const r = spawnSync("python", ["refresh_tokens.py"], { cwd: __dirname, encoding: "utf-8" });
  if (r.status !== 0) {
    throw new Error("refresh_tokens.py 失败: " + (r.stderr || r.stdout));
  }
  return JSON.parse(fs.readFileSync(path.join(OUT, "tmp", "tokens.json"), "utf-8"));
}

/** 直接改库：密码同 tools/_local.py，环境变量优先，其次 gitignored 的 yaml */
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
const TITLE = "界面验收：确认框与下拉框";
const REASON = "界面验收-刷屏广告，提醒过两次仍然照发不误";
const VIEW = { w: 1000, h: 1100 };

let postId = null;
let tokens = null;

(async () => {
  tokens = refreshTokens();
  console.log("  token 已刷新");

  // 造一条待处理举报：admin 发帖 → 成员举报
  const created = await api("POST", "/post/createPost",
    { title: TITLE, content: "这条帖子用来验收后台举报页的控件样式", type: "tech" },
    tokens.admin);
  postId = created?.data?.id;
  check("准备：管理员帖子已创建", !!postId, `id=${postId}`);

  const rep = await api("POST", "/report",
    { targetType: "post", targetId: postId, reasonCode: "spam", detail: "验收用" },
    tokens.member);
  check("准备：成员举报成功", rep.code === 200, rep.msg || "");

  const proc = spawn(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-proxy-server",
      `--remote-debugging-port=${DBG_PORT}`,
      `--window-size=${VIEW.w},${VIEW.h}`,
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-polish",
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
  // 出现原生对话框就记一笔并自动关掉，否则页面会一直卡着
  const nativeDialogs = [];
  const send = (method, params = {}) =>
    new Promise((r) => {
      const id = ++seq;
      pending.set(id, r);
      ws.send(JSON.stringify({ id, method, params }));
    });
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === "Page.javascriptDialogOpening") {
      nativeDialogs.push(m.params.message);
      send("Page.handleJavaScriptDialog", { accept: false });
    }
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
    // ---------------------------------------------------------- 1 用户管理：处罚确认
    console.log("\n[1] 后台用户管理：点「确定」弹站内弹窗");
    await nav(BASE + "/");
    await evaluate(`localStorage.removeItem('kokomi-theme')`);
    await loginAs(tokens.admin);
    await nav(BASE + "/admin/users");
    await until(`document.querySelectorAll('.user-row').length > 0`, 15000);

    const clicked = await evaluate(`(() => {
      const rows = [...document.querySelectorAll('.user-row')];
      const row = rows.find(r => [...r.querySelectorAll('.user-row__meta')]
        .some(s => s.textContent.trim() === '#${MEMBER_ID}'));
      if (!row) return false;
      const btn = [...row.querySelectorAll('.user-row__style-btn')]
        .find(b => b.innerText.trim() === '禁言');
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    check("点开了「禁言」处罚面板", clicked);
    check("处罚面板已出现", await until(`!!document.querySelector('.punish-panel')`, 6000));

    await evaluate(`(() => {
      const f = document.querySelector('.punish-panel .style-panel__foot');
      [...f.querySelectorAll('button')].find(b => b.innerText.trim() === '确定')?.click();
    })()`);

    const boxUp = await until(`!!document.querySelector('.el-overlay.is-message-box')`, 6000);
    check("确认框用的是站内弹窗（.el-message-box）", boxUp);
    check("没有弹出浏览器原生 confirm", nativeDialogs.length === 0, nativeDialogs.join(" | "));

    if (boxUp) {
      const box = await evaluate(`(() => {
        const ov = document.querySelector('.el-overlay.is-message-box');
        const mb = document.querySelector('.el-message-box');
        const cs = getComputedStyle(ov);
        return {
          z: cs.zIndex,
          pos: cs.position,
          radius: getComputedStyle(mb).borderRadius,
          title: document.querySelector('.el-message-box__title')?.innerText || '',
          content: document.querySelector('.el-message-box__message')?.innerText || '',
          confirmText: document.querySelector('.el-message-box__btns .el-button--primary')?.innerText || '',
        };
      })()`);
      check("弹窗标题是「确认禁言」", box.title.includes("确认禁言"), box.title);
      check("文案说清了后果（仍能登录 / 发不了）",
        box.content.includes("仍能登录") && box.content.includes("发不了"), box.content);
      check("确认键写的是动作名「禁言」", box.confirmText.trim() === "禁言", box.confirmText);
      check("弹窗是 fixed 定位（不会掉到视口下）", box.pos === "fixed", box.pos);
      check("弹窗 z-index 高于后台面板（2000）", Number(box.z) >= 3000, box.z);
      check("圆角是站内规格 16px", box.radius.startsWith("16"), box.radius);
      await shot("polish-confirm-dialog.png");

      // 取消：不应该真的处罚
      await evaluate(`[...document.querySelectorAll('.el-message-box__btns button')]
        .find(b => !b.className.includes('el-button--primary'))?.click()`);
      await sleep(600);
      check("点取消后弹窗关闭",
        (await evaluate(`!document.querySelector('.el-overlay.is-message-box')`)) === true);
      check("取消后没有真的禁言",
        sql(`SELECT status FROM user WHERE id = ${MEMBER_ID}`) === "0",
        sql(`SELECT status FROM user WHERE id = ${MEMBER_ID}`));
      check("取消后处罚面板还在（没有误关）",
        (await evaluate(`!!document.querySelector('.punish-panel')`)) === true);
    }

    // ---------------------------------------------------------- 2 举报页控件风格
    console.log("\n[2] 举报处理页：下拉框和按钮同一套尺寸");
    await nav(BASE + "/admin/reports");
    await until(`!!document.querySelector('.select-trigger')`, 15000);

    // 类型下拉已改自绘（SelectBox）：原生 <select> 的展开列表是系统画的，改不了样式
    const style = await evaluate(`(() => {
      const sel = document.querySelector('.reports-toolbar .select-trigger');
      const btn = document.querySelector('.report-row__btn');
      const arrow = document.querySelector('.reports-toolbar .select-trigger__arrow');
      if (!sel || !btn) return null;
      const a = getComputedStyle(sel);
      const b = getComputedStyle(btn);
      return {
        native: document.querySelectorAll('.reports-toolbar select').length,
        sel: { h: a.height, r: a.borderRadius, bw: a.borderTopWidth },
        btn: { h: b.height, r: b.borderRadius, bw: b.borderTopWidth, bg: b.backgroundColor },
        arrow: !!arrow,
        // IconArrow 画的是「向左」的 chevron，转 -90° 才是向下。
        // rotate(90deg) 会变成朝上的 ∧ —— 这个坑实际踩过一次，所以锁住矩阵值。
        arrowMatrix: arrow ? getComputedStyle(arrow).transform : "",
      };
    })()`);
    check("类型下拉框已渲染", !!style);
    if (style) {
      check("工具栏已无原生 <select>", style.native === 0, `count=${style.native}`);
      check("下拉框与按钮同高", style.sel.h === style.btn.h, `${style.sel.h} vs ${style.btn.h}`);
      check("下拉框与按钮同圆角", style.sel.r === style.btn.r, `${style.sel.r} vs ${style.btn.r}`);
      check("自绘箭头存在", style.arrow);
      check("箭头朝下（-90° 而不是 90°）",
        style.arrowMatrix === "matrix(0, -1, 1, 0, 0, 0)", style.arrowMatrix);
      check("「处理」按钮是 1px 描边（不是浏览器默认的 2px 凸起）",
        style.sel.bw === style.btn.bw && style.btn.bw === "1px", style.btn.bw);
      check("「处理」按钮不再是系统灰底",
        style.btn.bg !== "buttonface" && style.btn.bg !== "rgba(0, 0, 0, 0)", style.btn.bg);
    }
    await shot("polish-reports-controls.png");

    // 暗色下最容易被系统画出白底的就是下拉，这里盯住触发框
    await evaluate(`localStorage.setItem('kokomi-theme', 'dark')`);
    await nav(BASE + "/admin/reports");
    await until(`!!document.querySelector('.select-trigger')`, 12000);
    const darkSel = await evaluate(`(() => {
      const s = getComputedStyle(document.querySelector('.reports-toolbar .select-trigger'));
      const b = getComputedStyle(document.querySelector('.report-row__btn'));
      return { bg: s.backgroundColor, color: s.color, btnBg: b.backgroundColor };
    })()`);
    const lum = (rgb) => {
      const [r, g, b] = (rgb.match(/\d+/g) || [0, 0, 0]).map(Number);
      return 0.299 * r + 0.587 * g + 0.114 * b;
    };
    check("暗色下下拉框是深色底", lum(darkSel.bg) < 100, darkSel.bg);
    check("暗色下下拉框文字是浅色", lum(darkSel.color) > 120, darkSel.color);
    check("暗色下「处理」按钮也跟着变深", lum(darkSel.btnBg) < 100, darkSel.btnBg);
    await shot("polish-reports-dark.png");
    await evaluate(`localStorage.removeItem('kokomi-theme')`);

    // ---------------------------------------------------------- 3 详情里的永久处罚确认
    console.log("\n[3] 举报详情：永久处罚的二次确认");
    await evaluate(`document.querySelector('.report-row')?.click()`);
    check("详情弹窗打开", await until(`!!document.querySelector('.detail-card')`, 8000));
    // 详情是异步拉的：.detail-card 先出现，正文还在「加载中…」
    check("详情内容已加载", await until(`!!document.querySelector('#ban-toggle')`, 8000));

    // 勾上「处罚作者」，时长下拉才出现
    await evaluate(`document.querySelector('#ban-toggle')?.click()`);
    const smUp = await until(`!!document.querySelector('.detail-card .select-trigger')`, 5000);
    check("勾选处罚后出现时长下拉", smUp);
    const smH = await evaluate(
      `getComputedStyle(document.querySelector('.detail-card .select-trigger')).height`
    );
    check("时长下拉是 28px 小号规格", smH === "28px", smH);

    // 选「永久」（自绘面板的第 5 项），再点受理 → 应该弹站内确认
    await evaluate(`document.querySelector('.detail-card .select-trigger').click()`);
    await sleep(400);
    const picked = await evaluate(`(() => {
      const wrap = [...document.querySelectorAll('.global-dropdown-wrapper')].find(w => w.offsetHeight > 0);
      const li = wrap && wrap.querySelectorAll('.select-option')[4];
      if (!li) return false;
      li.click();
      return true;
    })()`);
    check("在自绘面板里选中「永久」", picked);
    await sleep(300);
    await evaluate(`[...document.querySelectorAll('.detail-foot button')]
      .find(b => b.innerText.trim() === '受理')?.click()`);

    const permUp = await until(`!!document.querySelector('.el-overlay.is-message-box')`, 6000);
    check("永久处罚的二次确认也是站内弹窗", permUp);
    if (permUp) {
      const info = await evaluate(`(() => {
        const ov = document.querySelector('.el-overlay.is-message-box');
        const mb = document.querySelector('.el-message-box');
        return {
          z: getComputedStyle(ov).zIndex,
          title: document.querySelector('.el-message-box__title')?.innerText || '',
          content: document.querySelector('.el-message-box__message')?.innerText || '',
          rectTop: Math.round(mb.getBoundingClientRect().top),
          danger: !!document.querySelector('.el-message-box.danger-confirm'),
        };
      })()`);
      check("标题是「永久封号」", info.title.includes("永久封号"), info.title);
      check("确认框盖在举报详情（z-index 3000）之上", Number(info.z) >= 3500, info.z);
      check("危险操作用了红色确认键", info.danger);
      check("弹窗在视口内", info.rectTop > 0 && info.rectTop < 1100, String(info.rectTop));
      await shot("polish-permanent-confirm.png");
      await evaluate(`[...document.querySelectorAll('.el-message-box__btns button')]
        .find(b => !b.className.includes('el-button--primary'))?.click()`);
      await sleep(500);
    }
    check("全程没有出现浏览器原生对话框", nativeDialogs.length === 0, nativeDialogs.join(" | "));

    // ---------------------------------------------------------- 4 移动端禁言提示卡
    console.log("\n[4] 移动端 390 宽：禁言提示卡");
    const muted = await api("POST", `/admin/user/${MEMBER_ID}/punish`,
      { level: 1, days: 7, reason: REASON }, tokens.admin);
    check("准备：成员被禁言", muted.code === 200, muted.msg || "");

    await loginAs(tokens.member);
    await nav(BASE + "/space/home");
    check("出现禁言提示卡", await until(`!!document.querySelector('.muted-notice')`, 12000));

    await shot("polish-muted-mobile.png", 390, 844);
    const m = await evaluate(`(() => {
      const card = document.querySelector('.muted-notice');
      const desc = document.querySelector('.muted-notice__desc');
      const hint = document.querySelector('.muted-notice__hint');
      const btn = document.querySelector('.muted-notice__refresh');
      const cs = getComputedStyle(desc);
      return {
        cardH: Math.round(card.getBoundingClientRect().height),
        descText: desc.innerText,
        descLines: Math.round(desc.getBoundingClientRect().height / parseFloat(cs.lineHeight)),
        hintShown: getComputedStyle(hint).display !== 'none',
        btnTop: Math.round(btn.getBoundingClientRect().top),
        descTop: Math.round(desc.getBoundingClientRect().top),
        page: document.documentElement.scrollWidth,
        view: window.innerWidth,
        cardW: Math.round(card.getBoundingClientRect().width),
        // 溢出时把最宽的那个元素也带出来，省得下次再猜
        widest: (() => {
          let worst = null;
          document.querySelectorAll('body *').forEach((el) => {
            const w = el.getBoundingClientRect().width;
            if (w > 400 && (!worst || w > worst.w)) {
              worst = { w: Math.round(w), cls: el.className && el.className.toString().slice(0, 40) };
            }
          });
          return worst;
        })(),
      };
    })()`);
    check("文案里没有「期间无法发布内容、评论和回复」那句长说明",
      !m.descText.includes("期间无法"), m.descText.slice(0, 40));
    check("副标题最多两行", m.descLines <= 2, `${m.descLines} 行 / ${m.cardH}px`);
    // 粗线条兜底：这条只是防「卡片又长回一大坨」（带补充说明行的旧版约 180px）。
    // 精确的行数控制交给上面那条「副标题最多两行」，别在这里卡 2px 的余量。
    check("卡片高度不超过 150px", m.cardH <= 150, m.cardH + "px");
    check("手机上隐藏了补充说明行", m.hintShown === false);
    check("「刷新状态」换到文字下方（不在同一行右侧）",
      m.btnTop > m.descTop, `btn ${m.btnTop} / desc ${m.descTop}`);
    // headless 在移动 emulation 下会把 window.innerWidth 报成缩放后的宽度（实测 712），
    // 不能直接和 390 比 —— 和 test-ban-ui.js 一样看「页面宽 ≤ 视口宽」且视口确实收窄了
    check("390 宽没有横向溢出", m.page <= m.view && m.view < 1000,
      `page=${m.page} view=${m.view} card=${m.cardW} 最宽=${JSON.stringify(m.widest)}`);

    // 桌面端仍保留完整的补充说明
    await shot("polish-muted-desktop.png", 1000, 900);
    const desk = await evaluate(`(() => {
      const hint = document.querySelector('.muted-notice__hint');
      const btn = document.querySelector('.muted-notice__refresh');
      const desc = document.querySelector('.muted-notice__desc');
      return {
        hintShown: getComputedStyle(hint).display !== 'none',
        sameRow: Math.abs(btn.getBoundingClientRect().top - desc.getBoundingClientRect().top) < 30,
      };
    })()`);
    check("桌面端显示补充说明行", desk.hintShown);
    check("桌面端按钮与文字在同一行", desk.sameRow);
  } finally {
    console.log("\n清理…");
    try {
      await api("POST", `/admin/user/${MEMBER_ID}/unban`, null, tokens.admin);
      sql(`UPDATE user SET status=0, ban_until=NULL, ban_reason=NULL WHERE id = ${MEMBER_ID}`);
      if (postId) {
        sql(`DELETE FROM report WHERE target_type='post' AND target_id=${postId}`);
      }
      console.log("  已解禁成员、删除验收数据");
    } catch (e) {
      console.log("  清理失败：" + e.message);
    }
    ws.close();
    proc.kill();
    await sleep(400);
    console.log(`\n${PASS.length} 通过 / ${FAIL.length} 失败`);
    if (FAIL.length) {
      console.log("失败项：\n  - " + FAIL.join("\n  - "));
      process.exitCode = 1;
    }
  }
})();
