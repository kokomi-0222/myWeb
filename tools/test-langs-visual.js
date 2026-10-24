// 多语言代码块视觉效果截图（发一条临时帖 → 展开全文 → 截图 → 删帖）。
// 用法：node tools/test-langs-visual.js（需 18080 后端 + 5194 预览）
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG_PORT = 9412;
const BASE = process.env.TEST_BASE || "http://localhost:5194";
const API = process.env.TEST_API || "http://localhost:18080";
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

const api = async (method, p, body, token = TOKENS.admin) => {
  const r = await fetch(API + p, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
};

const TITLE = "多语言代码块演示";

const SAMPLES = [
  [
    "go",
    `package main

import "fmt"

func main() {
\tnums := []int{1, 2, 3}
\tfor _, n := range nums {
\t\tfmt.Println("go:", n)
\t}
}`,
  ],
  [
    "rust",
    `fn main() {
    let mut v: Vec<i32> = vec![1, 2, 3];
    v.iter().for_each(|x| println!("{}", x));
}`,
  ],
  [
    "cpp",
    `#include <iostream>

int main() {
    std::cout << "hi" << std::endl;
    return 0;
}`,
  ],
  [
    "yaml",
    `server:
  port: 8080
  profiles:
    active: prod`,
  ],
  [
    "dockerfile",
    `FROM node:22-alpine
WORKDIR /app
RUN npm ci --omit=dev
CMD ["node", "index.js"]`,
  ],
  [
    "sql",
    `SELECT id, name, created_at
FROM user
WHERE age > 18
ORDER BY id DESC
LIMIT 20;`,
  ],
];

const CONTENT =
  "挑几段不同语言看看配色。" +
  SAMPLES.map(([lang, code]) => `\n\n\`\`\`${lang}\n${code}\n\`\`\``).join("");

let tempId = null;

(async () => {
  const proc = spawn(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-proxy-server",
      `--remote-debugging-port=${DBG_PORT}`,
      "--window-size=1280,2400",
      "--user-data-dir=C:/Users/A3/AppData/Local/Temp/edge-langs-visual",
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
  const shot = async (name, w = 1280, h = 2400) => {
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
    await sleep(500);
  };

  const CARD = `[...document.querySelectorAll('.post-card')].find(c => c.querySelector('.post-card__title')?.textContent.trim() === ${JSON.stringify(TITLE)})`;

  try {
    const created = await api("POST", "/post/createPost", { title: TITLE, content: CONTENT }, TOKENS.admin);
    tempId = created?.data?.id;
    if (!tempId) throw new Error("发帖失败: " + JSON.stringify(created));

    await nav(BASE + "/");
    await evaluate(`localStorage.setItem('token', ${JSON.stringify(TOKENS.admin)})`);
    await nav(BASE + "/");
    await until(`!!(${CARD})`, 15000);

    // 展开全文（卡片默认折叠到 8 行）
    await evaluate(`(() => {
      const card = ${CARD};
      const btn = [...card.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent.trim() === '展开全文');
      if (btn) btn.click();
    })()`);
    await sleep(500);

    const info = await evaluate(`(() => {
      const card = ${CARD};
      const blocks = [...card.querySelectorAll('.content-code')];
      const uncolored = blocks.filter(b => !b.querySelector('[class^="hljs-"], [class*=" hljs-"]')).map(b => b.getAttribute('data-lang'));
      return { blocks: blocks.length, langs: blocks.map(b => b.getAttribute('data-lang')), uncolored };
    })()`);
    console.log("  代码块:", info.blocks, JSON.stringify(info.langs));
    console.log("  没有着色的:", info.uncolored.length ? info.uncolored.join(",") : "无");

    await shot("post-code-langs.png");
    await evaluate(`localStorage.setItem('kokomi-theme', 'dark')`);
    await nav(BASE + "/");
    await until(`!!(${CARD})`, 15000);
    await evaluate(`(() => {
      const card = ${CARD};
      const btn = [...card.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent.trim() === '展开全文');
      if (btn) btn.click();
    })()`);
    await sleep(500);
    await shot("post-code-langs-dark.png");
  } finally {
    if (tempId) {
      const del = await api("DELETE", "/post/" + tempId, null, TOKENS.admin);
      console.log("  临时帖子已删除:", del?.code === 200 ? "ok" : JSON.stringify(del?.code));
    }
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    proc.kill();
  }
})();
