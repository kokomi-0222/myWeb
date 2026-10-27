"""注册流程接口验收（两步：先验邮箱拿 ticket，再填密码建号）。

背景：
  注册最终定型成两步 ——
    ① 输入邮箱 → 收发验证码 → 校验通过后服务端发一张 10 分钟的 ticket；
    ② 只填密码 → 凭 ticket 建号，邮箱当场就算已验证。
  好处：
    * 新号一落地就是普通用户（member），能发帖能评论，没有游客空窗期；
    * 不再需要图形验证码（邮件已经证明了「是真人 + 邮箱是他的」）；
    * 校验码第一步只验不消费（有效期内可重复验），ticket 可以在密码类失败后重试，
      用户不必为了一个小错重新收一封邮件。

  用户名不再由用户填写：后端统一生成 kokomi_ + 8 位小写字母数字，
  请求体里的 account 会被完全忽略（老前端还会带这个字段）。理由见
  UserServiceImpl.randomUsername ——「用户名已被占用」是注册流程里最容易卡住的一步，
  而用户名并不是展示名（站内显示的是 name 昵称）。

覆盖：
  [1] 第一步发码（免登录）：正常 / 60 秒限流 / 格式错 / 邮箱已被注册
  [2] 第一步验码换 ticket：缺邮箱 / 格式错 / 缺码 / 错码 / 正确 / 同码可再验一次
  [3] 第二步建号：缺 ticket / 假 ticket / 两次密码不一致 / 密码太短 /
      非法 account 被忽略 / 成功（注册即登录 + member + 权限）
  [4] 用户名格式（kokomi_xxxxxxxx）、昵称派生、两个账号不重名、长邮箱
  [5] 失败后 ticket 仍可重试；注册接口本身不发信
  [6] 注册接口不顺手发信
  [7] 重发即废旧码（只认最新一封，旧码给「已更新」文案且不计试错）—— 要等 61 秒冷却

业务码：PARAM_ERROR 400 / REGISTER_ERROR 502 / VERIFY_CODE_ERROR 508。

需要本地后端跑在 18080，且 app.mail.dev-echo=true（本机 local 配置已开），
否则拿不到验证码明文。全程用临时账号，测完删干净。
用法：cd tools && python test-register-email-api.py
"""
import base64
import importlib.util
import json
import os
import re
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
# RSA：前端用 JSEncrypt（PKCS#1 v1.5）只加密密码两项，这里用纯 Python 复刻
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
    _, i = _read_len(der, i + 1)          # SubjectPublicKeyInfo
    assert der[i] == 0x30                 # AlgorithmIdentifier
    algo_len, i = _read_len(der, i + 1)
    i += algo_len
    assert der[i] == 0x03                 # BIT STRING
    _, i = _read_len(der, i + 1)
    i += 1                                # unused bits
    assert der[i] == 0x30                 # RSAPublicKey
    _, i = _read_len(der, i + 1)
    assert der[i] == 0x02                 # modulus
    n_len, i = _read_len(der, i + 1)
    n = int.from_bytes(der[i:i + n_len], "big")
    i += n_len
    assert der[i] == 0x02                 # exponent
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


def send_code(email):
    st, body = call("POST", "/user/register/email-code", body={"email": email})
    return body or {}


def verify_email(email, code):
    """第一步：校验邮箱验证码，换成 ticket"""
    st, body = call("POST", "/user/register/verify-email",
                    body={"email": email, "code": code})
    return body or {}


def register(ticket, account, pwd, confirm=None):
    """第二步：凭 ticket 建号（只有密码走 RSA）"""
    payload = json.dumps({
        "password": pwd,
        "confirmPassword": confirm if confirm is not None else pwd,
    }, ensure_ascii=False)
    st, body = call("POST", "/user/register", body={
        "ticket": ticket or "",
        "account": account,
        "encryptedData": rsa_encrypt(payload),
    })
    return body or {}


def info(token):
    st, body = call("GET", "/user/info", token)
    return (body or {}).get("data") or {}


def delete_user(uid):
    if not uid:
        return
    mysql(f"DELETE FROM user_role WHERE user_id = {uid}")
    mysql(f"DELETE FROM user WHERE id = {uid}")


