// 检查生产构建在浏览器控制台里的输出（应只剩 error/warn，没有 log）
// 用法：PREVIEW_ROOT=myWeb/vue/dist_nolog PORT=5196 MOCK_USER=1 MOCK_POST=1 node local-preview.js
//       TEST_BASE=http://localhost:5196 node tools/test-console-clean.js
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9373;
const BASE = process.env.TEST_BASE || "http://localhost:5196";
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
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-console-clean-test",
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
  const logs = [];
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
        .slice(0, 200);
      const stack = m.params.stackTrace?.callFrames?.[0];
      logs.push({
        type,
        text,
        where: stack ? `${stack.functionName || "(anonymous)"} @ ${stack.url.split("/").pop()}:${stack.lineNumber}` : "",
        phase: currentPhase,
      });
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

  let currentPhase = "启动";
  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    return r.result?.result?.value;
  };
  const goto = async (url, phase, wait = 2500) => {
    currentPhase = phase;
    await send("Page.navigate", { url });
    await sleep(wait);
  };

  // 1. 首页
  await goto(BASE + "/", "首页");
  // 2. 搜索（触发列表请求）
  await goto(BASE + "/?keyword=%E7%81%AF%E5%A1%94&type=content", "搜索结果");
  // 3. 详情页
  await goto(BASE + "/post/1000", "帖子详情", 3000);
  // 4. 个人空间
  await goto(BASE + "/space/home", "动态管理", 3000);
  // 5. 消息中心
  await goto(BASE + "/space/message", "消息中心", 3000);
  // 6. 他人主页
  await goto(BASE + "/user/2", "他人主页", 3000);

  // 抓一张详情页截图，确认页面本身没坏
  await goto(BASE + "/", "回首页", 2500);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, "console-clean-home.png"), Buffer.from(shot.result.data, "base64"));

  const byType = {};
  logs.forEach((l) => (byType[l.type] = (byType[l.type] || 0) + 1));

  console.log("\n===== 控制台输出汇总 =====");
  console.log("按类型:", JSON.stringify(byType));
  const logsOnly = logs.filter((l) => l.type === "log" || l.type === "debug" || l.type === "info");
  console.log("log/info/debug 条目数:", logsOnly.length);
  if (logsOnly.length) {
    logsOnly.slice(0, 20).forEach((l) => console.log("  [" + l.phase + "]", l.type, "|", l.text));
  }

  const others = logs.filter((l) => l.type !== "log" && l.type !== "debug" && l.type !== "info");
  if (others.length) {
    console.log("\n其余消息（error/warn 等）:");
    others.slice(0, 20).forEach((l) => console.log("  [" + l.phase + "]", l.type, "|", l.text, "|", l.where));
  }

  console.log("\n结论:", logsOnly.length === 0 ? "通过：无任何 log 输出" : "未通过：仍有 " + logsOnly.length + " 条 log");

  ws.close();
  proc.kill();
  process.exit(0);
})().catch((e) => {
  console.error("失败:", e);
  process.exit(1);
});
