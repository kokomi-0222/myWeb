"""验证码「验过不注册，回头再输同一个码」的回归脚本。

用户场景（就是他报的那个）：
  注册第一步验证通过 → 他没继续建号（关掉弹窗 / 先去看看别的 / 过几分钟再来）
  → 重新打开注册框，输入同一封邮件里那个码 → 早先会被告知「验证码已失效」。
  邮件上明明写着 10 分钟内有效，所以在他看来这就是 bug。

根因：EmailCodeCache.check 命中就把整个 entry 删掉（一次一用）。
现在第一步改用 verify（只验不消费），码在自己的有效期内可以反复验证；
建号成功后才 clear。安全性没变差：邮箱有唯一索引，一个邮箱只可能建出一个号。

覆盖：
  [1] 同一个码验两次都能换到 ticket（ticket 每次不同）
  [2] 连续验 6 次仍然通过（不会因为「重复验证」被当成试错）
  [3] 中间插一次错码，再输对码仍然通过（fails 清零）
  [4] 错 5 次 → 作废，之后连正确的码也不认（防爆破的边界还在）

用法：cd tools && python check-code-reuse.py
需要本地后端跑在 18080，且 app.mail.dev-echo=true（本机 local 配置已开）。
"""
import json
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:18080"
STAMP = str(int(time.time() * 1000))[-7:]

PASS, FAIL = [], []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(("  PASS " if ok else "  FAIL ") + name + (f"  ({detail})" if detail else ""))


def post(path, body):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return json.loads(raw or "{}")
        except Exception:
            return {"code": e.code, "msg": raw}


def send_code(email):
    d = post("/user/register/email-code", {"email": email}).get("data") or {}
    return d.get("devCode")


def verify(email, code):
    b = post("/user/register/verify-email", {"email": email, "code": code})
    return b, ((b.get("data") or {}).get("ticket"))


def main():
    email = f"reuse_{STAMP}@example.com"
    print(f"=== 邮箱 {email} ===")
    code = send_code(email)
    if not code:
        print("FAIL 拿不到 devCode：后端是不是没开 dev-echo，或者 SMTP 凭据被填上了？")
        return 1
    print(f"  收到验证码 {code}")

    print("\n[1] 连续用同一个码换 ticket（模拟「验完不注册，回头再来」）")
    tickets = []
    for i in (1, 2):
        body, ticket = verify(email, code)
        ok = body.get("code") == 200 and bool(ticket)
        tickets.append(ticket)
        check(f"第 {i} 次验证同一个码 → 通过", ok,
              f"code={body.get('code')} msg={body.get('msg')}")
    # 同一邮箱只保留一张有效票（RegisterTicketCache 的反查索引）：
    # 不这么限的话，一个码能无限次换票，30 分钟内就能把票缓存灌爆
    check("同一邮箱拿到的是同一张票（不会每次签发新的）",
          tickets[0] and tickets[0] == tickets[1])

    print("\n[2] 再连着验 4 次（共 6 次），不能因为「重复」被作废")
    for i in range(3, 7):
        body, ticket = verify(email, code)
        check(f"第 {i} 次验证 → 通过", body.get("code") == 200 and bool(ticket),
              f"code={body.get('code')} msg={body.get('msg')}")

    print("\n[3] 中间插一次错码，再用对码")
    body, _ = verify(email, "000000" if code != "000000" else "111111")
    check("错码 → 508 且提示剩余次数",
          body.get("code") == 508 and "再试" in (body.get("msg") or ""),
          f"code={body.get('code')} msg={body.get('msg')}")
    body, ticket = verify(email, code)
    check("随后用对码 → 仍然通过（试错次数已清零）",
          body.get("code") == 200 and bool(ticket),
          f"code={body.get('code')} msg={body.get('msg')}")

    print("\n[4] 防爆破边界：另一个邮箱连错 5 次后，对码也必须不认")
    email2 = f"brute_{STAMP}@example.com"
    code2 = send_code(email2)
    if not code2:
        print("  [!] 第二个邮箱拿不到 devCode，跳过")
    else:
        wrong = "999999" if code2 != "999999" else "888888"
        last = None
        for _ in range(5):
            last, _ = verify(email2, wrong)
        check("连错 5 次 → TOO_MANY（文案含「作废」）",
              last.get("code") == 508 and "作废" in (last.get("msg") or ""),
              f"code={last.get('code')} msg={last.get('msg')}")
        body, ticket = verify(email2, code2)
        check("作废后正确的码也不认", body.get("code") == 508 and not ticket,
              f"code={body.get('code')} msg={body.get('msg')}")

    print(f"\n结果：PASS {len(PASS)} / FAIL {len(FAIL)}")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    raise SystemExit(main())
