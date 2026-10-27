"""注册能不能跳过第一步邮箱验证？—— 直接打接口试，不允许凭代码猜测。

覆盖：
  [1] 不带 ticket 直接建号
  [2] 伪造 ticket（随机 32 位十六进制 / 短串 / 空串）
  [3] 请求体里塞一个别人的 email，能不能让 ticket 里的邮箱被覆盖（「验 A 注册 B」）
  [4] 同一张 ticket 能不能建出第二个号
  [5] 邮箱已被注册的地址能不能走到建号
  [6] 正常两步流程的落库结果（email / email_verified / primary_role / kokomi_ 用户名）

需要本地后端跑在 18080 且 app.mail.dev-echo=true（本机 local 配置已开），
否则拿不到验证码明文。不用真发信 —— 全程 dev-echo。
用法：cd tools && python check-register-bypass.py
"""
import base64
import importlib.util
import json
import os
import time

_here = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "report_api", os.path.join(_here, "test-report-api.py"))
report_api = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(report_api)

call = report_api.call
mysql = report_api.mysql
scalar = report_api.scalar

PASS, FAIL = [], []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(("  PASS " if ok else "  FAIL ") + name + (f"  ({detail})" if detail else ""))


# ----------------------------------------------------------------------
# RSA：和 test-register-email-api.py 里那份一致（那边是脚本，import 会直接跑测试，
# 所以这里复制一份最小实现）
# ----------------------------------------------------------------------
def _read_len(buf, i):
    length = buf[i]
    i += 1
    if length & 0x80:
        n = length & 0x7F
        length = int.from_bytes(buf[i:i + n], "big")
        i += n
    return length, i


def parse_public_key(b64key):
    der = base64.b64decode(b64key + "=" * (-len(b64key) % 4))
    i = 0
    assert der[i] == 0x30
    _, i = _read_len(der, i + 1)
    assert der[i] == 0x30
    algo_len, i = _read_len(der, i + 1)
    i += algo_len
    assert der[i] == 0x03
    _, i = _read_len(der, i + 1)
    i += 1
    assert der[i] == 0x30
    _, i = _read_len(der, i + 1)
    assert der[i] == 0x02
    n_len, i = _read_len(der, i + 1)
    n = int.from_bytes(der[i:i + n_len], "big")
    i += n_len
    assert der[i] == 0x02
    e_len, i = _read_len(der, i + 1)
    e = int.from_bytes(der[i:i + e_len], "big")
    return n, e


_PUB = call("GET", "/publicKey")[1]["data"]["publicKey"]
_N, _E = parse_public_key(_PUB)


def rsa_encrypt(text):
    msg = text.encode("utf-8")
    k = (_N.bit_length() + 7) // 8
    pad_len = k - 3 - len(msg)
    pad = bytes(b for b in os.urandom(pad_len * 2) if b != 0)[:pad_len]
    em = b"\x00\x02" + pad + b"\x00" + msg
    c = pow(int.from_bytes(em, "big"), _E, _N)
    return base64.b64encode(c.to_bytes(k, "big")).decode()


def register(ticket, pwd="Passw0rd1", email_in_body=None, raw_encrypted=None):
    payload = json.dumps({"password": pwd, "confirmPassword": pwd})
    body = {
        "ticket": ticket,
        "account": "hacker",
        "encryptedData": raw_encrypted if raw_encrypted else rsa_encrypt(payload),
    }
    if email_in_body:
        body["email"] = email_in_body          # 老版字段，看后端认不认
    st, res = call("POST", "/user/register", body=body)
    return res or {}


stamp = str(int(time.time()))[-8:]
EMAIL_A = f"bypass_{stamp}_a@example.com"
EMAIL_B = f"bypass_{stamp}_b@example.com"
created = []

