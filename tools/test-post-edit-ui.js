// 帖子编辑流程验证（编辑入口 → 回填 → 保存 → 取消 → 无权）。
// 用法：node tools/test-post-edit-ui.js（需 18080 后端 + 5194 预览）
// 只用一条临时帖子，跑完删掉，不动真实数据。
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9402;
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

// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function uploadImage(token) {
  const fd = new FormData();
  fd.append("file", new Blob([PNG], { type: "image/png" }), "ui-test.png");
  const r = await fetch(API + "/file/upload/post-image", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: fd,
  });
  const j = await r.json();
  return j.data.url;
}

(async () => {
  // ---------- 准备一条带图的临时帖子 ----------
  console.log("\n[准备] 临时帖子");
  const imgUrl = await uploadImage(TOKENS.admin);
  const createRes = await fetch(API + "/post/createPost", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOKENS.admin },
    body: JSON.stringify({
      title: "编辑功能验收帖",
      content: "第一行内容\n第二行内容",
      type: "tech",
      media: [{ url: imgUrl, type: "image" }],
    }),
  });
  const created = await createRes.json();
  const pid = created?.data?.id;
  if (!pid) throw new Error("创建临时帖子失败: " + JSON.stringify(created));
  console.log("  临时帖子 id =", pid);

  const proc = spawn(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-proxy-server",
      `--remote-debugging-port=${DBG_PORT}`,
      "--window-size=1280,1000",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-post-edit",
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
      throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || "eval error"));
    }
    return r.result?.result?.value;
  };
  const until = async (expr, timeout = 10000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try {
        if (await evaluate(expr)) return true;
      } catch {
        /* 页面切换中，稍后重试 */
      }
      await sleep(150);
    }
    return false;
  };
  const shot = async (name, w = 1280, h = 1000) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: w < 500,
    });
    // 鼠标挪到角落，避免残留 hover 底色
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5, button: "none" });
    await sleep(400);
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(s.result.data, "base64"));
    console.log("  截图 -> shots/" + name);
  };
  const nav = async (url) => {
    await send("Page.navigate", { url });
    await until(`document.readyState === 'complete'`, 15000);
    await sleep(500);
  };

  // 先落一次 token 再刷新：用 addScriptToEvaluateOnNewDocument 每次导航都会覆盖，
  // 后面要切 member 就没法切了
  await nav(BASE + "/space/home");
  await evaluate(`localStorage.setItem('token', ${JSON.stringify(TOKENS.admin)})`);
  await nav(BASE + "/space/home");
  await until(`!!document.querySelector('.input-title')`, 12000);

  // ---------- 1. 从帖子菜单点「编辑」能进编辑模式 ----------
  console.log("\n[1] 帖子菜单 → 编辑");
  await nav(BASE + "/");
  await until(`document.querySelectorAll('.post-card').length > 0`, 20000);

  // 找第一条自己的帖子（作者名 = 自己），这里直接点临时帖子上的更多菜单更稳：
  // 临时帖子是刚发的，排序后应在列表第一条附近，用标题定位
  const found = await until(
    `[...document.querySelectorAll('.post-card')].some(el => el.textContent.includes('编辑功能验收帖'))`,
    15000
  );
  check("首页列表能看到临时帖子", found);

  // 大屏下菜单是 hover 触发，先把鼠标挪到「更多」按钮上再点菜单项
  const trig = await evaluate(`(() => {
    const card = [...document.querySelectorAll('.post-card')]
      .find(el => el.textContent.includes('编辑功能验收帖'));
    if (!card) return null;
    const t = card.querySelector('.post-card__more-trigger');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  check("找到帖子卡片的更多按钮", !!trig);

  let menuHit = "no-trigger";
  if (trig) {
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: trig.x,
      y: trig.y,
      button: "none",
    });
    await sleep(600);
    menuHit = await evaluate(`(() => {
      const items = [...document.querySelectorAll('.more-actions-item')];
      const edit = items.find(el => el.textContent.trim().includes('编辑'));
      if (!edit) return 'no-edit:' + items.map(e => e.textContent.trim()).join('|');
      edit.click();
      return 'ok';
    })()`);
  }
  check("菜单里有「编辑」并能点击", menuHit === "ok", menuHit);

  const jumped = await until(`location.search.includes('edit=${pid}')`, 8000);
  check("跳转到 /space/home?edit=id", jumped, await evaluate("location.pathname + location.search"));

  // ---------- 2. 回填内容 ----------
  console.log("\n[2] 编辑模式回填");
  await until(`!!document.querySelector('.edit-banner')`, 12000);
  const state = await evaluate(`(() => {
    const t = document.querySelector('.input-title');
    const c = document.querySelector('.input-content');
    const btn = document.querySelector('.comment-submit-button');
    const banner = document.querySelector('.edit-banner');
    const activeCat = document.querySelector('.category-tag.active');
    return {
      hasEditing: !!document.querySelector('.publishing.is-editing'),
      bannerText: banner ? banner.textContent.replace(/\\s+/g, ' ').trim() : '',
      title: t ? t.value : null,
      content: c ? c.value : null,
      btnText: btn ? btn.textContent.trim() : '',
      activeCat: activeCat ? activeCat.textContent.trim() : '',
      previewImgs: document.querySelectorAll('.preview-img').length,
      hasCancel: !!document.querySelector('.edit-banner__cancel'),
    };
  })()`);
  check("出现编辑提示条", state.bannerText.includes("正在编辑"));
  check("发布框有编辑态样式", state.hasEditing);
  check("标题已回填", state.title === "编辑功能验收帖", state.title);
  check("正文已回填（含换行）", state.content === "第一行内容\n第二行内容", JSON.stringify(state.content));
  check("话题已回填", state.activeCat === "技术", state.activeCat || "(空)");
  check("已有图片显示在预览区", state.previewImgs === 1, String(state.previewImgs));
  check("按钮变为「保存修改」", state.btnText === "保存修改", state.btnText);
  check("有取消编辑入口", state.hasCancel);

  await shot("edit-1-filled.png");

  // ---------- 3. 改标题并保存 ----------
  console.log("\n[3] 保存修改");
  await evaluate(`(() => {
    const t = document.querySelector('.input-title');
    t.value = '编辑后的标题';
    t.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(200);
  await evaluate(`document.querySelector('.comment-submit-button').click()`);
  const okToast = await until(
    `[...document.querySelectorAll('.kokomi-toast')].some(el => el.textContent.includes('已保存修改'))`,
    12000
  );
  check("弹出「已保存修改」提示", okToast);

  await until(`!document.querySelector('.edit-banner')`, 8000);
  const afterSave = await evaluate(`({
    editing: !!document.querySelector('.edit-banner'),
    title: document.querySelector('.input-title')?.value,
    content: document.querySelector('.input-content')?.value,
    url: location.pathname + location.search,
    inList: [...document.querySelectorAll('.post-card')].some(el => el.textContent.includes('编辑后的标题')),
  })`);
  check("保存后退出编辑模式", !afterSave.editing);
  check("表单已清空", afterSave.title === "" && afterSave.content === "");
  check("地址栏的 edit 参数已清掉", !afterSave.url.includes("edit="), afterSave.url);
  check("列表里出现新标题", afterSave.inList);

  // 详情接口要求登录，必须带 token，否则拿到的是 401 的空 data
  const dbTitle = await fetch(`${API}/post/${pid}`, {
    headers: { Authorization: "Bearer " + TOKENS.admin },
  }).then((r) => r.json());
  check("后端标题真的改了", dbTitle?.data?.title === "编辑后的标题", dbTitle?.data?.title);
  check("后端图片没丢", (dbTitle?.data?.media || []).length === 1, String((dbTitle?.data?.media || []).length));

  await sleep(600);
  await shot("edit-2-saved.png");

  // ---------- 4. 取消编辑 ----------
  console.log("\n[4] 取消编辑");
  await nav(BASE + "/space/home?edit=" + pid);
  await until(`!!document.querySelector('.edit-banner')`, 10000);
  await evaluate(`document.querySelector('.edit-banner__cancel').click()`);
  await until(`!document.querySelector('.edit-banner')`, 6000);
  const afterCancel = await evaluate(`({
    editing: !!document.querySelector('.edit-banner'),
    title: document.querySelector('.input-title')?.value,
    url: location.pathname + location.search,
    imgs: document.querySelectorAll('.preview-img').length,
    btn: document.querySelector('.comment-submit-button')?.textContent.trim(),
  })`);
  check("取消后退出编辑模式", !afterCancel.editing);
  check("取消后清空表单", afterCancel.title === "" && afterCancel.imgs === 0);
  check("取消后按钮回到「发布」", afterCancel.btn === "发布", afterCancel.btn);
  check("取消后 query 被清掉", !afterCancel.url.includes("edit="), afterCancel.url);
  const stillThere = await fetch(`${API}/post/${pid}`, {
    headers: { Authorization: "Bearer " + TOKENS.admin },
  }).then((r) => r.json());
  check("取消不会改动原帖", stillThere?.data?.title === "编辑后的标题", stillThere?.data?.title);

  // ---------- 5. 暗色 ----------
  console.log("\n[5] 暗色模式");
  await nav(BASE + "/space/home?edit=" + pid);
  await until(`!!document.querySelector('.edit-banner')`, 10000);
  await evaluate(`localStorage.setItem('kokomi-theme','dark')`);
  await send("Page.reload");
  await until(`!!document.querySelector('.edit-banner')`, 12000);
  check("暗色下编辑提示条仍在", await evaluate(`!!document.querySelector('.edit-banner')`));
  await shot("edit-3-dark.png");
  await evaluate(`localStorage.setItem('kokomi-theme','light')`);

  // ---------- 6. 手机小屏 ----------
  console.log("\n[6] 390 小屏");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await nav(BASE + "/space/home?edit=" + pid);
  await until(`!!document.querySelector('.edit-banner')`, 12000);
  const mobileState = await evaluate(`({
    banner: !!document.querySelector('.edit-banner'),
    btn: document.querySelector('.comment-submit-button')?.textContent.trim(),
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    bannerH: document.querySelector('.edit-banner')?.getBoundingClientRect().height,
    width: document.querySelector('.publishing')?.getBoundingClientRect().width,
  })`);
  check("小屏也进入编辑模式", mobileState.banner && mobileState.btn === "保存修改");
  check("小屏无横向溢出", !mobileState.overflowX, `scrollWidth=${await evaluate("document.documentElement.scrollWidth")}`);
  check("小屏发布框不超宽", mobileState.width <= 390, String(mobileState.width));
  await shot("edit-4-mobile.png", 390, 844);

  // ---------- 7. 无权编辑别人的帖子 ----------
  console.log("\n[7] 普通用户编辑他人帖子");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await nav(BASE + "/space/home");
  await evaluate(`localStorage.setItem('token', ${JSON.stringify(TOKENS.member)})`);
  await nav(BASE + "/space/home?edit=19");
  const noPerm = await until(
    `[...document.querySelectorAll('.kokomi-toast')].some(el => el.textContent.includes('无权编辑'))`,
    10000
  );
  check("提示「无权编辑这条帖子」", noPerm);
  await sleep(400);
  check("没有进入编辑模式", !(await evaluate(`!!document.querySelector('.edit-banner')`)));
  await shot("edit-5-noperm.png");

  // ---------- 清理 ----------
  console.log("\n[清理]");
  const del = await fetch(`${API}/post/${pid}`, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + TOKENS.admin },
  }).then((r) => r.json());
  check("临时帖子已删除", del?.code === 200, String(del?.code));

  console.log(`\n===== ${PASS.length} 通过 / ${FAIL.length} 失败 =====`);
  if (FAIL.length) {
    console.log("失败项：");
    FAIL.forEach((f) => console.log("  - " + f));
  }
  try {
    proc.kill();
  } catch {}
  process.exit(FAIL.length ? 1 : 0);
})();
