// 举报处理页「类型」下拉框自绘验收（真实浏览器 + 真实后端）
//   [1] 工具栏里只剩自绘下拉，没有原生 <select>（原生展开列表样式改不了）
//   [2] 外观与相邻控件同规格：32px 高 / 8px 圆角 / 13px 字
//   [3] 点开后面板是站内浮层语言：--dropdown-bg 底 + 10px 圆角 + 4 个选项
//   [4] 面板宽度不小于按钮宽度，且右边缘对齐
//   [5] 选中「帖子」→ 按钮文案变、面板收起、列表只剩帖子
//   [6] 暗色主题下面板不发白（底色 #1e1e1e、文字亮）
//   [7] Esc / 点空白处都能收起
// 用法：node tools/test-admin-select.js（需 18080 后端 + 5194 预览）
const { spawn, spawnSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9423;
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
  if (r.status !== 0) throw new Error("refresh_tokens.py 失败: " + (r.stderr || r.stdout));
  return JSON.parse(fs.readFileSync(path.join(OUT, "tmp", "tokens.json"), "utf-8"));
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

let tokens = null;

(async () => {
  tokens = refreshTokens();
  console.log("  token 已刷新");

  // 造一条帖子举报，保证列表里有数据可筛
  const created = await api(
    "POST",
    "/post/createPost",
    { title: "下拉框验收：帖子类型", content: "用来验证类型筛选的列表项", type: "tech" },
    tokens.admin
  );
  const postId = created?.data?.id;
  check("准备：造一条帖子", !!postId, `id=${postId}`);
  if (postId) {
    const rep = await api(
      "POST",
      "/report",
      { targetType: "post", targetId: postId, reasonCode: "spam", detail: "下拉框验收" },
      tokens.member
    );
    check("准备：举报已提交", rep.code === 200, rep.msg || "");
  }

  const proc = spawn(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-proxy-server",
      `--remote-debugging-port=${DBG_PORT}`,
      "--window-size=1200,1000",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-selectbox",
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
    await sleep(900);
  };

  /** 鼠标真点：Dropdown 的点击外部关闭依赖真实 click 事件冒泡到 document */
  const clickAt = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(350);
  };
  const clickEl = async (sel) => {
    const box = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!box) throw new Error("找不到元素: " + sel);
    await clickAt(box.x, box.y);
  };
  // 页面上可能有多个 SelectBox（列表页筛选 + 详情里的天数），
  // 菜单容器都是 Teleport 到 body 的 .global-dropdown-wrapper，
  // 所以「可见的那个」才是当前展开的面板
  const menuVisible = () =>
    evaluate(
      `[...document.querySelectorAll('.global-dropdown-wrapper')].some(w => w.offsetHeight > 0)`
    );
  /** 取当前可见面板里的信息 */
  const visibleMenu = (fn) =>
    evaluate(`(() => {
      const wrap = [...document.querySelectorAll('.global-dropdown-wrapper')].find(w => w.offsetHeight > 0);
      if (!wrap) return null;
      const m = wrap.querySelector('.select-menu');
      if (!m) return null;
      return (${fn})(m, wrap);
    })()`);
  /** 点当前可见面板里的第 n 个选项（0 基） */
  const clickVisibleOption = async (idx) => {
    const pos = await evaluate(`(() => {
      const wrap = [...document.querySelectorAll('.global-dropdown-wrapper')].find(w => w.offsetHeight > 0);
      const li = wrap && wrap.querySelectorAll('.select-option')[${idx}];
      if (!li) return null;
      const r = li.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!pos) throw new Error(`可见面板里没有第 ${idx + 1} 个选项`);
    await clickAt(pos.x, pos.y);
  };

  try {
    await nav(BASE + "/");
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(tokens.admin)})`);
    await evaluate(`localStorage.setItem('kokomi-theme', 'light')`);
    await nav(BASE + "/admin/reports");
    check("准备：举报页已渲染", await until(`!!document.querySelector('.select-trigger')`));

    // ---------------------------------------------------------- 1 没有原生 select
    console.log("\n[1] 工具栏只用自绘下拉");
    const nativeCount = await evaluate(
      `document.querySelectorAll('.reports-toolbar select').length`
    );
    check("工具栏内没有原生 <select>", nativeCount === 0, `count=${nativeCount}`);
    const hasTrigger = await evaluate(`!!document.querySelector('.select-trigger')`);
    check("存在自绘触发按钮 .select-trigger", hasTrigger);
    const triggerText = await evaluate(
      `document.querySelector('.select-trigger__text')?.textContent.trim()`
    );
    check("默认文案是「全部类型」", triggerText === "全部类型", triggerText);

    // ---------------------------------------------------------- 2 与相邻控件同规格
    console.log("\n[2] 尺寸与相邻控件一致");
    const box = await evaluate(`(() => {
      const el = document.querySelector('.select-trigger');
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      // 同一行的主操作按钮做参照
      const ref = document.querySelector('.admin-btn');
      return {
        h: Math.round(r.height),
        radius: cs.borderTopLeftRadius,
        fontSize: cs.fontSize,
        border: cs.borderTopWidth + ' ' + cs.borderTopColor,
        refH: ref ? Math.round(ref.getBoundingClientRect().height) : null,
      };
    })()`);
    check("高度 32px", box.h === 32, `h=${box.h}`);
    check("圆角 8px", box.radius === "8px", box.radius);
    check("字号 13px", box.fontSize === "13px", box.fontSize);
    check("边框 1px 细线", box.border.startsWith("1px"), box.border);

    // ---------------------------------------------------------- 3 面板 + 选项
    console.log("\n[3] 展开面板是站内浮层语言");
    await clickEl(".select-trigger");
    check("面板已展开", await menuVisible());
    const menu = await visibleMenu((m) => {
      const cs = getComputedStyle(m);
      const opts = [...m.querySelectorAll(".select-option")].map((o) => o.textContent.trim());
      const ocs = getComputedStyle(m.querySelector(".select-option"));
      return {
        bg: cs.backgroundColor,
        radius: cs.borderTopLeftRadius,
        border: cs.borderTopWidth,
        shadow: cs.boxShadow !== "none",
        opts,
        optH: Math.round(m.querySelector(".select-option").getBoundingClientRect().height),
        optFont: ocs.fontSize,
        activeBg: getComputedStyle(m.querySelector(".select-option.is-active")).backgroundColor,
      };
    });
    check("面板存在", !!menu);
    check(
      "选项齐全：全部类型 / 帖子 / 评论 / 用户",
      JSON.stringify(menu?.opts) === JSON.stringify(["全部类型", "帖子", "评论", "用户"]),
      JSON.stringify(menu?.opts)
    );
    check("面板底色是 --dropdown-bg（浅色=白）", menu?.bg === "rgb(255, 255, 255)", menu?.bg);
    check("面板圆角 10px", menu?.radius === "10px", menu?.radius);
    check("面板有 1px 描边", menu?.border === "1px", menu?.border);
    check("面板有阴影", menu?.shadow === true);
    check("选项高 30px", menu?.optH === 30, `h=${menu?.optH}`);
    check("选项字号 13px", menu?.optFont === "13px", menu?.optFont);
    check(
      "选中项有主色底（不是系统灰条）",
      menu?.activeBg && menu.activeBg !== "rgba(0, 0, 0, 0)",
      menu?.activeBg
    );
    await shot("admin-select-open.png");

    // ---------------------------------------------------------- 4 宽度与对齐
    console.log("\n[4] 面板与按钮对齐");
    const geo = await visibleMenu((m) => {
      const t = document.querySelector(".reports-toolbar .select-trigger").getBoundingClientRect();
      const r = m.getBoundingClientRect();
      return {
        tW: Math.round(t.width),
        mW: Math.round(r.width),
        dRight: Math.round(r.right - t.right),
      };
    });
    check("面板宽度不小于按钮", geo.mW >= geo.tW, `${geo.mW} vs ${geo.tW}`);
    check("右边缘对齐（差 ≤1px）", Math.abs(geo.dRight) <= 1, `dRight=${geo.dRight}`);

    // ---------------------------------------------------------- 5 选中生效 + 收起
    console.log("\n[5] 选中「帖子」后筛选生效");
    await clickVisibleOption(1);
    await sleep(600);
    check("面板自动收起", (await menuVisible()) === false);
    const afterText = await evaluate(
      `document.querySelector('.select-trigger__text')?.textContent.trim()`
    );
    check("按钮文案变成「帖子」", afterText === "帖子", afterText);
    await sleep(500);
    const chips = await evaluate(`(() => {
      const rows = [...document.querySelectorAll('.report-list .type-chip')];
      return rows.map(r => r.textContent.trim());
    })()`);
    check(
      "列表只剩帖子类型",
      chips.length > 0 && chips.every((c) => c === "帖子"),
      JSON.stringify(chips)
    );

    // ---------------------------------------------------------- 6 暗色
    console.log("\n[6] 暗色主题下面板不发白");
    await evaluate(`localStorage.setItem('kokomi-theme', 'dark')`);
    await nav(BASE + "/admin/reports");
    await until(`!!document.querySelector('.select-trigger')`);
    check(
      "暗色已生效",
      await evaluate(`document.documentElement.classList.contains('dark')`)
    );
    // 回到「全部类型」再开面板
    await clickEl(".select-trigger");
    check("面板已展开", await menuVisible());
    const dark = await visibleMenu((m) => {
      const cs = getComputedStyle(m);
      // 选中项本来就是主色文字，这里取未选中的项判断「亮色」
      const opt = getComputedStyle(m.querySelector(".select-option:not(.is-active)"));
      return { bg: cs.backgroundColor, color: opt.color, shadow: cs.boxShadow !== "none" };
    });
    check("面板底色 #1e1e1e（不是白）", dark?.bg === "rgb(30, 30, 30)", dark?.bg);
    check("选项文字为亮色", dark?.color === "rgb(240, 240, 240)", dark?.color);
    check("暗色有更深的投影", dark?.shadow === true);
    await shot("admin-select-dark.png");

    // ---------------------------------------------------------- 7 关闭方式
    console.log("\n[7] Esc / 点空白处都能收起");
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(400);
    check("Esc 收起面板", (await menuVisible()) === false);

    await clickEl(".select-trigger");
    check("面板重新展开", await menuVisible());
    const vp = await evaluate(`({ w: innerWidth, h: innerHeight })`);
    await clickAt(vp.w / 2, vp.h - 30);
    check("点空白处收起", (await menuVisible()) === false);

    // 再点一次确认能正常开合（不会点一次开两次关）
    await clickEl(".select-trigger");
    const openAgain = await menuVisible();
    await clickEl(".select-trigger");
    const closedAgain = await menuVisible();
    check("按钮可以正常开/合", openAgain === true && closedAgain === false, `${openAgain}/${closedAgain}`);

    // 复原主题，方便后续测试
    await evaluate(`localStorage.setItem('kokomi-theme', 'light')`);

    // ---------------------------------------------------------- 8 详情弹窗里的天数下拉
    console.log("\n[8] 详情弹窗里的「处罚天数」也是自绘");
    await nav(BASE + "/admin/reports");
    await until(`!!document.querySelector('.report-row')`);
    await clickEl(".report-row");
    check("详情弹窗已打开", await until(`!!document.querySelector('.detail-block--handle')`));
    await clickEl("#ban-toggle");
    check(
      "勾选后出现天数下拉",
      await until(`!!document.querySelector('.detail-block--handle .select-trigger')`)
    );
    const sm = await evaluate(`(() => {
      const el = document.querySelector('.detail-block--handle .select-trigger');
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { h: Math.round(r.height), font: cs.fontSize, radius: cs.borderTopLeftRadius };
    })()`);
    check("小号下拉高 28px", sm?.h === 28, `h=${sm?.h}`);
    check("小号下拉字号 12px", sm?.font === "12px", sm?.font);
    check("小号下拉圆角 8px", sm?.radius === "8px", sm?.radius);

    await clickEl(".detail-block--handle .select-trigger");
    check("面板已展开", await menuVisible());
    const days = await visibleMenu((m, wrap) => {
      const r = m.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 8);
      return {
        opts: [...m.querySelectorAll(".select-option")].map((o) => o.textContent.trim()),
        z: getComputedStyle(wrap).zIndex,
        onTop: !!(hit && hit.closest(".select-menu")),
        inView: r.top >= 0 && r.bottom <= innerHeight,
      };
    });
    check(
      "选项是 1/3/7/30 天 + 永久",
      JSON.stringify(days?.opts) === JSON.stringify(["1 天", "3 天", "7 天", "30 天", "永久"]),
      JSON.stringify(days?.opts)
    );
    check("面板层级 3100（盖过 3000 的详情弹窗）", days?.z === "3100", days?.z);
    check("面板确实在最上层（没被弹窗遮住）", days?.onTop === true);
    check("面板完整在视口内", days?.inView === true);
    await shot("admin-select-detail.png");
    await clickVisibleOption(4);
    const dayText = await evaluate(
      `document.querySelector('.detail-block--handle .select-trigger__text')?.textContent.trim()`
    );
    check("选中「永久」后按钮文案同步", dayText === "永久", dayText);

    // ---------------------------------------------------------- 9 手机宽度
    console.log("\n[9] 手机宽度下面板不溢出");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await nav(BASE + "/admin/reports");
    await until(`!!document.querySelector('.select-trigger')`);
    await clickEl(".reports-toolbar .select-trigger");
    check("面板已展开", await menuVisible());
    const mob = await visibleMenu((m) => {
      const r = m.getBoundingClientRect();
      return {
        left: Math.round(r.left),
        right: Math.round(r.right),
        vw: window.innerWidth,
        opts: m.querySelectorAll(".select-option").length,
      };
    });
    check(
      "面板左右都在视口内（floating-ui 自动平移）",
      mob && mob.left >= 0 && mob.right <= mob.vw,
      JSON.stringify(mob)
    );
    check("选项没有丢", mob?.opts === 4, `${mob?.opts}`);
    check(
      "页面没有横向溢出",
      await evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`)
    );
    await shot("admin-select-mobile.png");
  } catch (e) {
    check("执行未抛异常", false, e.message);
  } finally {
    console.log(`\n通过 ${PASS.length} / 失败 ${FAIL.length}`);
    if (FAIL.length) console.log("失败项：\n - " + FAIL.join("\n - "));
    ws.close();
    proc.kill();
    process.exit(FAIL.length ? 1 : 0);
  }
})();
