/**
 * 控制台输出约定（2026-10-22）
 *
 * vite.config.js 里配了 esbuild.pure: ['console.log', 'console.info', 'console.debug']，
 * 生产构建会把这类「纯调试输出」整句删掉，所以分三类处理：
 *
 *  1. 临时调试：直接写 console.log(...)，上线自动消失，不用手动清理，不会刷屏；
 *  2. 可预期异常：直接写 console.warn / console.error（这两类没被 pure 处理，产物里保留）；
 *  3. 必须保留的非异常输出（控制台欢迎语等）：用本文件的 log()。
 *
 * 为什么 log() 能活下来：esbuild 的 pure 只匹配「callee 恰好是 console.log」的直接调用。
 * 这里通过 .apply 间接调用，不在匹配范围内，因此不会被剔除。
 */

export function log(...args) {
  console.log.apply(console, args)
}

export function logWarn(...args) {
  console.warn.apply(console, args)
}

/**
 * 统一的错误输出：把前端最容易漏掉的信息（请求地址、HTTP 状态、响应体、堆栈）一次性打全，
 * 免得线上只剩一句「加载失败」却不知道是哪个接口。
 *
 * @param {string} tag 业务位置标签，如 '加载评论'
 * @param {unknown} err 捕获到的错误对象
 */
export function logError(tag, err) {
  const ctx = {}
  const res = err?.response
  const cfg = res?.config || err?.config

  if (cfg?.url) {
    ctx.url = cfg.url
    ctx.method = (cfg.method || 'get').toUpperCase()
  }
  if (res) {
    ctx.status = res.status
    ctx.body = res.data
  } else if (err?.code) {
    // Network Error / ECONNABORTED 之类没有 response 的情况
    ctx.code = err.code
  }

  console.error(`[${tag}]`, err?.message || err, ctx, err?.stack || '')
}
