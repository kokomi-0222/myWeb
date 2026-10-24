// 把 shots/theme-schemes.html 渲染成一张对比长图
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9394;
const OUT = path.resolve(__dirname, "../shots");
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
      "--hide-scrollbars",
      `--remote-debugging-port=${DBG_PORT}`,
      "--window-size=2020,1500",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-theme-schemes",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  await sleep(2500);
  let list = [];
  for (let i = 0; i < 14; i++) {
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

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const id = ++seq;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });

  await new Promise((r) => (ws.onopen = r));
  await send("Page.enable");
  await send("Runtime.enable");

  const url = "file:///" + path.resolve(__dirname, "../shots/theme-schemes.html").replace(/\\/g, "/");
  await send("Page.navigate", { url });
  await sleep(1600);

  const { result } = await send("Runtime.evaluate", {
    expression: `(() => {
      const d = document.documentElement;
      return { w: d.scrollWidth, h: d.scrollHeight,
               schemes: document.querySelectorAll('.drawer').length };
    })()`,
    returnByValue: true,
  });
  const { w, h, schemes } = result.value;
  console.log("页面尺寸", w, "x", h, "| 抽屉数", schemes);

  const shot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: w, height: h, scale: 1 },
  });
  const out = path.join(OUT, "theme-schemes.png");
  fs.writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log("已保存", out, (fs.statSync(out).size / 1024).toFixed(0) + "KB");

  ws.close();
  proc.kill();
  process.exit(0);
})();
