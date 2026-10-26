// 举报功能的界面验收（真实浏览器 + 真实后端 + 真实预览服务）
//   [1] 帖子「更多」菜单里出现「举报」（旧版因为权限码不存在，这一项永远不显示）
//   [2] 弹窗：6 个理由、未选理由不能提交、能提交成功、提交后菜单变「已举报」
//   [3] 评论举报入口、用户主页举报入口
//   [4] 后台举报列表 + 详情 + 受理并删除内容
//   [5] 暗色 / 390 宽手机
// 用法：node tools/test-report-ui.js（需 18080 后端 + 5194 预览）
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9411;
const BASE = process.env.TEST_BASE || "http://localhost:5194";
const API = process.env.TEST_API || "http://localhost:18080";
const OUT = path.resolve(__dirname, "../shots");
const TOKENS = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../shots/tmp/tokens.json"), "utf-8")
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PASS = [];
const FAIL = [];

function check(name, ok, detail = "") {
  (ok ? PASS : FAIL).push(name);
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
}
const show = (s) => JSON.stringify(s);

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

const api = async (method, p, body, token = TOKENS.admin) => {
  const r = await fetch(API + p, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
};

const TITLE = "举报界面验收帖";
const COMMENT = "这条评论等着被举报-界面验收";
let postId = null;
let commentId = null;

// 1000 宽落在 md 断点：帖子「更多」菜单是 click 触发，比 hover 好操作；
// 只影响布局断点，不影响功能。
const VIEW = { w: 1000, h: 1200 };

(async () => {
  const proc = spawn(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-proxy-server",
      `--remote-debugging-port=${DBG_PORT}`,
      `--window-size=${VIEW.w},${VIEW.h}`,
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-report",
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
    await sleep(600);
  };

  const CARD = `[...document.querySelectorAll('.post-card')].find(c => c.querySelector('.post-card__title')?.textContent.trim() === ${JSON.stringify(TITLE)})`;

  // 打开卡片「更多」菜单并点某一项
  const clickMoreItem = async (label) =>
    evaluate(`(() => {
      const card = ${CARD};
      if (!card) return 'no-card';
      const trigger = card.querySelector('.post-card__more-trigger');
      if (!trigger) return 'no-trigger';
      trigger.click();
      return 'ok';
    })()`).then(async (r) => {
      if (r !== "ok") return r;
      const opened = await until(`!!document.querySelector('.dropdown-menu--postCard-more')`, 5000);
      if (!opened) return "menu-not-open";
      return evaluate(`(() => {
        const menu = document.querySelector('.dropdown-menu--postCard-more');
        const items = [...menu.querySelectorAll('.more-actions-item')];
        const target = items.find(el => el.textContent.trim() === ${JSON.stringify(label)});
        if (!target) return 'no-item:' + items.map(i => i.textContent.trim()).join('|');
        target.click();
        return 'clicked';
      })()`);
    });

  const menuLabels = async () =>
    evaluate(`(() => {
      const card = ${CARD};
      if (!card) return [];
      card.querySelector('.post-card__more-trigger').click();
      return new Promise(res => setTimeout(() => {
        const menu = document.querySelector('.dropdown-menu--postCard-more');
        res(menu ? [...menu.querySelectorAll('.more-actions-item')].map(el => el.textContent.trim()) : []);
      }, 350));
    })()`);

  try {
    // ---------- 准备 ----------
    console.log("[准备] 创建临时帖子 + 评论");
    const created = await api(
      "POST",
      "/post/createPost",
      { title: TITLE, content: "这是界面验收用的帖子\n第二行内容" },
      TOKENS.member
    );
    postId = created?.data?.id;
    check("临时帖子已创建", !!postId, JSON.stringify(created?.code));
    if (!postId) throw new Error("准备失败");

    const c = await api("POST", `/comments/create?postId=${postId}`, { content: COMMENT }, TOKENS.member);
    commentId = c?.data?.id;
    check("临时评论已创建", !!commentId, JSON.stringify(c?.code));

    await nav(BASE + "/");
    // 上一轮如果停在暗色，user-data-dir 会把主题留在 localStorage 里，
    // 不清掉的话第一张截图就是暗色的
    await evaluate(`localStorage.removeItem('kokomi-theme')`);
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(TOKENS.admin)})`);
    await nav(BASE + "/");
    check("首页加载出测试帖", await until(`!!(${CARD})`, 15000));

    // ---------- 1. 菜单里出现举报 ----------
    console.log("\n[1] 帖子菜单");
    const labels = await menuLabels();
    check("他人帖子的菜单里有「举报」", labels.includes("举报"), show(labels));
    check("自己的帖子也不缺举报项以外的操作", labels.includes("分享"), show(labels));

    // ---------- 2. 弹窗 ----------
    console.log("\n[2] 举报弹窗");
    const openRes = await clickMoreItem("举报");
    check("点击后弹窗打开", openRes === "clicked" && (await until(`!!document.querySelector('.report-overlay')`, 5000)), openRes);
    // 理由字典是打开弹窗时才去后端拉的，必须等它到位再断言
    check("理由列表加载出来", await until(`document.querySelectorAll('.report-reason').length >= 6`, 8000));

    const modal = await evaluate(`(() => {
      const card = document.querySelector('.report-card');
      if (!card) return null;
      const reasons = [...card.querySelectorAll('.report-reason')].map(el => el.textContent.trim());
      const submit = card.querySelector('.report-btn--primary');
      return {
        title: card.querySelector('.report-head__title')?.textContent.trim(),
        reasons,
        submitDisabled: submit?.disabled,
        submitText: submit?.textContent.trim(),
        hasTextarea: !!card.querySelector('.report-textarea'),
        target: card.querySelector('.report-target')?.textContent.trim(),
      };
    })()`);
    check("标题是「举报帖子」", modal?.title === "举报帖子", modal?.title);
    check("有 6 个举报理由", modal?.reasons?.length === 6, show(modal?.reasons));
    check("理由含「垃圾广告」", modal?.reasons?.includes("垃圾广告"), show(modal?.reasons));
    check("没选理由时不能提交", modal?.submitDisabled === true, String(modal?.submitDisabled));
    check("有补充说明输入框", modal?.hasTextarea === true);
    check("弹窗顶部显示了被举报内容摘要", (modal?.target || "").includes("界面验收帖"), modal?.target);

    await shot("report-post-modal.png");

    // 选理由 → 按钮可用
    await evaluate(`(() => {
      const el = [...document.querySelectorAll('.report-reason')].find(e => e.textContent.trim() === '垃圾广告');
      el.click();
    })()`);
    await evaluate(`(() => {
      const ta = document.querySelector('.report-textarea');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, '整篇都是广告，测试用');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(200);
    const afterPick = await evaluate(`(() => {
      const submit = document.querySelector('.report-btn--primary');
      return {
        disabled: submit.disabled,
        activeReasons: document.querySelectorAll('.report-reason.is-active').length,
        counter: document.querySelector('.report-counter')?.textContent.trim(),
      };
    })()`);
    check("选了理由后可以提交", afterPick?.disabled === false, String(afterPick?.disabled));
    check("只有选中的理由高亮", afterPick?.activeReasons === 1, String(afterPick?.activeReasons));
    check("字数统计跟着更新", /[1-9]/.test(afterPick?.counter || ""), afterPick?.counter);

    // Esc 关闭
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    check("按 Esc 能关掉弹窗", await until(`!document.querySelector('.report-overlay')`, 4000));

    // 重新打开并提交
    await clickMoreItem("举报");
    await until(`!!document.querySelector('.report-overlay')`, 5000);
    await evaluate(`(() => {
      const hit = [...document.querySelectorAll('.report-reason')].find(e => e.textContent.trim() === '违法违规');
      if (hit) hit.click();
    })()`);
    // 点理由后 Vue 要等一次渲染才把按钮解禁，这里必须等一下再点提交
    await sleep(300);
    const submitReady = await evaluate(
      `!document.querySelector('.report-btn--primary').disabled`
    );
    check("选完理由提交按钮解禁", submitReady === true);
    await evaluate(`document.querySelector('.report-btn--primary').click()`);
    check("提交后弹窗关闭", await until(`!document.querySelector('.report-overlay')`, 10000));

    const saved = await api("GET", "/report/mine?targetType=post");
    check("后端确实记下了这条举报", (saved?.data || []).includes(postId), show(saved?.data));

    const labels2 = await menuLabels();
    check("再打开菜单显示「已举报」", labels2.includes("已举报"), show(labels2));

    // ---------- 3. 评论举报 ----------
    console.log("\n[3] 评论举报入口");
    await nav(`${BASE}/post/${postId}`);
    check("详情页加载", await until(`!!document.querySelector('.comment-action')`, 15000));
    const commentBtn = await evaluate(`(() => {
      const btns = [...document.querySelectorAll('.comment-action')].filter(b => b.textContent.trim() === '举报');
      return btns.length;
    })()`);
    check("评论上有举报按钮", commentBtn >= 1, String(commentBtn));
    await evaluate(`(() => {
      [...document.querySelectorAll('.comment-action')].find(b => b.textContent.trim() === '举报').click();
    })()`);
    check("评论举报弹窗打开", await until(`!!document.querySelector('.report-overlay')`, 5000));
    const commentModal = await evaluate(`(() => ({
      title: document.querySelector('.report-head__title')?.textContent.trim(),
      target: document.querySelector('.report-target')?.textContent.trim(),
    }))()`);
    check("标题是「举报评论」", commentModal?.title === "举报评论", commentModal?.title);
    check("弹窗带出了评论内容", (commentModal?.target || "").includes("等着被举报"), commentModal?.target);
    await shot("report-comment-modal.png");
    await evaluate(`document.querySelector('.report-head__close').click()`);
    await until(`!document.querySelector('.report-overlay')`, 4000);

    // ---------- 4. 用户主页举报 ----------
    console.log("\n[4] 用户主页举报");
    await nav(`${BASE}/user/9`);
    check("用户主页加载", await until(`!!document.querySelector('.profile-card__name')`, 15000));
    const hasUserReport = await evaluate(`!!document.querySelector('.profile-card__report')`);
    check("他人主页有举报按钮", hasUserReport === true, String(hasUserReport));
    await evaluate(`document.querySelector('.profile-card__report').click()`);
    check("用户举报弹窗打开", await until(`!!document.querySelector('.report-overlay')`, 5000));
    const userModal = await evaluate(
      `document.querySelector('.report-head__title')?.textContent.trim()`
    );
    check("标题是「举报用户」", userModal === "举报用户", userModal);
    await evaluate(`document.querySelector('.report-head__close').click()`);

    // 自己的主页不该有举报
    await nav(`${BASE}/user/1`);
    await until(`!!document.querySelector('.profile-card__name')`, 15000);
    check(
      "自己的主页没有举报按钮",
      (await evaluate(`!!document.querySelector('.profile-card__report')`)) === false
    );

    // ---------- 5. 后台处理 ----------
    console.log("\n[5] 后台举报列表与处理");
    await nav(`${BASE}/admin/reports`);
    check("后台举报页打开", await until(`!!document.querySelector('.report-list, .reports-empty')`, 15000));
    const rows = await evaluate(`(() => {
      const list = [...document.querySelectorAll('.report-row')];
      return {
        count: list.length,
        hasMine: list.some(r => r.textContent.includes('界面验收帖')),
        badge: document.querySelector('.admin-nav__badge')?.textContent.trim() || '',
        tabs: [...document.querySelectorAll('.sort-tab')].map(t => t.textContent.trim()),
      };
    })()`);
    check("列表里有待处理的测试举报", rows?.hasMine === true, show(rows?.count));
    check("菜单上有待处理数量徽标", /^\d+$/.test(rows?.badge || ""), rows?.badge);
    check("有「待处理 / 已受理 / 已驳回 / 全部」四个筛选", rows?.tabs?.length === 4, show(rows?.tabs));
    await shot("report-admin-list.png");

    await evaluate(`(() => {
      const row = [...document.querySelectorAll('.report-row')].find(r => r.textContent.includes('界面验收帖'));
      row.click();
    })()`);
    check("详情弹窗打开", await until(`!!document.querySelector('.detail-card .detail-body')`, 8000));
    const detailInfo = await evaluate(`(() => {
      const card = document.querySelector('.detail-card');
      return {
        title: card.querySelector('.detail-head__title')?.textContent.trim(),
        content: card.querySelector('.target-content')?.textContent || '',
        hasDeleteCheck: !!card.querySelector('.check-row input[type=checkbox]'),
        buttons: [...card.querySelectorAll('.detail-btn')].map(b => b.textContent.trim()),
        reasonChips: [...card.querySelectorAll('.detail-kv dd')].map(d => d.textContent.trim()),
      };
    })()`);
    check("详情标题是「处理举报」", (detailInfo?.title || "").includes("处理举报"), detailInfo?.title);
    check("详情能看到被举报正文", (detailInfo?.content || "").includes("界面验收用的帖子"), (detailInfo?.content || "").slice(0, 24));
    check("有「同时删除该内容」勾选框", detailInfo?.hasDeleteCheck === true);
    check("有驳回 / 受理按钮", detailInfo?.buttons?.includes("受理") && detailInfo?.buttons?.includes("驳回"), show(detailInfo?.buttons));
    await shot("report-admin-detail.png");

    // 勾选封禁，确认会出现天数选择（不真的提交封禁）
    // class 从 .reports-select--sm 改成了后台统用的 .admin-select--sm（风格统一用）
    await evaluate(`(() => {
      const boxes = document.querySelectorAll('.check-row input[type=checkbox]');
      boxes[1].click();
    })()`);
    await sleep(250);
    const banUi = await evaluate(`(() => ({
      hasDaySelect: !!document.querySelector('.admin-select--sm'),
      dayOptions: [...document.querySelectorAll('.admin-select--sm option')].map(o => o.textContent.trim()),
    }))()`);
    check("勾选封禁后出现天数选择", banUi?.hasDaySelect === true);
    check("天数选项含永久", banUi?.dayOptions?.includes("永久"), show(banUi?.dayOptions));
    // 取消封禁，只测删内容
    await evaluate(`document.querySelectorAll('.check-row input[type=checkbox]')[1].click()`);
    await sleep(200);

    // 勾选删除内容并受理
    await evaluate(`document.querySelectorAll('.check-row input[type=checkbox]')[0].click()`);
    await sleep(200);
    await evaluate(`(() => {
      [...document.querySelectorAll('.detail-btn')].find(b => b.textContent.trim() === '受理').click();
    })()`);
    check("受理后详情弹窗关闭", await until(`!document.querySelector('.detail-card')`, 12000));

    const gone = await api("GET", `/post/${postId}`, null, TOKENS.admin);
    check("被举报的帖子已被删除", gone?.code !== 200 || !gone?.data, JSON.stringify(gone?.code));

    // 待处理队列里不再有它
    await nav(`${BASE}/admin/reports`);
    await until(`!!document.querySelector('.report-list, .reports-empty')`, 15000);
    const afterRows = await evaluate(`(() => {
      const list = [...document.querySelectorAll('.report-row')];
      return {
        hasMine: list.some(r => r.textContent.includes('界面验收帖')),
        accepted: [...document.querySelectorAll('.sort-tab')].length,
      };
    })()`);
    check("待处理列表里已经没有它", afterRows?.hasMine === false);

    // ---------- 6. 暗色 + 手机 ----------
    console.log("\n[6] 暗色与手机");
    await evaluate(`localStorage.setItem('kokomi-theme', 'dark')`);
    // 暗色下再开一次「分享」以外的弹窗需要帖子，改用用户主页的举报入口（不依赖帖子）
    await nav(`${BASE}/user/9`);
    await until(`!!document.querySelector('.profile-card__report')`, 15000);
    await evaluate(`document.querySelector('.profile-card__report').click()`);
    await until(`!!document.querySelector('.report-overlay')`, 5000);
    await until(`document.querySelectorAll('.report-reason').length >= 6`, 8000);
    const dark = await evaluate(`(() => {
      const card = document.querySelector('.report-card');
      const active = document.querySelector('.report-reason');
      return {
        bg: getComputedStyle(card).backgroundColor,
        text: getComputedStyle(card).color,
        reasonBg: getComputedStyle(active).backgroundColor,
      };
    })()`);
    check("暗色弹窗是深底", /rgb\((1[0-9]|2[0-9]|3[0-9]),/.test(dark?.bg || ""), dark?.bg);
    check("暗色弹窗文字是浅色", /rgb\((2[0-5][0-9]),/.test(dark?.text || ""), dark?.text);
    await shot("report-dark.png");
    await evaluate(`document.querySelector('.report-head__close').click()`);

    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await nav(`${BASE}/user/9`);
    await until(`!!document.querySelector('.profile-card__report')`, 15000);
    await evaluate(`document.querySelector('.profile-card__report').click()`);
    await until(`!!document.querySelector('.report-overlay')`, 5000);
    const mobile = await evaluate(`(() => {
      const card = document.querySelector('.report-card');
      return {
        pageWidth: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
        cardWidth: Math.round(card.getBoundingClientRect().width),
      };
    })()`);
    check("手机上没有横向溢出", mobile?.pageWidth <= mobile?.viewport + 1, `${mobile?.pageWidth} <= ${mobile?.viewport}`);
    check("弹窗宽度收在视口内", mobile?.cardWidth <= mobile?.viewport, `${mobile?.cardWidth} <= ${mobile?.viewport}`);
    await shot("report-mobile.png", 390, 844);
    await evaluate(`localStorage.removeItem('kokomi-theme')`);
  } catch (e) {
    console.log("\n异常:", e.message);
    FAIL.push("异常中断:" + e.message);
  } finally {
    // 清理：删帖子（连带评论）
    if (postId) await api("DELETE", `/post/${postId}`, null, TOKENS.admin).catch(() => {});
    console.log(`\n==== 通过 ${PASS.length} / 失败 ${FAIL.length} ====`);
    if (FAIL.length) FAIL.forEach((f) => console.log("  FAILED:", f));
    ws.close();
    proc.kill();
    process.exit(FAIL.length ? 1 : 0);
  }
})();
