// 账号安全页：密码 / 邮箱 / 注销集中在一处，改密码改成弹窗
//
//   [1] 侧栏「修改密码」换成「账号安全」，点进去是 /space/security
//   [2] 老链接 /space/password 重定向过去（收藏过的人不会 404）
//   [3] 三段齐全：登录密码 / 邮箱 / 注销账号；注销段标题是红色的
//   [4] 「修改密码」开弹窗：三个输入框 + 空提交 / 位数 / 一致性三类校验都在弹窗里
//   [5] 弹窗底部「用绑定邮箱重置」→ 关弹窗、打开登录弹窗的「找回密码」屏
//   [6] 「注销账号」开的是注销弹窗（两条件缺一不可的规则沿用原组件）
//   [7] 手机 390 宽：不溢出，三段按钮满宽
//   [8] 暗色：标题 / 说明用主题色，不是写死黑
//   [9] 回归：账号管理页不再有邮箱行和注销段（防止以后又搬回去）
//
// 用法：node tools/test-security-page.js（需 18080 后端 + 5194 预览）
const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
// ⚠️ 每个 UI 脚本必须用自己的调试端口，撞端口会连到对方的浏览器
const DBG_PORT = 9478;
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
const JWT_SECRET = process.env.JWT_SECRET || readLocal("secret");
function signToken(uid, tv) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ sub: String(uid), tokenVersion: tv, iat: now, exp: now + 3600 });
  const signing = `${head}.${body}`;
  return `${signing}.${crypto.createHmac("sha256", JWT_SECRET).update(signing).digest("base64url")}`;
}

const created = [];
function makeMember(tag) {
  const stamp = String(Date.now()).slice(-7) + Math.floor(Math.random() * 90 + 10);
  const username = `kokomi_${tag}${stamp}`;
  const email = `ui_sec_${tag}_${stamp}@example.com`;
  sql("INSERT INTO user (username, password, name, email, email_verified, primary_role) " +
    `VALUES ('${username}', 'x', '安全测试${stamp}', '${email}', 1, 'member')`);
  const id = Number(sql(`SELECT id FROM user WHERE username = '${username}'`));
  if (!id) throw new Error("造账号失败");
  sql(`INSERT INTO user_role (user_id, role_code) VALUES (${id}, 'member')`);
  created.push(id);
  // token_version 的 DDL 默认值是 1，必须从库里读，不能假设 0
  const tv = Number(sql(`SELECT token_version FROM user WHERE id = ${id}`) || 1);
  return { id, username, email, token: signToken(id, tv) };
}

function cleanup() {
  for (const id of created) {
    if (!id) continue;
    sql(`DELETE FROM user_role WHERE user_id = ${id}`);
    sql(`DELETE FROM user WHERE id = ${id}`);
  }
}

const get = (p) => new Promise((res, rej) => {
  const http = require("http");
  http.get({ host: "127.0.0.1", port: DBG_PORT, path: p }, (r) => {
    let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d)));
  }).on("error", rej);
});

