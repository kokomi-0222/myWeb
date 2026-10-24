/**
 * 本地预览：静态托管 vue/dist + 把 /api 反代到本地后端（剥掉前缀，和线上 nginx 一致）。
 *
 * 用法：
 *   PREVIEW_ROOT=vue/dist UPSTREAM=http://127.0.0.1:18080 PORT=5194 node tools/preview.js
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(process.env.PREVIEW_ROOT || "vue/dist");
const UPSTREAM = new URL(process.env.UPSTREAM || "http://127.0.0.1:18080");
const PORT = Number(process.env.PORT || 5194);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function proxy(req, res) {
  // /api/post/1 → /post/1
  const target = req.url.replace(/^\/api/, "") || "/";
  const opts = {
    hostname: UPSTREAM.hostname,
    port: UPSTREAM.port,
    path: target,
    method: req.method,
    headers: { ...req.headers, host: UPSTREAM.host },
  };
  const up = http.request(opts, (ur) => {
    res.writeHead(ur.statusCode, ur.headers);
    ur.pipe(res);
  });
  up.on("error", (e) => {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end("upstream error: " + e.message);
  });
  req.pipe(up);
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("404");
      return;
    }
    res.writeHead(200, {
      "content-type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(buf);
  });
}

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    if (url.startsWith("/api/")) return proxy(req, res);
    if (url.startsWith("/upload/")) return proxy(req, res);

    const filePath = path.join(ROOT, url === "/" ? "index.html" : url);
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end("403");
      return;
    }
    fs.stat(filePath, (err, st) => {
      if (!err && st.isFile()) return serveFile(res, filePath);
      // SPA history 回退
      serveFile(res, path.join(ROOT, "index.html"));
    });
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`preview ${ROOT} on http://127.0.0.1:${PORT}  ->  ${UPSTREAM.origin}`);
  });
