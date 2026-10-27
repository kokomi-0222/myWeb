"""重发验证码之后，旧码必须立刻失效（只认最新一封邮件）。

规则（2026-10-27 用户明确要求）：
  * 同一个码在 10 分钟内可以反复验（第一步只验不消费，见 check-code-reuse.py）；
  * **但只要点了「重新发送」，之前那几封邮件里的码立刻作废**，只认最后一次发的。
  * 输旧码时不能说「验证码不正确」（用户没猜错，他拿的是上一条邮件），
    要明确告诉他「验证码已更新，请使用最新收到的那封邮件里的验证码」；
  * 而且这种「拿的是旧码」不计入试错次数 —— 他连试 5 次旧码，新码照样能用。

要等 60 秒重发冷却，跑一次约 75 秒。
用法：cd tools && python check-resend-invalidates-old.py
"""
import json
import sys
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:18080"
EMAIL = f"resend_{int(time.time())}@example.com"

PASS, FAIL = [], []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(("  PASS " if ok else "  FAIL ") + name + (f"  ({detail})" if detail else ""))


def post(path, body):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode("utf-8") or "{}")


def send():
    body = post("/user/register/email-code", {"email": EMAIL})
    return (body.get("data") or {}).get("devCode"), body


def verify(code):
    body = post("/user/register/verify-email", {"email": EMAIL, "code": code})
    return body, ((body.get("data") or {}).get("ticket"))


def main():
    code1, body = send()
    if not code1:
        print(f"FAIL 第一次发码没拿到 devCode：{json.dumps(body, ensure_ascii=False)[:160]}")
        return 1
    print(f"  第一次发码  code1={code1}")

    print("  等 61 秒（重发冷却）…")
    time.sleep(61)

    code2, body = send()
    if not code2:
        print(f"FAIL 第二次发码失败：{json.dumps(body, ensure_ascii=False)[:160]}")
        return 1
    print(f"  第二次发码  code2={code2}"
          f"（两次{'相同，重跑一次' if code1 == code2 else '不同'}）")

    if code1 == code2:
        print("  [!] 两个码恰好撞上了（百万分之一），这次结果不能作数，重跑一遍")
        return 1

    # ---- 关键：旧码必须立刻失效，而且要说清楚是「更新了」不是「输错了」
    body, ticket = verify(code1)
    msg = body.get("msg") or ""
    check("重发之后旧码立刻失效", body.get("code") == 508 and not ticket,
          f"code={body.get('code')} msg={msg}")
    check("文案是「验证码已更新」，不是「验证码不正确」", "已更新" in msg, msg)

    # ---- 旧码不算猜错：连试 4 次（共 5 次）之后，新码仍然能过
    for _ in range(4):
        verify(code1)
    body, ticket = verify(code2)
    check("连试 5 次旧码之后，新码照样通过（旧码不计试错次数）",
          body.get("code") == 200 and bool(ticket),
          f"code={body.get('code')} msg={body.get('msg')}")

    print(f"\n结果：PASS {len(PASS)} / FAIL {len(FAIL)}")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
