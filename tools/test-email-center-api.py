"""邮箱中心（个人中心补绑 / 换绑 / 解绑 + 找回密码）接口验收。

背景：
  绑定邮箱以前是个全局弹窗，现在搬进了「个人中心 → 账号管理」。
  绑定的邮箱同时是找回密码的唯一凭据。

覆盖：
  [1] 未登录保护：换绑 / 解绑要登录；找回密码的两个接口免登录
  [2] 绑定：新号没邮箱必须先填、验证码错、验证码对 → 升普通用户
  [3] 换绑：必须验当前密码（错密码 / 同一个邮箱 / 缺密码都拒），
      成功只换 email，**角色和验证状态都不动**
  [4] 换绑后旧邮箱不能再找回密码，新邮箱可以
  [5] 找回密码：发码、错码次数、正确码重置、旧 token 立即失效
  [6] 防枚举：没注册过的邮箱也返回「已发送」，文案一致
  [7] 边界：邮箱格式、重复绑定占用、缺参数
  [8] 解绑：必须验当前密码；解绑后 email 清空、验证位归零，
      但**角色不动**（仍能发帖评论），只是不能再靠邮箱找回密码；
      之后还能重新绑一个

注：解绑是「放弃找回密码」，不是降级 —— 发言闸门看的是权限码
（PostServiceImpl#checkCanPost），和 email_verified 无关。

全程用临时账号，测完删干净。依赖本地后端（18080）+
本地配置里的 app.mail.dev-echo=true（没配 SMTP 时把验证码明文放进响应）。

用法：cd tools && python test-email-center-api.py
"""
import base64
import importlib.util
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
make_token = report_api.make_token

PASS, FAIL = [], []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(("  PASS " if ok else "  FAIL ") + name + (f"  ({detail})" if detail else ""))


def token_of(uid):
    tv = int(scalar(f"SELECT token_version FROM user WHERE id = {uid}", "1"))
    return make_token(uid, tv)


def make_guest(tag):
    """直接建一个游客（绕开 RSA + 图形验证码），email 留空。"""
    stamp = str(int(time.time() * 1000))[-8:]
    account = f"mail_{tag}_{stamp}"
    mysql(
        "INSERT INTO user (username, password, name, email, email_verified, primary_role) "
        f"VALUES ('{account}', 'x', '{account}', NULL, 0, 'guest')"
    )
    uid = int(scalar(f"SELECT id FROM user WHERE username = '{account}'", "0"))
    if uid:
        mysql(f"INSERT INTO user_role (user_id, role_code) VALUES ({uid}, 'guest')")
    return uid, account


def cleanup(uids):
    for uid in uids:
        if not uid:
            continue
        mysql(f"DELETE FROM user_role WHERE user_id = {uid}")
        mysql(f"DELETE FROM user WHERE id = {uid}")


# ----------------------------------------------------------------------
# RSA：前端用 JSEncrypt（PKCS#1 v1.5）加密密码，这里用纯 Python 复刻，
# 免得为了一个接口去装 cryptography。
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
    msg = text.encode()
    k = (_N.bit_length() + 7) // 8
    pad_len = k - 3 - len(msg)
    pad = bytes(b for b in os.urandom(pad_len * 2) if b != 0)[:pad_len]
    em = b"\x00\x02" + pad + b"\x00" + msg
    c = pow(int.from_bytes(em, "big"), _E, _N)
    return base64.b64encode(c.to_bytes(k, "big")).decode()


def reset_with(code, email, new_pwd, confirm=None):
    payload = rsa_encrypt('{"newPassword":"%s","confirmPassword":"%s"}'
                          % (new_pwd, confirm if confirm is not None else new_pwd))
    return call("POST", "/user/password/forgot/reset", body={
        "email": email, "code": code, "encryptedData": payload})


def info(token):
    st, body = call("GET", "/user/info", token)
    return body.get("data") or {}


def perms(token):
    return set(info(token).get("permissions") or [])


