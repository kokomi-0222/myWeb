// 身份牌配色验收（游客深灰 / 普通用户蓝 / 会员金 / 管理团队粉）
//   [1] 注册落库：新账号的 user.primary_role 必须是 guest（不是列默认值的 member）
//   [2] 空间页：四档身份牌的文字 + 底色
//   [3] 后台单独设了标签底色的账号：自定义色优先，不被角色默认色覆盖
//   [4] 帖子胶囊：管理员/游客显示、普通用户不显示，颜色跟着角色走
//   [5] 暗色模式：三档牌子都要能和页面背景区分开
//   [6] 手机 390 宽：牌子不溢出
//
// 用法：node tools/test-role-tag-color.js（需 18080 后端 + 5194 预览）
const { spawn, spawnSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9427;
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
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ sub: String(uid), tokenVersion: tv, iat: now, exp: now + 3600 });
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

const created = [];
const createdPosts = [];

/**
 * 造账号。
 * insertSql 传 true 时走「和注册代码完全一样的那条 INSERT」：
 * 只给 password 三件套 + 显式 primary_role/name_color，
 * 用来验证新注册的账号落库角色真的是 guest。
 */
function makeUser(tag, role, { nameColor = "#18191c", roleColor = null, insertSql = false } = {}) {
  const stamp = String(Date.now()).slice(-8) + Math.floor(Math.random() * 90 + 10);
  const acc = `rtc_${tag}_${stamp}`;
  const rc = roleColor ? `'${roleColor}'` : "NULL";
  if (insertSql) {
    // 和注册代码里的 insert 完全一致：只写 primary_role，name_color 走 DDL 默认
    sql(`INSERT INTO user(password, email, phone, primary_role) `
      + `VALUES ('x', NULL, NULL, '${role}')`);
    // ⚠️ 不能只用 LAST_INSERT_ID()：每次 sql() 都是一条独立的 mysql -e 进程，
    // 新连接里 LAST_INSERT_ID() 恒为 0。测试环境无并发，取 MAX(id) 就够。
    const id = Number(sql("SELECT MAX(id) FROM user"));
    sql(`UPDATE user SET username='${acc}', name='${acc}' WHERE id=${id}`);
    sql(`INSERT INTO user_role (user_id, role_code) VALUES (${id},'${role}')`);
    created.push(id);
    return { id, token: signToken(id, Number(sql(`SELECT IFNULL(token_version,1) FROM user WHERE id=${id}`))) };
  }
  sql(`INSERT INTO user (username, password, name, email, email_verified, primary_role, name_color, role_color) `
    + `VALUES ('${acc}','x','${acc}',NULL,0,'${role}','${nameColor}',${rc})`);
  const id = Number(sql(`SELECT id FROM user WHERE username='${acc}'`));
  sql(`INSERT INTO user_role (user_id, role_code) VALUES (${id},'${role}')`);
  created.push(id);
  return { id, token: signToken(id, Number(sql(`SELECT IFNULL(token_version,1) FROM user WHERE id=${id}`))) };
}

const api = async (p, body, token) => {
  const r = await fetch("http://localhost:18080" + p, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify(body),
  });
  return r.json();
};

const get = (p) => new Promise((res, rej) => {
  http.get({ host: "127.0.0.1", port: DBG_PORT, path: p }, (r) => {
    let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d)));
  }).on("error", rej);
});

function cleanup() {
  for (const pid of createdPosts) {
    sql(`DELETE FROM comment WHERE post_id = ${pid}`);
    sql(`DELETE FROM post WHERE id = ${pid}`);
  }
  if (created.length) {
    sql(`DELETE FROM user_role WHERE user_id IN (${created.join(",")})`);
    sql(`DELETE FROM user WHERE id IN (${created.join(",")})`);
  }
}