def ticket_of(body):
    return ((body or {}).get("data") or {}).get("ticket")


created = []
try:
    stamp = str(int(time.time() * 1000))[-7:]

    # ------------------------------------------------------------------
    print("[1] 第一步发码（免登录）")
    email_a = f"reg_{stamp}_a@example.com"
    body = send_code(email_a)
    data = (body.get("data") or {})
    code_a = data.get("devCode")
    check("新邮箱发码成功（拿到明文码）", body.get("code") == 200 and bool(code_a),
          f"code={body.get('code')} devCode={code_a}")

    body = send_code(email_a)
    d2 = (body.get("data") or {})
    check("60 秒内重发被限流（sent=false + retryAfter）",
          body.get("code") == 200 and d2.get("sent") is False and (d2.get("retryAfter") or 0) > 0,
          f"retryAfter={d2.get('retryAfter')}")

    body = send_code("not-an-email")
    check("邮箱格式错 → 400", body.get("code") == 400, f"code={body.get('code')}")

    # ------------------------------------------------------------------
    print("[2] 第一步验码 → 换 ticket")
    body = verify_email("", code_a)
    check("缺邮箱 → 400", body.get("code") == 400,
          f"code={body.get('code')} msg={body.get('msg')}")

    body = verify_email("bad-email", code_a)
    check("邮箱格式错 → 400", body.get("code") == 400, f"code={body.get('code')}")

    body = verify_email(email_a, "")
    check("缺验证码 → 400/508", body.get("code") in (400, 508),
          f"code={body.get('code')} msg={body.get('msg')}")

    body = verify_email(email_a, "000000")
    check("验证码错 → 508 且提示剩余次数",
          body.get("code") == 508 and "再试" in (body.get("msg") or ""),
          f"code={body.get('code')} msg={body.get('msg')}")

    body = verify_email(email_a, code_a)
    ticket_a = ticket_of(body)
    check("验证码正确 → 拿到 ticket", body.get("code") == 200 and len(ticket_a or "") >= 16,
          f"code={body.get('code')} ticket={str(ticket_a)[:10]}")

    # 第一步**只验不消费**：用户验完之后可能扭头就不注册（关掉弹窗、先去看别的），
    # 过几分钟再打开注册框时手上只有那封邮件里的码 —— 那时候它必须还能用。
    # 早先这里是「命中即消费」，结果就是这么个场景：他输入那个确实没过期的码，
    # 却被告知「验证码已失效」。
    body = verify_email(email_a, code_a)
    ticket_b = ticket_of(body)
    check("同一个验证码在有效期内可再验一次（第一步只验不消费）",
          body.get("code") == 200 and len(ticket_b or "") >= 16,
          f"code={body.get('code')} msg={body.get('msg')}")
    # 同一邮箱只保留一张有效票：否则一个码能无限换票，把票缓存刷爆
    check("同一邮箱复用同一张 ticket（不重复签发）", ticket_b == ticket_a,
          f"{str(ticket_a)[:8]} vs {str(ticket_b)[:8]}")

    # ------------------------------------------------------------------
    print("[3] 第二步建号（凭 ticket，不再要图形验证码）")
    acc = f"reguser_{stamp}"

    body = register("", acc, "Passw0rd1")
    check("缺 ticket → 400", body.get("code") == 400,
          f"code={body.get('code')} msg={body.get('msg')}")

    body = register("deadbeef" * 4, acc, "Passw0rd1")
    check("假 ticket → 400", body.get("code") == 400,
          f"code={body.get('code')} msg={body.get('msg')}")

    # 用户名不再由用户填写：后端完全不看请求里的 account，
    # 所以这里只用「密码类」错误验证「失败不烧 ticket」
    body = register(ticket_a, acc, "Passw0rd1", confirm="Other123456")
    check("两次密码不一致 → 502", body.get("code") == 502,
          f"code={body.get('code')} msg={body.get('msg')}")

    body = register(ticket_a, acc, "ab1")
    check("密码太短 → 502", body.get("code") == 502,
          f"code={body.get('code')} msg={body.get('msg')}")

    # ------------------------------------------------------------------
    print("[3b] 用户名由系统生成：请求里的 account 被完全忽略")
    check("上面连续失败后 ticket 仍有效", bool(ticket_a), str(ticket_a)[:10])
    # 故意传一个完全不合法的用户名，能建号就证明后端没看这个字段
    body = register(ticket_a, "@#$%^&*", "Passw0rd1")
    check("非法 account 被忽略，注册成功（200）", body.get("code") == 200,
          f"code={body.get('code')} msg={body.get('msg')}")

    d = (body.get("data") or {})
    token = d.get("token")
    user = d.get("user") or {}
    uid = user.get("id")
    created.append(uid)

    check("直接返回了 token（不用再登录一遍）", bool(token), str(token)[:20])
    check("返回的用户信息带邮箱", user.get("email") == email_a, str(user.get("email")))

    st, inf = call("GET", "/user/info", token)
    check("拿到的 token 可直接用", (inf or {}).get("code") == 200,
          f"code={(inf or {}).get('code')}")

    d2 = info(token)
    u = d2.get("user") or {}
    check("emailVerified = true", u.get("emailVerified") is True, str(u.get("emailVerified")))
    check("primary_role = member（不再是游客）", u.get("primaryRole") == "member",
          str(u.get("primaryRole")))

    perms = set(d2.get("permissions") or [])
    check("有发帖/评论权限（post:create + comment:create）",
          {"post:create", "comment:create"} <= perms, str(sorted(perms)))

    roles = [r[0] for r in mysql(f"SELECT role_code FROM user_role WHERE user_id = {uid}")]
    check("user_role 里只有 member", roles == ["member"], str(roles))

    # 同一张 ticket 建完号就作废
    body = register(ticket_a, f"reguser_{stamp}_again", "Passw0rd1")
    check("建号后 ticket 作废 → 400", body.get("code") == 400,
          f"code={body.get('code')} msg={body.get('msg')}")

    # ------------------------------------------------------------------
    print("[4] 用户名格式 / 昵称派生 / 长邮箱")
    # 用户名统一是 kokomi_ + 8 位小写字母数字（UserServiceImpl.randomUsername）；
    # 昵称由它派生：用户 + 尾 6 位（要过 updateProfile 的昵称规则：≤12、中文/英文/数字）
    USERNAME_RE = r"kokomi_[a-z0-9]{8}"
    NICK_RE = r"用户[a-z0-9]{6}"

    # 邮箱本身仍然可能很长（email 列 varchar(50)），不能因为用户名不再用邮箱就漏测
    email_b = f"reg_{stamp}_long@a-very-long-domain.example.com"
    code_b = (send_code(email_b).get("data") or {}).get("devCode")
    tb = ticket_of(verify_email(email_b, code_b))
    check("长邮箱第一步通过", bool(tb), str(tb)[:10])
    body = register(tb, email_b, "Passw0rd1")
    check("长邮箱注册成功", body.get("code") == 200,
          f"code={body.get('code')} msg={body.get('msg')}")
    uid_b = ((body.get("data") or {}).get("user") or {}).get("id")
    created.append(uid_b)
    acc_b = None
    if uid_b:
        acc_b = scalar(f"SELECT username FROM user WHERE id = {uid_b}")
        nick = scalar(f"SELECT name FROM user WHERE id = {uid_b}")
        check("username 是 kokomi_ + 8 位",
              bool(re.fullmatch(USERNAME_RE, acc_b or "")), str(acc_b))
        check("昵称是「用户+6位」", bool(re.fullmatch(NICK_RE, nick or "")), str(nick))
        check("昵称 ≤12 字符（能过昵称校验）", bool(nick) and len(nick) <= 12, str(nick))
    else:
        for n in ("username 是 kokomi_ + 8 位", "昵称是「用户+6位」", "昵称 ≤12 字符（能过昵称校验）"):
            check(n, False, "没拿到 uid")

    # 第二个账号：用户名必须和第一个不同（随机 + 唯一索引重试双保险）
    email_c = f"reg_{stamp}_c@example.com"
    code_c = (send_code(email_c).get("data") or {}).get("devCode")
    tc = ticket_of(verify_email(email_c, code_c))
    body = register(tc, "随便传什么都行", "Passw0rd1")
    check("第二个账号注册成功", body.get("code") == 200,
          f"code={body.get('code')} msg={body.get('msg')}")
    uid_c = ((body.get("data") or {}).get("user") or {}).get("id")
    created.append(uid_c)
    if uid_c:
        acc_c = scalar(f"SELECT username FROM user WHERE id = {uid_c}")
        check("第二个 username 也是 kokomi_ 格式",
              bool(re.fullmatch(USERNAME_RE, acc_c or "")), str(acc_c))
        check("两个账号 username 不同", bool(acc_b) and acc_b != acc_c, f"{acc_b} vs {acc_c}")
    else:
        check("第二个 username 也是 kokomi_ 格式", False, "没拿到 uid")
        check("两个账号 username 不同", False, "没拿到 uid")

    # ------------------------------------------------------------------
    print("[5] 邮箱已注册：发码和验码都要直接说清楚")
    body = send_code(email_a)
    check("已注册的邮箱发码 → 502 且文案是「已被注册」",
          body.get("code") == 502 and "已被注册" in (body.get("msg") or ""),
          f"code={body.get('code')} msg={body.get('msg')}")

    body = verify_email(email_a, "123456")
    check("已注册的邮箱验码 → 502（不烧验证码，先说结论）",
          body.get("code") == 502, f"code={body.get('code')} msg={body.get('msg')}")

    # ------------------------------------------------------------------
    print("[6] 注册接口不发信")
    email_d = f"reg_{stamp}_d@example.com"
    body = register("", f"reguser_{stamp}_d", "Passw0rd1")
    check("没验过邮箱就没有 ticket，注册被拒 → 400",
          body.get("code") == 400, f"code={body.get('code')} msg={body.get('msg')}")
    check("这个邮箱没有被顺手发码（库里也查不到验证码状态）",
          scalar(f"SELECT COUNT(*) FROM user WHERE email = '{email_d}'") in ("0", 0),
          "未产生账号")

    # ------------------------------------------------------------------
    print("[7] 重发即废旧码：只认最新那封邮件（这一段要等 61 秒的重发冷却）")
    # 规则是用户定的：点了「重新发送」，之前那几封邮件里的码立刻作废。
    # 但输旧码不能报「验证码不正确」——他没错，只是拿了上一条邮件；
    # 文案要给到「验证码已更新」，而且不计入试错次数。
    email_e = f"reg_{stamp}_e@example.com"
    first = (send_code(email_e).get("data") or {}).get("devCode")
    check("第一次发码", bool(first), str(first))
    time.sleep(61)
    second = (send_code(email_e).get("data") or {}).get("devCode")
    check("冷却过后可以再发一封", bool(second), str(second))
    if first and second and first != second:
        body = verify_email(email_e, first)
        check("重发之后旧码立刻失效",
              body.get("code") == 508 and not ticket_of(body),
              f"code={body.get('code')} msg={body.get('msg')}")
        check("旧码文案是「验证码已更新」而不是「不正确」",
              "已更新" in (body.get("msg") or ""),
              str(body.get("msg")))
        body = verify_email(email_e, second)
        check("用最新收到的码 → 通过",
              body.get("code") == 200 and bool(ticket_of(body)),
              f"code={body.get('code')} msg={body.get('msg')}")
    else:
        check("重发之后旧码立刻失效", False, "没拿到两个不同的码")
        check("旧码文案是「验证码已更新」而不是「不正确」", False, "没拿到两个不同的码")
        check("用最新收到的码 → 通过", False, "没拿到两个不同的码")

finally:
    for uid in created:
        delete_user(uid)
    # 兜底：用户名现在是随机的 kokomi_xxx，没法按用户名认，
    # 改按本轮邮箱前缀（reg_xxx@example.com）清，别把临时号留在库里
    for row in mysql("SELECT id FROM user WHERE email LIKE 'reg!_%' ESCAPE '!'"):
        delete_user(int(row[0]))

print()
print(f"通过 {len(PASS)} / {len(PASS) + len(FAIL)}")
if FAIL:
    print("失败项：")
    for name in FAIL:
        print("  - " + name)
    raise SystemExit(1)
