// 验证生产构建的控制台策略：
//   1) 欢迎语要打印（走 utils/logger 的 log()，绕过 esbuild.pure）
//   2) 断网等真实异常要打印（request.js 的 logError）
//   3) 普通业务调试 log 不应出现
// 用法：PREVIEW_ROOT=myWeb/vue/dist_log PORT=5197 MOCK_USER=1 MOCK_POST=1 node local-preview.js
//       TEST_BASE=http://localhost:5197 node tools/test-console-keep.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9375;
const BASE = process.env.TEST_BASE || "http://localhost:5197";
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
  const proc = spawn(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-proxy-server",
      `--remote-debugging-port=${PORT}`,
      "--window-size=1440,1000",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-console-keep-test",
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
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  let logs = [];
  let currentPhase = "启动";
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
    if (m.method === "Runtime.consoleAPICalled") {
      const type = m.params.type;
      const text = (m.params.args || [])
        .map((a) => a.value ?? a.description ?? a.type)
        .join(" ")
        .slice(0, 240);
      logs.push({ type, text, phase: currentPhase });
    }
  });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem('token', 'mock-preview-token'); } catch (e) {}`,
  });

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    return r.result?.result?.value;
  };

  // ---------- 1) 正常访问，看欢迎语 ----------
  currentPhase = "首页";
  await send("Page.navigate", { url: BASE + "/" });
  await sleep(3500);

  const welcome = logs.filter((l) => l.type === "log" && l.text.includes("kokomi的小窝"));
  const otherLogs = logs.filter(
    (l) => (l.type === "log" || l.type === "info" || l.type === "debug") && !l.text.includes("kokomi的小窝")
  );
  console.log("\n===== 1. 欢迎语 =====");
  console.log("欢迎语条数:", welcome.length);
  if (welcome.length) console.log("  内容首行:", welcome[0].text.split("\n")[0]);
  console.log("其他 log/info/debug 条数:", otherLogs.length);
  otherLogs.slice(0, 10).forEach((l) => console.log("  [" + l.phase + "]", l.type, "|", l.text));

  // ---------- 2) 断网触发真实异常 ----------
  logs = [];
  currentPhase = "断网触发请求";
  await send("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  // 点排序 tab 触发一次列表请求
  await evaluate(`(() => {
    const tabs = document.querySelectorAll('.sort-tab');
    if (tabs.length > 1) { tabs[1].click(); return 'clicked'; }
    return 'no-tab';
  })()`);
  await sleep(2500);

  const errs = logs.filter((l) => l.type === "error" || l.type === "warning");
  console.log("\n===== 2. 断网后的异常输出 =====");
  console.log("error/warning 条数:", errs.length);
  errs.slice(0, 8).forEach((l) => console.log("  ", l.type, "|", l.text));

  // 恢复网络
  await send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });

  // ---------- 3) 回归：正常浏览不产生 log ----------
  logs = [];
  currentPhase = "回归";
  await send("Page.navigate", { url: BASE + "/post/1000" });
  await sleep(3000);
  await send("Page.navigate", { url: BASE + "/" });
  await sleep(2500);
  const regLogs = logs.filter((l) => (l.type === "log" || l.type === "info") && !l.text.includes("kokomi的小窝"));
  console.log("\n===== 3. 回归（详情页 + 首页）=====");
  console.log("额外 log/info 条数:", regLogs.length);
  regLogs.slice(0, 10).forEach((l) => console.log("  ", l.type, "|", l.text));

  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, "console-keep-home.png"), Buffer.from(shot.result.data, "base64"));

  const okWelcome = welcome.length > 0;
  const okError = errs.some((l) => l.text.includes("网络请求"));
  const okQuiet = otherLogs.length === 0 && regLogs.length === 0;

  console.log("\n===== 结论 =====");
  console.log("欢迎语保留:", okWelcome ? "✅" : "❌");
  console.log("异常打印:", okError ? "✅" : "❌");
  console.log("业务调试日志已清:", okQuiet ? "✅" : "❌");

  ws.close();
  proc.kill();
  process.exit(okWelcome && okError && okQuiet ? 0 : 1);
})().catch((e) => {
  console.error("失败:", e);
  process.exit(1);
});
