"""票缓存会不会被「反复验同一个码」灌满？（回归：不会，同一邮箱只留一张票）

背景：
  第一步的验证码现在是「只验不消费」，同一个码在 10 分钟内可以反复验证。
  如果每验一次就签发一张新 ticket、而且没有任何反查索引，那么一个人拿自己邮箱
  收到的码狂刷 /user/register/verify-email，就能在 30 分钟内往 RegisterTicketCache
  里灌进任意多条记录（每条约 100 字节，几百万条就是几百 MB）—— 先把内存打满，
  再谈什么发码配额都没用。

现在 RegisterTicketCache 用「邮箱 → ticket」反查索引去重：同一邮箱无论验多少次，
拿到的都是同一张票，缓存条数 ≈ 30 分钟内验过邮箱的**人数**（全站发码 120 封/小时，
稳态几十条，上限 5000 是 100 倍余量）。

这个脚本验证的就是那条去重：连验 40 次，票必须自始至终是同一个。

用法：cd tools && python check-ticket-dedup.py（秒级，只发 1 封码）
"""
import json
import sys
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:18080"
EMAIL = f"dedup_{int(time.time())}@example.com"
ROUNDS = 40

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


def main():
    body = post("/user/register/email-code", {"email": EMAIL})
    code = (body.get("data") or {}).get("devCode")
    if not code:
        print(f"FAIL 拿不到 devCode：{json.dumps(body, ensure_ascii=False)[:160]}")
        return 1
    print(f"  邮箱 {EMAIL}  验证码 {code}")

    tickets, codes = [], []
    for _ in range(ROUNDS):
        r = post("/user/register/verify-email", {"email": EMAIL, "code": code})
        codes.append(r.get("code"))
        tickets.append((r.get("data") or {}).get("ticket"))

    ok_count = sum(1 for c in codes if c == 200)
    check(f"{ROUNDS} 次验证全部通过（只验不消费）", ok_count == ROUNDS,
          f"{ok_count}/{ROUNDS}")
    uniq = set(t for t in tickets if t)
    check("所有轮次拿到的是同一张票（同一邮箱只保留一张）", len(uniq) == 1,
          f"不同票 {len(uniq)} 张")
    check("票长度正常（32 位十六进制）",
          len(next(iter(uniq)) or "") == 32, str(next(iter(uniq)))[:12])

    print("\n结论：")
    print(f"  {ROUNDS} 次验证请求 → 缓存里只有 1 条记录（不是 {ROUNDS} 条）。")
    print("  稳态条数 ≈ 30 分钟内验过邮箱的人数，受「全站 120 封/小时」发码配额约束，")
    print("  量级几十条，离 5000 的上限差两个数量级 —— 正常运营填不满。")

    print(f"\n结果：PASS {len(PASS)} / FAIL {len(FAIL)}")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