uids = []
try:
    # ------------------------------------------------------------------
    print("[1] 未登录保护")
    st, body = call("POST", "/user/email/change/send", body={"email": "a@b.com"})
    check("换绑未登录被拒（401）", body.get("code") == 401, f"code={body.get('code')}")

    st, body = call("POST", "/user/email/unbind", body={})
    check("解绑未登录被拒（401）", body.get("code") == 401, f"code={body.get('code')}")

    ghost = f"nobody_{int(time.time())}@example.com"
    st, body = call("POST", "/user/password/forgot/send", body={"email": ghost})
    check("找回密码发码免登录", body.get("code") == 200, f"code={body.get('code')}")

    # ------------------------------------------------------------------
    print("[2] 绑定邮箱（游客 → 普通用户）")
    uid, account = make_guest("bind")
    uids.append(uid)
    tok = token_of(uid)

    check("新号初始是游客", "comment:create" not in perms(tok))
    check("新号没有邮箱", not info(tok).get("user", {}).get("email"))

    st, body = call("POST", "/user/verify/send", tok, {})
    check("没邮箱又没传 email → 400", body.get("code") == 400,
          f"code={body.get('code')} msg={body.get('msg')}")

    email = f"{account}@example.com"
    st, body = call("POST", "/user/verify/send", tok, {"email": email})
    code = (body.get("data") or {}).get("devCode")
    check("发码成功且拿到明文码（dev-echo）", body.get("code") == 200 and bool(code),
          str(body.get("msg")))

    st, body = call("POST", "/user/verify/confirm", tok, {"email": email, "code": "000000"})
    check("验证码错被拒（508）", body.get("code") == 508, f"code={body.get('code')}")

    st, body = call("POST", "/user/verify/confirm", tok, {"email": email, "code": code})
    check("验证码对 → 绑定成功", body.get("code") == 200, str(body.get("msg")))

    d = info(tok)
    check("邮箱已落到账号上", d.get("user", {}).get("email") == email,
          str(d.get("user", {}).get("email")))
    check("emailVerified=true", d.get("user", {}).get("emailVerified") is True)
    check("升级为普通用户（有 post/comment:create）",
          {"post:create", "comment:create"} <= perms(tok), str(sorted(perms(tok))))
    check("primary_role 同步成 member", d.get("user", {}).get("primaryRole") == "member",
          str(d.get("user", {}).get("primaryRole")))

    st, body = call("POST", "/user/verify/send", tok, {})
    check("已绑定再发码 → sent=false 提示无需重复",
          body.get("code") == 200 and (body.get("data") or {}).get("sent") is False,
          str((body.get("data") or {}).get("message")))

    # ------------------------------------------------------------------
    print("[3] 换绑：必须验当前密码")
    # 先把密码设成一个已知值：make_guest 写的是占位串，BCrypt 校验会直接失败，
    # 换绑的「验密码」就测不出来。走的是真实的重置接口，不塞假哈希。
    st, body = call("POST", "/user/password/forgot/send", body={"email": email})
    rcode0 = (body.get("data") or {}).get("devCode")
    st, body = reset_with(rcode0, email, "Known123456")
    check("先把密码设成已知值（为换绑做准备）", body.get("code") == 200, str(body.get("msg")))
    tok = token_of(uid)  # 重置会 token_version+1，旧 token 已失效

    new_email = f"changed_{int(time.time())}@example.com"

    st, body = call("POST", "/user/email/change/send", tok,
                    {"email": new_email, "encryptedData": ""})
    check("不给密码 → 400", body.get("code") == 400,
          f"code={body.get('code')} msg={body.get('msg')}")

    wrong = rsa_encrypt('{"oldPassword":"WrongPass123"}')
    st, body = call("POST", "/user/email/change/send", tok,
                    {"email": new_email, "encryptedData": wrong})
    check("密码错 → 504 且提示是密码不对（不是服务器繁忙）",
          body.get("code") == 504 and "密码" in (body.get("msg") or ""),
          f"code={body.get('code')} msg={body.get('msg')}")

    right = rsa_encrypt('{"oldPassword":"Known123456"}')
    st, body = call("POST", "/user/email/change/send", tok,
                    {"email": email, "encryptedData": right})
    check("换成同一个邮箱 → 400", body.get("code") == 400,
          f"code={body.get('code')} msg={body.get('msg')}")

    st, body = call("POST", "/user/email/change/send", tok,
                    {"email": new_email, "encryptedData": right})
    ccode = (body.get("data") or {}).get("devCode")
    check("密码对 → 新邮箱发码成功", body.get("code") == 200 and bool(ccode),
          str(body.get("msg")))

    st, body = call("POST", "/user/email/change/confirm", tok,
                    {"email": new_email, "code": "000000"})
    check("换绑验证码错 → 508", body.get("code") == 508, f"code={body.get('code')}")

    st, body = call("POST", "/user/email/change/confirm", tok,
                    {"email": new_email, "code": ccode})
    check("换绑成功", body.get("code") == 200, str(body.get("msg")))

    d = info(tok)
    check("邮箱已换成新邮箱", d.get("user", {}).get("email") == new_email,
          str(d.get("user", {}).get("email")))
    check("换绑后仍是已验证（不会掉回待验证）",
          d.get("user", {}).get("emailVerified") is True)
    check("换绑不动角色（仍能发帖评论）",
          {"post:create", "comment:create"} <= perms(tok), str(sorted(perms(tok))))
    check("primary_role 仍是 member", d.get("user", {}).get("primaryRole") == "member")

    # ------------------------------------------------------------------
    print("[4] 换绑后旧邮箱不能找回密码，新邮箱可以")
    st, body = call("POST", "/user/password/forgot/send", body={"email": email})
    check("旧邮箱发码仍走防枚举文案（不暴露「这号已换绑」）",
          body.get("code") == 200 and (body.get("data") or {}).get("sent") is True,
          str((body.get("data") or {}).get("message")))
    st, body = reset_with("123456", email, "Hacked12345")
    # 400（查不到账号）或 508（压根没给它发过码，验证码不存在）都算拒绝，
    # 关键是「重置不成功」—— 先验码再找账号，所以实际走的是 508 那条
    check("用旧邮箱重置被拒（已不属于任何账号）", body.get("code") in (400, 508),
          f"code={body.get('code')} msg={body.get('msg')}")

    st, body = call("POST", "/user/password/forgot/send", body={"email": new_email})
    ncode = (body.get("data") or {}).get("devCode")
    check("新邮箱能收到重置码", body.get("code") == 200 and bool(ncode), str(body.get("msg")))

    # 后面的用例都以「当前绑定的邮箱」为准
    email = new_email

    # ------------------------------------------------------------------
    print("[5] 找回密码全流程")
    # 直接复用上一步拿到的验证码：同一个邮箱 60 秒内只能发一次，
    # 这里再发一次会拿到 sent=false（devCode 为空），那不是找回密码坏了，是限流。
    rcode = ncode
    check("拿到可用的重置验证码", bool(rcode), str(rcode))

    old_hash = scalar(f"SELECT password FROM user WHERE id = {uid}")
    old_tv = int(scalar(f"SELECT token_version FROM user WHERE id = {uid}", "1"))
    # 重置成功后旧 token 会失效，所以下面要备一份新 token

    st, body = reset_with("999999", email, "NewPass123")
    check("错误验证码被拒（508）", body.get("code") == 508, f"code={body.get('code')}")

    st, body = reset_with(rcode, email, "short")
    check("新密码太短被拒（504）", body.get("code") == 504, f"code={body.get('code')}")

    st, body = reset_with(rcode, email, "NewPass123", "Mismatch123")
    check("两次不一致被拒（504）", body.get("code") == 504, f"code={body.get('code')}")

    st, body = reset_with(rcode, email, "NewPass123")
    check("验证码对 → 重置成功", body.get("code") == 200, str(body.get("msg")))

    new_hash = scalar(f"SELECT password FROM user WHERE id = {uid}")
    new_tv = int(scalar(f"SELECT token_version FROM user WHERE id = {uid}", "1"))
    check("密码哈希已变", new_hash != old_hash and new_hash.startswith("$2"))
    check("token_version +1（踢掉其它设备）", new_tv == old_tv + 1, f"{old_tv} → {new_tv}")

    st, body = call("GET", "/user/info", tok)
    check("旧 token 立即失效（401）", body.get("code") == 401, f"code={body.get('code')}")

    fresh = token_of(uid)
    st, body = call("GET", "/user/info", fresh)
    check("新 token 可用", body.get("code") == 200, f"code={body.get('code')}")

    st, body = reset_with(rcode, email, "Another123")
    check("同一个验证码不能复用（508）", body.get("code") == 508, f"code={body.get('code')}")

    # ------------------------------------------------------------------
    print("[6] 防枚举")
    ghost1 = f"ghost_{int(time.time())}@example.com"
    st, body = call("POST", "/user/password/forgot/send", body={"email": ghost1})
    d = body.get("data") or {}
    check("不存在的邮箱也返回 sent=true", body.get("code") == 200 and d.get("sent") is True,
          str(d.get("message")))
    check("文案不暴露账号是否存在", "如果该邮箱" in (d.get("message") or ""),
          str(d.get("message")))

    # ------------------------------------------------------------------
    print("[7] 边界")
    st, body = call("POST", "/user/password/forgot/send", body={"email": "not-an-email"})
    check("邮箱格式错 → 400", body.get("code") == 400, f"code={body.get('code')}")

    st, body = call("POST", "/user/password/forgot/reset", body={
        "email": email, "code": "123456", "encryptedData": ""})
    check("缺 encryptedData → 400", body.get("code") == 400, f"code={body.get('code')}")

    # 另一个账号想抢已经被占用的邮箱
    uid2, acc2 = make_guest("occupy")
    uids.append(uid2)
    tok2 = token_of(uid2)
    st, body = call("POST", "/user/verify/send", tok2, {"email": email})
    check("邮箱已被占用 → 400", body.get("code") == 400, f"code={body.get('code')}")

    # ------------------------------------------------------------------
    print("[8] 解绑：只丢「找回密码」，账号照常发帖评论")
    # 这里 uid 的密码已经被 [5] 重置成 NewPass123，邮箱是 new_email（已验证、member）
    tok = token_of(uid)

    st, body = call("POST", "/user/email/unbind", tok, {})
    check("解绑不给密码 → 400", body.get("code") == 400,
          f"code={body.get('code')} msg={body.get('msg')}")

    st, body = call("POST", "/user/email/unbind", tok,
                    {"encryptedData": rsa_encrypt('{"oldPassword":"WrongPass123"}')})
    check("解绑密码错 → 504 且提示是密码",
          body.get("code") == 504 and "密码" in (body.get("msg") or ""),
          f"code={body.get('code')} msg={body.get('msg')}")

    st, body = call("POST", "/user/email/unbind", tok,
                    {"encryptedData": rsa_encrypt('{"oldPassword":"NewPass123"}')})
    check("密码对 → 解绑成功", body.get("code") == 200, str(body.get("msg")))

    d = info(tok)
    check("邮箱已清空", not d.get("user", {}).get("email"),
          str(d.get("user", {}).get("email")))
    check("emailVerified 归零", d.get("user", {}).get("emailVerified") is False,
          str(d.get("user", {}).get("emailVerified")))
    check("解绑不降级：primary_role 仍是 member",
          d.get("user", {}).get("primaryRole") == "member",
          str(d.get("user", {}).get("primaryRole")))
    check("解绑后仍能发帖评论（权限不回收）",
          {"post:create", "comment:create"} <= perms(tok), str(sorted(perms(tok))))

    st, body = call("POST", "/user/email/unbind", tok, {})
    check("已经解绑过再点一次 → 幂等成功（不验密码也不报错）",
          body.get("code") == 200, f"code={body.get('code')} msg={body.get('msg')}")

    # 解绑后这个邮箱不再属于任何账号：找回密码走防枚举，重置一定失败
    st, body = call("POST", "/user/password/forgot/send", body={"email": email})
    check("解绑后旧邮箱发码仍是防枚举文案（sent=true）",
          body.get("code") == 200 and (body.get("data") or {}).get("sent") is True,
          str((body.get("data") or {}).get("message")))
    st, body = reset_with("123456", email, "Hacked12345")
    check("解绑后该邮箱不能重置密码", body.get("code") in (400, 508),
          f"code={body.get('code')} msg={body.get('msg')}")

    # 解绑之后还能再绑一个（账号没有变成残废状态）
    re_email = f"rebind_{int(time.time())}@example.com"
    st, body = call("POST", "/user/verify/send", tok, {"email": re_email})
    rcode2 = (body.get("data") or {}).get("devCode")
    check("解绑后能重新发码绑定新邮箱", body.get("code") == 200 and bool(rcode2),
          str(body.get("msg")))
    st, body = call("POST", "/user/verify/confirm", tok, {"email": re_email, "code": rcode2})
    check("重新绑定成功", body.get("code") == 200, str(body.get("msg")))

    d = info(tok)
    check("重新绑定后邮箱是新邮箱", d.get("user", {}).get("email") == re_email,
          str(d.get("user", {}).get("email")))
    check("重新绑定后仍是 member（不会重复升级出错）",
          d.get("user", {}).get("primaryRole") == "member"
          and {"post:create", "comment:create"} <= perms(tok),
          f"{d.get('user', {}).get('primaryRole')} {sorted(perms(tok))}")
finally:
    cleanup(uids)

print()
print(f"通过 {len(PASS)} / {len(PASS) + len(FAIL)}")
if FAIL:
    print("失败项：")
    for name in FAIL:
        print("  - " + name)
    raise SystemExit(1)