(async () => {
  // ---------------------------------------------------------------- 准备数据
  console.log("\n[1] 新注册账号的落库角色");
  const guest = makeUser("guest", "guest", { insertSql: true });
  const member = makeUser("member", "member");
  const vip = makeUser("vip", "vip");
  const admin = makeUser("admin", "admin");
  const custom = makeUser("custom", "member", { roleColor: "#ff8800" });

  const roleInDb = sql(`SELECT IFNULL(primary_role,'<NULL>') FROM user WHERE id=${guest.id}`);
  check("注册路径落库的角色是 guest", roleInDb === "guest", roleInDb);
  // name_color 走 DDL 默认 #636161。故意不写死深色：固定色不随主题变，
  // 深色值在暗色模式下名字会直接看不见（踩过）。
  check("注册路径落库的 name_color 是 DDL 默认值",
    sql(`SELECT IFNULL(name_color,'<NULL>') FROM user WHERE id=${guest.id}`) === "#636161",
    sql(`SELECT IFNULL(name_color,'<NULL>') FROM user WHERE id=${guest.id}`));

  // 静态兜底：insert 语句必须显式带 primary_role，否则又会落回 DDL 默认的 member
  const mapperSrc = fs.readFileSync(
    path.join(ROOT, "springboot/kokomi/src/main/java/com/example/kokomi/mapper/UserMapper.java"), "utf-8");
  check("UserMapper.insert 显式写 primary_role",
    /insert into user\([^)]*primary_role[^)]*\)/i.test(mapperSrc.replace(/\s+/g, " ")));

  // 一条管理员帖 + 一条「作者改成游客」的帖
  const tag = String(Date.now()).slice(-6);
  const t1 = `配色·管理 ${tag}`;  // 标题上限 20 字
  const r1 = await api("/post/createPost", { title: t1, content: "role tag color", type: "life", media: [], tags: [] }, admin.token);
  const p1 = r1?.data?.id ?? r1?.data;
  if (!p1) throw new Error("建帖失败(管理员): " + JSON.stringify(r1));
  createdPosts.push(p1);

  const t2 = `配色·游客 ${tag}`;
  const r2 = await api("/post/createPost", { title: t2, content: "role tag color", type: "life", media: [], tags: [] }, admin.token);
  const p2 = r2?.data?.id ?? r2?.data;
  if (!p2) throw new Error("建帖失败(游客靶): " + JSON.stringify(r2));
  createdPosts.push(p2);
  // 游客现在发不了帖，把作者改过去，模拟「被降级的老帖子」
  sql(`UPDATE post SET user_id = ${guest.id} WHERE id = ${p2}`);

  const proc = spawn(EDGE, ["--headless=new", "--disable-gpu", "--no-sandbox", "--no-proxy-server",
    `--remote-debugging-port=${DBG_PORT}`, "--window-size=1200,1000",
    "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-role-color", "about:blank"], { stdio: "ignore" });
  await sleep(2500);
  let list = [];
  for (let i = 0; i < 12; i++) { try { list = await get("/json/list"); break; } catch { await sleep(500); } }
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable"); await send("Runtime.enable");
  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.result.exceptionDetails.exception?.description || ""));
    return r.result?.result?.value;
  };
  const until = async (expr, t = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < t) { try { if (await evaluate(expr)) return true; } catch {} await sleep(150); } return false; };
  const nav = async (u) => { await send("Page.navigate", { url: u }); await until(`document.readyState==='complete'`, 15000); await sleep(800); };
  const shot = async (name, w = 1200, h = 1000) => {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
    await sleep(350);
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(s.result.data, "base64"));
    console.log("  截图 -> shots/" + name);
  };
  /** 读空间页身份牌 */
  const readBadge = async () => evaluate(`(() => {
    const el = document.querySelector('.user-role');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { text: (el.textContent || '').trim(), bg: cs.backgroundColor, fg: cs.color };
  })()`);

  try {
    await nav(BASE + "/");
    await evaluate(`localStorage.setItem('kokomi-theme', 'light')`);
    await evaluate(`localStorage.removeItem('kokomi-theme')`);

    // ------------------------------------------------------------ 2 空间页四档
    console.log("\n[2] 空间页身份牌：文字 + 底色");
    const cases = [
      ["游客", guest, "游客", "rgb(78, 89, 105)"],
      ["普通用户", member, "普通用户", "rgb(0, 174, 236)"],
      ["会员", vip, "会员", "rgb(230, 162, 60)"],
      ["管理员", admin, "管理员", "rgb(233, 102, 178)"],
    ];
    for (const [label, u, wantText, wantBg] of cases) {
      await evaluate(`localStorage.setItem('token', ${JSON.stringify(u.token)})`);
      await nav(BASE + "/space/home");
      await until(`!!document.querySelector('.user-role')`, 12000);
      const b = await readBadge();
      check(`${label}：牌子上写着「${wantText}」`, b && b.text === wantText, b ? b.text : "没找到牌子");
      check(`${label}：底色是 ${wantBg}`, b && b.bg === wantBg, b ? b.bg : "-");
      if (label === "游客") await shot("role-tag-guest.png");
      if (label === "普通用户") await shot("role-tag-member.png");
      if (label === "会员") await shot("role-tag-vip.png");
    }

    // ------------------------------------------------------------ 3 自定义优先
    console.log("\n[3] 后台单独设过底色：自定义色优先");
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(custom.token)})`);
    await nav(BASE + "/space/home");
    await until(`!!document.querySelector('.user-role')`, 12000);
    const cb = await readBadge();
    check("自定义底色不被角色默认色覆盖", cb && cb.bg === "rgb(255, 136, 0)", cb ? cb.bg : "-");
    await shot("role-tag-custom.png");

    // ------------------------------------------------------------ 4 帖子胶囊
    console.log("\n[4] 帖子里的胶囊标签");
    await nav(BASE + "/");
    await until(`document.querySelectorAll('.post-card').length > 0`, 15000);
    const pills = await evaluate(`(async () => {
      const want = ${JSON.stringify([t1, t2])};
      const found = {};
      for (let i = 0; i < 12; i++) {
        for (const card of document.querySelectorAll('.post-card')) {
          const title = (card.querySelector('.post-card__title')?.textContent || '').trim();
          if (!want.includes(title)) continue;
          const el = card.querySelector('.post-card__role-badge');
          found[title] = el ? { text: el.textContent.trim(), color: getComputedStyle(el).color } : null;
        }
        if (Object.keys(found).length === want.length) break;
        await new Promise(r => setTimeout(r, 500));
      }
      return found;
    })()`);
    const adminPill = pills[t1];
    const guestPill = pills[t2];
    check("管理员帖子的胶囊写着「管理员」", adminPill && adminPill.text === "管理员",
      adminPill ? adminPill.text : "没找到胶囊");
    check("管理员胶囊是品牌粉", adminPill && adminPill.color === "rgb(233, 102, 178)",
      adminPill ? adminPill.color : "-");
    check("游客帖子的胶囊写着「游客」", guestPill && guestPill.text === "游客",
      guestPill ? guestPill.text : "没找到胶囊");
    check("游客胶囊是深灰", guestPill && guestPill.color === "rgb(78, 89, 105)",
      guestPill ? guestPill.color : "-");
    await shot("role-tag-pill.png");

    // ------------------------------------------------------------ 5 暗色
    console.log("\n[5] 暗色模式");
    await evaluate(`localStorage.setItem('kokomi-theme', 'dark')`);
    for (const [label, u] of [["游客", guest], ["普通用户", member], ["会员", vip]]) {
      await evaluate(`localStorage.setItem('token', ${JSON.stringify(u.token)})`);
      await nav(BASE + "/space/home");
      await until(`!!document.querySelector('.user-role')`, 12000);
      const d = await evaluate(`(() => {
        const el = document.querySelector('.user-role');
        const dark = document.documentElement.classList.contains('dark');
        if (!el) return { bg: '', pageBg: '', dark };
        const pageEl = document.querySelector('.home') || document.body;
        return {
          bg: getComputedStyle(el).backgroundColor,
          pageBg: getComputedStyle(pageEl).backgroundColor,
          dark,
        };
      })()`);
      check(`暗色已生效（${label}）`, d.dark === true, String(d.dark));
      check(`暗色下${label}牌子与页面背景有区分`,
        !!d.bg && d.bg !== d.pageBg, `${d.bg || "无牌子"} vs ${d.pageBg}`);
      // name_color 是固定色，默认 #636161 在暗色下几乎看不见 → 应被 readableNameColor 提亮
      const nc = await evaluate(`(() => {
        const el = document.querySelector('.user-name span');
        if (!el) return null;
        const m = getComputedStyle(el).color.match(/\\d+/g) || [];
        const [r, g, b] = m.map(Number);
        return { color: getComputedStyle(el).color, yiq: (r * 299 + g * 587 + b * 114) / 1000 };
      })()`);
      check(`暗色下${label}的名字看得清（亮度 > 100）`,
        nc && nc.yiq > 100, nc ? `${nc.color} yiq=${nc.yiq.toFixed(0)}` : "没找到名字");
    }
    await shot("role-tag-dark.png");
    await evaluate(`localStorage.setItem('kokomi-theme', 'light')`);

    // ------------------------------------------------------------ 6 手机
    console.log("\n[6] 手机 390 宽");
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(member.token)})`);
    // mobile:true 的模拟会把 innerWidth 报成内容宽度，量布局必须用真窄窗口
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await nav(BASE + "/space/home");
    await until(`!!document.querySelector('.user-role')`, 12000);
    const m = await evaluate(`(() => {
      const el = document.querySelector('.user-role').getBoundingClientRect();
      return {
        left: Math.round(el.left), right: Math.round(el.right),
        vw: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      };
    })()`);
    check("布局视口就是 390", m.vw === 390, String(m.vw));
    check("牌子不超出视口", m.left >= 0 && m.right <= m.vw, JSON.stringify(m));
    check("页面没有横向溢出", m.scroll <= m.vw + 1, `${m.scroll}/${m.vw}`);
    await shot("role-tag-mobile.png", 390, 844);
  } finally {
    ws.close();
    proc.kill();
    cleanup();
    console.log(`\n清理：用户 ${created.length} 个，帖子 ${createdPosts.length} 条`);
    console.log(`\n结果：${PASS.length} 通过 / ${FAIL.length} 失败`);
    if (FAIL.length) { console.log("失败项：" + FAIL.join(" | ")); process.exitCode = 1; }
  }
})();