(async () => {
  const user = makeMember("u");
  console.log(`  测试账号 ${user.username}(#${user.id}) ${user.email}`);

  const proc = spawn(EDGE, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--no-proxy-server",
    `--remote-debugging-port=${DBG_PORT}`, "--window-size=1200,1000",
    `--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-security-${process.pid}`,
    "about:blank",
  ], { stdio: "ignore" });
  await sleep(2500);
  let list = [];
  for (let i = 0; i < 12; i++) {
    try { list = await get("/json/list"); break; } catch { await sleep(500); }
  }
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((r) => {
    const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params }));
  });
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false });

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) {
      throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || "eval error").slice(0, 200));
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
      try {
        ok = await evaluate(
          `location.origin === ${JSON.stringify(origin)} && document.readyState === 'complete'`
        );
      } catch { ok = false; }
      if (ok) break;
      await sleep(150);
    }
    await sleep(1100);
  };
  const clickAt = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(400);
  };
  const clickEl = async (expr) => {
    const p = await evaluate(`(() => {
      const el = ${expr};
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const b = el.getBoundingClientRect();
      if (!b.width) return null;
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    if (!p) throw new Error("点不到元素: " + expr.slice(0, 60));
    await sleep(250);
    await clickAt(p.x, p.y);
  };
  const clickByText = async (sel, text) => {
    const ok = await evaluate(`(() => {
      const el = [...document.querySelectorAll(${JSON.stringify(sel)})]
        .find(e => (e.textContent || '').trim() === ${JSON.stringify(text)});
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    })()`);
    if (!ok) throw new Error(`点不到 ${sel} 里文字为「${text}」的元素`);
    await sleep(500);
  };
  const fill = async (sel, value) => {
    await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return false;
      el.focus();
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await send("Input.insertText", { text: value });
    await sleep(350);
  };
  const login = async (token) => {
    await nav(`${BASE}/`);
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(token)})`);
  };

  try {
    // ------------------------------------------------------------------
    console.log("[1] 侧栏：修改密码 → 账号安全");
    await login(user.token);
    await nav(`${BASE}/space/account`);
    const menu = await evaluate(`(() => {
      const items = [...document.querySelectorAll('.menu-item__text')].map(e => e.textContent.trim());
      return items;
    })()`);
    check("侧栏出现「账号安全」", menu.includes("账号安全"), JSON.stringify(menu));
    check("侧栏不再有「修改密码」", !menu.includes("修改密码"), JSON.stringify(menu));
    await clickByText(".menu-item", "账号安全");
    check("点进去是 /space/security",
      await until(`location.pathname === '/space/security'`, 10000),
      await evaluate(`location.pathname`));

    // ------------------------------------------------------------------
    console.log("\n[2] 老链接 /space/password 重定向");
    await nav(`${BASE}/space/password`);
    check("重定向到 /space/security",
      await until(`location.pathname === '/space/security'`, 10000),
      await evaluate(`location.pathname`));

    // ------------------------------------------------------------------
    console.log("\n[3] 三段齐全");
    const rows = await evaluate(`(() => {
      return [...document.querySelectorAll('.sec-row')].map(r => ({
        title: r.querySelector('.sec-row__title')?.textContent.trim(),
        desc: (r.querySelector('.sec-row__desc')?.textContent || '').replace(/\\s+/g, ''),
        danger: r.classList.contains('sec-row--danger'),
      }));
    })()`);
    check("恰好三段", rows.length === 3, `len=${rows.length}`);
    check("第一段是登录密码", rows[0]?.title === "登录密码", rows[0]?.title);
    check("第二段是邮箱", rows[1]?.title === "邮箱", rows[1]?.title);
    check("第三段是注销账号", rows[2]?.title === "注销账号", rows[2]?.title);
    check("只有第三段标了 danger", rows[2]?.danger === true && rows[0]?.danger === false);
    const dangerColor = await evaluate(
      `getComputedStyle(document.querySelector('.sec-row--danger .sec-row__title')).color`);
    check("注销标题是红色", /239,\s*68,\s*68/.test(dangerColor), dangerColor);
    check("邮箱行显示测试邮箱",
      (await evaluate(`document.querySelector('.email-text')?.textContent.trim() || ''`)) === user.email);
    check("已绑定且已验证 → 有更换/解绑",
      (await evaluate(`[...document.querySelectorAll('.sec-row--email .sec-btn')].map(e => e.textContent.trim()).join(',')`))
        === "更换,解绑");

    // 邮箱地址挂在「邮箱」标题下面（独立一行、与标题左对齐），
    // 且动作按钮跟「修改密码」是同一套尺寸 —— 一页里两种按钮形状会让人猜哪个更重
    const layout = await evaluate(`(() => {
      const row = document.querySelector('.sec-row--email');
      const t = row.querySelector('.sec-row__title').getBoundingClientRect();
      const v = row.querySelector('.email-text').getBoundingClientRect();
      const cs = getComputedStyle(row.querySelector('.sec-btn'));
      const other = getComputedStyle(document.querySelector('.sec-row .sec-btn'));
      return {
        below: v.top >= t.bottom - 1,
        leftAligned: Math.abs(v.left - t.left) < 2,
        h: cs.height, h2: other.height,
        r: cs.borderTopLeftRadius, r2: other.borderTopLeftRadius,
        f: cs.fontSize, f2: other.fontSize,
      };
    })()`);
    check("邮箱地址在标题下面", layout && layout.below);
    check("邮箱地址与标题左对齐", layout && layout.leftAligned);
    check("邮箱行按钮与「修改密码」同款（高 / 圆角 / 字号）",
      layout && layout.h === layout.h2 && layout.r === layout.r2 && layout.f === layout.f2,
      layout ? `${layout.h}/${layout.r}/${layout.f} vs ${layout.h2}/${layout.r2}/${layout.f2}` : "");
    await shot("security-01-page.png");

    // ------------------------------------------------------------------
    console.log("\n[4] 修改密码弹窗：三类校验都在");
    await clickByText(".sec-btn", "修改密码");
    check("弹窗打开", await until(`!!document.querySelector('.pp-dialog')`));
    // 注意用 .pp-input 而不是 input[type=password]：弹窗里还有两个隐藏的自动填充诱饵框
    check("弹窗里正好三个密码框",
      (await evaluate(`document.querySelectorAll('.pp-input').length`)) === 3);
    await clickByText(".pp-submit", "确认修改");
    check("空着提交 → 「请输入当前密码」",
      (await evaluate(`document.querySelector('.pp-error')?.textContent.trim() || ''`)) === "请输入当前密码");
    await fill(".pp-input", "whatever123");
    await clickByText(".pp-submit", "确认修改");
    check("只填当前密码 → 「新密码至少 6 位」",
      (await evaluate(`document.querySelector('.pp-error')?.textContent.trim() || ''`)) === "新密码至少 6 位");
    // 索引取更稳：诱饵框也是 input[type=password]，但它在一个隐藏容器里
    await evaluate(`(() => {
      const els = document.querySelectorAll('.pp-input');
      const set = (el, v) => {
        el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set(els[1], 'newpass123');
      set(els[2], 'different123');
    })()`);
    await sleep(400);
    await clickByText(".pp-submit", "确认修改");
    check("两次新密码不一致 → 有提示",
      (await evaluate(`document.querySelector('.pp-error')?.textContent.trim() || ''`)).includes("不一致"),
      await evaluate(`document.querySelector('.pp-error')?.textContent.trim() || ''`));
    await shot("security-02-password-modal.png");

    // ------------------------------------------------------------------
    console.log("\n[5] 弹窗里的「用绑定邮箱重置」");
    await clickByText(".forgot-link", "用绑定邮箱重置");
    check("改密码弹窗关掉了",
      await until(`!document.querySelector('.pp-dialog')`, 8000));
    check("打开的是登录弹窗的「找回密码」屏",
      await until(`document.querySelector('.form-title')?.textContent.trim() === '找回密码'`, 10000));
    await evaluate(`document.body.click()`);
    await sleep(300);

    // ------------------------------------------------------------------
    console.log("\n[6] 注销段开的是注销弹窗");
    await nav(`${BASE}/space/security`);
    await until(`!!document.querySelector('.sec-row--danger')`, 12000);
    // 注意别用 .sec-btn--danger —— 邮箱行的「解绑」也是红描边，会先被选中
    await clickEl(`document.querySelector('.sec-row--danger .sec-btn--danger')`);
    check("注销弹窗打开", await until(`!!document.querySelector('.dc-overlay')`, 8000));
    check("确认键默认禁用",
      await evaluate(`document.querySelector('.dc-submit')?.disabled === true`));
    await clickEl(`document.querySelector('.dc-close')`);
    check("× 能关掉", await until(`!document.querySelector('.dc-overlay')`, 8000));

    // ------------------------------------------------------------------
    console.log("\n[7] 手机 390 宽");
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await nav(`${BASE}/space/security`);
    await until(`!!document.querySelector('.sec-row--danger')`, 12000);
    const mob = await evaluate(`(() => {
      const de = document.documentElement;
      const card = document.querySelector('.sec-card').getBoundingClientRect();
      // 每一行单独量：手机上按钮不铺满，而是收在这一行的右下角
      const rows = [...document.querySelectorAll('.sec-row')].map(row => {
        const rr = row.getBoundingClientRect();
        const btns = [...row.querySelectorAll('.sec-btn')].map(b => {
          const r = b.getBoundingClientRect();
          return {
            l: Math.round(r.left), r: Math.round(r.right),
            t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width),
          };
        });
        return {
          email: row.classList.contains('sec-row--email'),
          l: Math.round(rr.left), r: Math.round(rr.right), w: Math.round(rr.width),
          t: Math.round(rr.top), btns,
        };
      });
      return { vw: de.clientWidth, scroll: de.scrollWidth, card: Math.round(card.width), rows };
    })()`);
    check("没有横向溢出", mob.scroll <= mob.vw, `${mob.scroll}/${mob.vw}`);

    const soloRows = mob.rows.filter((r) => !r.email);
    check("单按钮的行：按钮收在右下角（不铺满整行）",
      soloRows.length === 2 && soloRows.every((r) =>
        r.btns.length === 1 &&
        Math.abs(r.btns[0].r - r.r) <= 2 &&
        r.btns[0].w <= r.w * 0.6 &&
        r.btns[0].t > r.t + 10),
      JSON.stringify(soloRows.map((r) => ({ rowW: r.w, btn: r.btns[0] }))));

    const emailRow = mob.rows.find((r) => r.email);
    check("邮箱行两个按钮并排、整组贴右下",
      !!emailRow &&
        emailRow.btns.length === 2 &&
        Math.abs(emailRow.btns[1].r - emailRow.r) <= 2 &&
        emailRow.btns[0].r <= emailRow.btns[1].l + 1 &&
        Math.abs(emailRow.btns[0].t - emailRow.btns[1].t) <= 1 &&
        emailRow.btns.reduce((a, b) => a + b.w, 0) <= emailRow.w * 0.95,
      emailRow ? JSON.stringify(emailRow.btns) : "没有邮箱行");
    await shot("security-03-mobile.png");

    // 账号管理页的「保存」同样收在右下角，不再拉成一整条
    await nav(`${BASE}/space/account`);
    await until(`!!document.querySelector('.save-btn')`, 12000);
    const save = await evaluate(`(() => {
      const b = document.querySelector('.save-btn').getBoundingClientRect();
      const row = document.querySelector('.btn-row').getBoundingClientRect();
      return {
        gap: Math.round(row.right - b.right),
        w: Math.round(b.width), rowW: Math.round(row.width),
      };
    })()`);
    check("账号管理页「保存」贴在右下、不铺满",
      save.gap <= 2 && save.w < save.rowW * 0.6, JSON.stringify(save));
    // 保存键在页面最底，滚到底再截图才看得到
    await evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
    await sleep(400);
    await shot("security-03b-account-save.png");

    // ------------------------------------------------------------------
    console.log("\n[8] 暗色");
    await evaluate(`localStorage.setItem('kokomi-theme', 'dark')`);
    await evaluate(`document.documentElement.classList.add('dark')`);
    await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false });
    await nav(`${BASE}/space/security`);
    await until(`!!document.querySelector('.sec-row--danger')`, 12000);
    const dark = await evaluate(`(() => {
      const t = getComputedStyle(document.querySelector('.sec-row__title')).color;
      const d = getComputedStyle(document.querySelector('.sec-row__desc')).color;
      const card = getComputedStyle(document.querySelector('.sec-card')).backgroundColor;
      return { t, d, card };
    })()`);
    // 暗色下文字必须是亮的：把 rgb 拆开算亮度，> 120 才算浅色字
    const bright = (c) => {
      const m = c.match(/(\d+),\s*(\d+),\s*(\d+)/);
      return m ? (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 : 0;
    };
    check("暗色下标题是浅色字", bright(dark.t) > 100, dark.t);
    check("暗色下说明是浅色字", bright(dark.d) > 80, dark.d);
    check("暗色下卡片是深色底", bright(dark.card) < 90, dark.card);
    await shot("security-04-dark.png");
    await evaluate(`localStorage.setItem('kokomi-theme', 'light')`);
    await evaluate(`document.documentElement.classList.remove('dark')`);

    // ------------------------------------------------------------------
    console.log("\n[9] 回归：账号管理页不再有敏感操作");
    await nav(`${BASE}/space/account`);
    await until(`!!document.querySelector('.account-card')`, 12000);
    check("没有邮箱行", !(await evaluate(`!!document.querySelector('.sec-row--email')`)));
    check("没有注销段", !(await evaluate(`!!document.querySelector('.sec-row--danger')`)));
    check("用户名还在（资料页该有的还在）",
      (await evaluate(`document.querySelector('.username')?.textContent.trim() || ''`)) === user.username);
  } catch (e) {
    check("脚本执行未抛错", false, String((e && e.message) || e));
  } finally {
    try { proc.kill(); } catch {}
    try { ws.close(); } catch {}
    cleanup();
    console.log(`\n========== ${PASS.length} 通过 / ${FAIL.length} 失败 ==========`);
    if (FAIL.length) {
      console.log("失败项：\n  - " + FAIL.join("\n  - "));
    }
    // 必须显式退出：WebSocket 和 Edge 的句柄挂着时 node 不会自己结束，
    // 前台运行时表现为「命令一直挂到超时、且管道里的输出全丢」
    process.exit(FAIL.length ? 1 : 0);
  }
})();