try:
    # ---------------------------------------------------------------- 1
    print("[1] 不带 ticket 直接建号")
    body = register("")
    check("空 ticket → 400「请先验证邮箱」", body.get("code") == 400, str(body)[:120])

    # ---------------------------------------------------------------- 2
    print("[2] 伪造 ticket")
    fake = "0123456789abcdef0123456789abcdef"     # 32 位十六进制，格式完全正确
    body = register(fake)
    check("随机 32 位十六进制 ticket → 400 过期", body.get("code") == 400, str(body)[:120])
    body = register("abc")
    check("短串 ticket → 400", body.get("code") == 400, str(body)[:120])
    body = register("../../etc/passwd")
    check("怪串 ticket → 400", body.get("code") == 400, str(body)[:120])

    # ---------------------------------------------------------------- 3
    print("[3] 请求体里塞别人的 email（「验 A 注册 B」）")
    st, res = call("POST", "/user/register/email-code", body={"email": EMAIL_A})
    dev_a = ((res or {}).get("data") or {}).get("devCode")
    check("A 的验证码拿到（dev-echo）", bool(dev_a), str(dev_a))
    st, res = call("POST", "/user/register/verify-email", body={"email": EMAIL_A, "code": dev_a})
    ticket_a = (((res or {}).get("data")) or {}).get("ticket")
    check("A 换到 ticket", bool(ticket_a), str(ticket_a)[:10])

    # 用 A 的 ticket，但 body 里写 B 的邮箱，并塞一个无敌用户名
    body = register(ticket_a, email_in_body=EMAIL_B)
    check("拿着 A 的 ticket 建号成功", body.get("code") == 200, str(body)[:160])
    uid = (((body.get("data") or {}).get("user")) or {}).get("id")
    created.append(uid)
    saved = scalar(f"SELECT email FROM user WHERE id = {uid}") if uid else None
    check("落库邮箱是 A（body 里的 B 被忽略）", saved == EMAIL_A, f"saved={saved} 请求体写的是 {EMAIL_B}")
    check("B 没有被注册", scalar(f"SELECT COUNT(*) FROM user WHERE email = '{EMAIL_B}'") == "0")

    # ---------------------------------------------------------------- 4
    print("[4] 同一张 ticket 再建第二个号")
    body = register(ticket_a, email_in_body=EMAIL_B)
    # 建号成功时 ticket 已被 remove()，所以这里命中的是「过期」而不是「已注册」——
    # 两条都是拒绝，只要没建出第二个号就行
    check("复用 ticket → 被拒", body.get("code") in (400, 502), str(body)[:120])
    check("第二次没有多出账号", scalar(f"SELECT COUNT(*) FROM user WHERE email = '{EMAIL_A}'") == "1")

    # ---------------------------------------------------------------- 5
    print("[5] 已被注册的邮箱能不能再走第一步")
    st, res = call("POST", "/user/register/email-code", body={"email": EMAIL_A})
    check("已注册邮箱发码 → 502「该邮箱已被注册」",
          (res or {}).get("code") == 502, str(res)[:140])

    # ---------------------------------------------------------------- 6
    print("[6] 正常流程落库结果")
    verified = scalar(f"SELECT email_verified FROM user WHERE id = {uid}")
    role = scalar(f"SELECT primary_role FROM user WHERE id = {uid}")
    username = scalar(f"SELECT username FROM user WHERE id = {uid}")
    nickname = scalar(f"SELECT name FROM user WHERE id = {uid}")
    check("email_verified = 1", verified == "1", str(verified))
    check("primary_role = member", role == "member", str(role))
    check("username 是 kokomi_ 前缀", (username or "").startswith("kokomi_"), str(username))
    check("昵称从用户名派生", (nickname or "").startswith("用户"), str(nickname))
finally:
    for uid in created:
        if uid:
            mysql(f"DELETE FROM user_role WHERE user_id = {uid}")
            mysql(f"DELETE FROM user WHERE id = {uid}")
    print(f"\n结果：{len(PASS)} 通过 / {len(FAIL)} 失败（测试账号已删除）")
    if FAIL:
        print("失败项：" + "、".join(FAIL))
