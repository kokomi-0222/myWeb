// 验证轻提示（ElMessage）新样式：真实 toast 的 DOM/计算样式 + 四种类型对比 + 亮/暗主题
// 用法：
//   PREVIEW_ROOT=myWeb/vue/dist_toast PORT=5190 MOCK_USER=1 node local-preview.js
//   TEST_BASE=http://localhost:5190 node tools/test-toast-style.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9355;
const BASE = process.env.TEST_BASE || "http://localhost:5190";
const OUT = path.resolve(__dirname, "../shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const get = (p) =>
  new Promise((res, rej) => {
    http
      .get({ host: "127.0.0.1", port: PORT, path: p }, (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => res(JSON.parse(d)));
      })
      .on("error", rej);
  });

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const proc = spawn(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-proxy-server",
      `--remote-debugging-port=${PORT}`,
      "--window-size=1440,1000",
      "--force-device-scale-factor=2",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-toast-test",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  await sleep(2500);
  let list = [];
  for (let i = 0; i < 10; i++) {
    try {
      list = await get("/json/list");
      break;
    } catch {
      await sleep(500);
    }
  }
  const page = list.find((t) => t.type === "page");
  if (!page) {
    console.error("找不到可调试页面");
    proc.kill();
    process.exit(1);
  }

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
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem('token', 'mock-preview-token'); } catch (e) {}`,
  });

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    return r.result?.result?.value;
  };
  const waitFor = async (expr, timeout = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await evaluate(expr)) return true;
      await sleep(250);
    }
    return false;
  };
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    if (!r.result?.data) return console.log(`  截图失败: ${name}`);
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64"));
    console.log(`  截图 -> shots/${name}`);
  };
  const clickAt = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(400);
  };

  try {
    console.log(`\n[1] 打开首页 ${BASE}`);
    await send("Page.navigate", { url: `${BASE}/` });
    const ok = await waitFor("document.querySelectorAll('.post-card').length > 0", 30000);
    console.log("  列表渲染:", ok);
    if (!ok) throw new Error("列表没出来");

    // 打桩剪贴板，避免 headless 权限问题
    await evaluate(`(() => {
      try {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: () => Promise.resolve() },
        });
      } catch (e) {}
    })()`);

    console.log("\n[2] 触发一次真实提示（更多菜单 -> 分享 -> 复制链接）");
    const trig = await evaluate(`(() => {
      const el = document.querySelector('.post-card .post-card__more-trigger');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    if (!trig) throw new Error("找不到更多菜单触发器");
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: trig.x, y: trig.y, button: "none" });
    await sleep(600);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: trig.x + 4, y: trig.y + 4, button: "none" });
    await sleep(600);
    const shareRect = await evaluate(`(() => {
      const all = [...document.querySelectorAll('.more-actions-item')];
      const el = all.find((e) => e.textContent.trim() === '分享' && e.getBoundingClientRect().width > 0);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    if (shareRect) await clickAt(shareRect.x, shareRect.y);
    const toastOk = await waitFor("!!document.querySelector('.el-message')", 6000);
    console.log("  提示出现:", toastOk);

    const real = await evaluate(`(() => {
      const el = document.querySelector('.el-message');
      if (!el) return null;
      const s = getComputedStyle(el);
      const icon = el.querySelector('.el-message__icon');
      const iconEls = [...el.querySelectorAll('*')].map(e => e.className && e.className.toString()).filter(Boolean);
      const cs = el.querySelector('.el-message__content');
      return {
        cls: el.className,
        top: el.style.top,
        rect: (() => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top) }; })(),
        radius: s.borderRadius,
        bg: s.backgroundColor,
        border: s.borderColor,
        shadow: s.boxShadow.slice(0, 60),
        gap: s.gap,
        padding: s.padding,
        iconSize: icon ? Math.round(icon.getBoundingClientRect().width) : null,
        iconBg: icon ? getComputedStyle(icon).backgroundColor : null,
        iconColor: icon ? getComputedStyle(icon).color : null,
        textColor: cs ? getComputedStyle(cs).color : null,
        lineHeight: cs ? getComputedStyle(cs).lineHeight : null,
        childClasses: iconEls,
        html: el.outerHTML.slice(0, 420),
      };
    })()`);
    console.log("  真实提示:", JSON.stringify(real, null, 2));
    await shot("toast-light.png");

    // 四种类型对比：注入同结构的节点，样式来自同一套 CSS
    console.log("\n[3] 四类型对比（同结构注入）");
    await evaluate(`(() => {
      document.querySelectorAll('.ko-toast-demo').forEach(e => e.remove());
      const types = [
        ['success', '链接已复制', 'M1 8l4 4 8-8'],
        ['error', '复制失败，请手动复制地址栏链接', 'M5 5l10 10M15 5L5 15'],
        ['warning', '请先登录再操作', 'M10 3v9M10 15.5v.5'],
        ['info', '已保存修改', 'M10 9v6M10 5.5v.5'],
      ];
      types.forEach(([type, text], i) => {
        const d = document.createElement('div');
        d.className = 'el-message kokomi-toast el-message--' + type + ' ko-toast-demo';
        d.style.cssText = 'top:' + (90 + i * 54) + 'px;z-index:3000;left:0;right:0;margin:0 auto;';
        d.innerHTML = '<span class="el-message__icon el-message-icon--' + type + '">' +
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="' + ['M4 10.5l4 4 8-9','M6 6l8 8M14 6l-8 8','M10 4v8M10 14.5v1','M10 9v6M10 5v.5'][i] + '"/></svg></span>' +
          '<p class="el-message__content">' + text + '</p>';
        document.body.appendChild(d);
      });
      return document.querySelectorAll('.ko-toast-demo').length;
    })()`).then((n) => console.log("  注入节点:", n));
    await sleep(500);
    await shot("toast-types-light.png");

    console.log("\n[4] 切暗色");
    await evaluate(`document.documentElement.classList.add('dark')`);
    await sleep(800);
    const dark = await evaluate(`(() => {
      const el = document.querySelector('.ko-toast-demo');
      const s = getComputedStyle(el);
      const icon = el.querySelector('.el-message__icon');
      return { bg: s.backgroundColor, border: s.borderColor, shadow: s.boxShadow.slice(0, 50),
               text: getComputedStyle(el.querySelector('.el-message__content')).color,
               iconBg: getComputedStyle(icon).backgroundColor };
    })()`);
    console.log("  暗色:", JSON.stringify(dark));
    await shot("toast-types-dark.png");

    console.log("\n[5] 连续触发同一条提示，检查合并角标");
    await evaluate(`(() => {
      document.documentElement.classList.remove('dark');
      document.querySelectorAll('.ko-toast-demo').forEach(e => e.remove());
      document.querySelectorAll('.el-message').forEach(e => e.remove());
    })()`);
    await sleep(400);
    // 连点三次「分享」，grouping 应把三条合成一条 + 角标 3
    for (let i = 0; i < 3; i++) {
      const t = await evaluate(`(() => {
        const el = document.querySelector('.post-card .post-card__more-trigger');
        const b = el.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      })()`);
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: t.x, y: t.y, button: "none" });
      await sleep(450);
      const s = await evaluate(`(() => {
        const all = [...document.querySelectorAll('.more-actions-item')];
        const el = all.find((e) => e.textContent.trim() === '分享' && e.getBoundingClientRect().width > 0);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      })()`);
      if (s) await clickAt(s.x, s.y);
      await sleep(200);
    }
    await sleep(400);
    const grouped = await evaluate(`(() => {
      const msgs = [...document.querySelectorAll('.el-message')];
      const badge = document.querySelector('.el-message__badge .el-badge__content');
      return {
        count: msgs.length,
        texts: msgs.map((m) => m.textContent.trim()),
        badgeText: badge ? badge.textContent.trim() : null,
        badgeBg: badge ? getComputedStyle(badge).backgroundColor : null,
      };
    })()`);
    console.log("  合并结果:", JSON.stringify(grouped));
    await shot("toast-grouped.png");

    const pass =
      real &&
      real.radius === "12px" &&
      real.iconSize === 22 &&
      real.top === "76px" &&
      String(real.cls).includes("kokomi-toast") &&
      dark.bg !== real.bg;
    console.log(pass ? "\n✅ 通过：提示已套用新样式（圆角 12 / 图标 22 / 顶栏下方 offset 76 / 亮暗分离）" : "\n⚠️ 部分样式未生效，看上面实际值");
    process.exitCode = pass ? 0 : 2;
  } catch (e) {
    console.error("\n测试异常:", e.message);
    await shot("toast-error.png").catch(() => {});
    process.exitCode = 1;
  } finally {
    try {
      ws.close();
    } catch {}
    proc.kill();
  }
})();
