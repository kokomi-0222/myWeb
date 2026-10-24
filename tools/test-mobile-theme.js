// 移动端（390x844）暗色主题验证：抽屉里的「浅色 / 深色」分段控件
// 用法：
//   1) 本地后端跑在 18080
//   2) PREVIEW_ROOT=myWeb/vue/dist UPSTREAM=http://127.0.0.1:18080 PORT=5194 node local-preview.js
//   3) TEST_BASE=http://localhost:5194 node tools/test-mobile-theme.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9391;
const BASE = process.env.TEST_BASE || "http://localhost:5194";
const OUT = path.resolve(__dirname, "../shots");
const TOKENS = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../shots/tmp/tokens.json"), "utf-8")
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-proxy-server",
      `--remote-debugging-port=${DBG_PORT}`,
      "--window-size=390,844",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-mobile-theme-test",
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
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "light" }],
  });

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.result?.exceptionDetails) {
      console.log("  [JS ERROR]", r.result.exceptionDetails.text);
    }
    return r.result?.result?.value;
  };
  const shot = async (name) => {
    // 把鼠标挪到抽屉外，否则刚点过的菜单项会残留 hover 底色，截图上像「选中态」
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 385, y: 830, button: "none" });
    await sleep(220);
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64"));
    console.log("  截图 -> shots/" + name);
  };
  const clickAt = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await sleep(60);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  };
  const clickByExpr = async (findExpr) => {
    const p = await evaluate(`(() => {
      const el = (${findExpr});
      if (!el) return null;
      const b = el.getBoundingClientRect();
      if (!b.width) return null;
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    if (!p) return false;
    await clickAt(p.x, p.y);
    return true;
  };

  // 方案 A：「深色模式」是一个普通菜单项，直接点它切换
  const themeItem = `document.querySelector('.drawer-nav__item--theme')`;

  const state = () =>
    evaluate(`(() => {
      return {
        dark: document.documentElement.classList.contains('dark'),
        stored: localStorage.getItem('kokomi-theme'),
        // 顶栏那个纯图标按钮应该已经删掉了
        topbarThemeBtn: !!document.querySelector('.mobile-theme-button'),
        // 旧的「外观分段控件」必须彻底不存在
        legacySeg: !!document.querySelector('.drawer-theme'),
        themeItem: (() => {
          const el = document.querySelector('.drawer-nav__item--theme');
          if (!el) return null;
          const st = el.querySelector('.theme-state');
          const items = [...document.querySelectorAll('.drawer-nav > *')];
          const i = items.indexOf(el);
          const r = el.getBoundingClientRect();
          return {
            text: el.textContent.replace(/\\s+/g, ''),
            stateText: st ? st.textContent.trim() : null,
            stateColor: st ? getComputedStyle(st).color : null,
            isOn: el.classList.contains('is-on'),
            // 与普通菜单项同高，视觉上完全同构
            height: Math.round(r.height),
            sameAsNeighbor: (() => {
              const other = items[i - 1];
              if (!other) return null;
              return Math.round(other.getBoundingClientRect().height) === Math.round(r.height);
            })(),
            // 位置：紧挨在「退出登录」之前，「退出登录」仍是最末一项
            beforeLogout: !!items[i + 1]?.classList.contains('drawer-nav__item--danger'),
            logoutIsLast: !!items[items.length - 1]?.classList.contains('drawer-nav__item--danger'),
          };
        })(),
        drawerOpen: !!document.querySelector('.mobile-drawer.open'),
        navOrder: [...document.querySelectorAll('.drawer-nav > *')].map((el) =>
          el.textContent.replace(/\\s+/g, '').trim()
        ),
        noHScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
        barBg: getComputedStyle(document.querySelector('.header-bar-mobile')).backgroundColor,
      };
    })()`);

  // 用管理员身份进，抽屉里才会同时出现「管理后台」和「退出登录」，
  // 才能验证外观控件确实排在它们后面
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem('token', ${JSON.stringify(TOKENS.admin)}); } catch (e) {}`,
  });

  // ---------- 1. 首次进入（浅色），打开抽屉 ----------
  console.log("\n[1] 小屏首页 · 首次进入 → 打开抽屉");
  await send("Page.navigate", { url: BASE + "/" });
  await sleep(2500);
  await evaluate(`localStorage.removeItem('kokomi-theme')`);
  await send("Page.reload", { ignoreCache: true });
  await sleep(3500);
  console.log("  顶栏（抽屉关闭）:", JSON.stringify(await state()));
  await shot("mobile-theme-1-topbar.png");
  console.log("  点汉堡:", await clickByExpr(`document.querySelector('.mobile-menu-toggle')`));
  await sleep(700);
  console.log("  ", JSON.stringify(await state()));
  await shot("mobile-theme-2-drawer-light.png");

  // ---------- 2. 点「深色模式」 ----------
  console.log("\n[2] 抽屉里点「深色模式」菜单项");
  console.log("  clicked:", await clickByExpr(themeItem));
  await sleep(700);
  console.log("  ", JSON.stringify(await state()));
  await shot("mobile-theme-3-drawer-dark.png");

  // ---------- 3. 关抽屉看首页 ----------
  console.log("\n[3] 关闭抽屉，看首页暗色");
  // overlay 铺满全屏，但中间会被抽屉本体盖住，必须点右侧露出来的那条
  const ov = await evaluate(`(() => {
    const b = document.querySelector('.drawer-overlay').getBoundingClientRect();
    return { x: b.right - 30, y: b.height / 2 };
  })()`);
  await clickAt(ov.x, ov.y);
  await sleep(600);
  console.log("  ", JSON.stringify(await state()));
  await shot("mobile-theme-4-home-dark.png");

  // ---------- 4. F5 持久化 ----------
  console.log("\n[4] F5 刷新，验证持久化");
  await send("Page.reload", { ignoreCache: false });
  await sleep(3200);
  console.log("  ", JSON.stringify(await state()));
  await shot("mobile-theme-5-dark-after-reload.png");

  // ---------- 5. 切回浅色 ----------
  console.log("\n[5] 再进抽屉点「深色模式」切回浅色");
  await clickByExpr(`document.querySelector('.mobile-menu-toggle')`);
  await sleep(700);
  console.log("  clicked:", await clickByExpr(themeItem));
  await sleep(700);
  console.log("  ", JSON.stringify(await state()));
  await shot("mobile-theme-6-drawer-light-again.png");

  ws.close();
  proc.kill();
  process.exit(0);
})();
