"""验证码有效期实测：从「发信那一刻」开始数，看它在 1 分钟 / 9 分钟 / 10 分 40 秒时还能不能用。

为什么需要这个脚本：
  邮件正文写的是「10 分钟内有效」，但那个计时起点是**服务端发信的时刻**
  （EmailCodeCache.issue() 里 expireAt = now + 10min），不是用户「打开邮箱看到码」的时刻。
  国内邮箱（尤其 QQ）首封投递有秒级到分钟级延迟，用户实际能用到的窗口就比 10 分钟短。
  这个脚本把「服务端到底给多久」量出来，把投递延迟的影响和代码问题分开。

用法（需本地后端跑在 18080，且 SMTP 未配置 → dev-echo 才会回 devCode，不会真发信）：
    cd tools && python check-code-ttl.py
耗时：约 11 分钟（最长那档要等满 10 分 40 秒）。中途可以 Ctrl+C，前面的结果会先打出来。
"""
import json
import sys
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:18080"
STAMP = int(time.time())


def post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        BASE + path, data=data,
        headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode("utf-8") or "{}")


def send_code(email):
    body = post("/user/register/email-code", {"email": email})
    data = body.get("data") or {}
    return data.get("devCode"), body


def verify(email, code):
    return post("/user/register/verify-email", {"email": email, "code": code})


def main():
    # 三档各自独立邮箱，互不影响（每档的码都会被消费或过期，不能共用一个邮箱）
    cases = [
        ("1 分钟", 60),
        ("9 分钟", 9 * 60),
        ("10 分 40 秒", 10 * 60 + 40),
    ]
    plan = []
    print("=== 开始：三个邮箱同时发码，各自等到时间点再验 ===")
    for i, (label, delay) in enumerate(cases):
        email = f"ttl_{STAMP}_{i}@example.com"
        code, body = send_code(email)
        if not code:
            print(f"  [!] {label} 发码没拿到 devCode：{json.dumps(body, ensure_ascii=False)[:160]}")
            print("      检查后端是否以 dev-echo 模式启动（--spring.mail.username= 清空凭据）")
            return 1
        plan.append({"label": label, "email": email, "code": code,
                     "due": time.time() + delay, "delay": delay})
        print(f"  发码 {label:>10} → {email}  code={code}")

    print(f"\n最早的一档要等到 {cases[0][0]} 后，最后一档 {cases[-1][0]}。等结果…\n")
    results = []
    for item in sorted(plan, key=lambda x: x["due"]):
        wait = item["due"] - time.time()
        if wait > 0:
            time.sleep(wait)
        body = verify(item["email"], item["code"])
        code_ret = body.get("code")
        msg = body.get("msg") or ""
        ticket = (body.get("data") or {}) if code_ret == 200 else None
        ok = code_ret == 200 and bool(ticket)
        results.append((item["label"], item["delay"], ok, code_ret, msg))
        print(f"  {item['label']:>10} 后验码 → {'仍有效' if ok else '已失效'}  "
              f"code={code_ret} msg={msg}")

    print("\n=== 结论 ===")
    for label, delay, ok, code_ret, msg in results:
        print(f"  {label:>10}（{delay}s）: {'✅ 可用' if ok else '❌ ' + str(msg)}")
    print("\n判读：")
    print("  · 9 分钟可用 + 10 分 40 秒失效 → 服务端就是 10 分钟，代码没问题；")
    print("    用户觉得「不到 10 分钟」，原因在邮件投递延迟（计时从发信开始，不是从收到开始）。")
    print("  · 9 分钟就失效 → 真的提前过期，要查进程是否重启过（内存 Map 会被清空）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
