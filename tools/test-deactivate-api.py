"""注销账号（自助 + 管理员代注销）接口验收。

背景：
  用户要求「自己的号自己删」，《个人信息保护法》第 47 条的删除权。
  做成的是**软删除 + PII 清空**，不是物理 DELETE：
  post.user_id / comment.user_id 是 NOT NULL 且没有级联，删了 user 行
  会让所有帖子变成「查不到作者」的空壳（PostServiceImpl 里 authorMap 取不到）。

覆盖：
  [1] 未登录保护
  [2] 密码校验：缺密码 400、密码错 504、密码对才放行
  [3] 注销后：deleted_at 有值、email/头像/签名清空、username 变 deleted_{id}、
      password 换成随机串、原 token 立即失效、原邮箱+密码登不进去
  [4] 邮箱释放：同一个邮箱能重新注册（uk_user_email 允许多个 NULL）
  [5] 帖子保留：作者显示「已注销用户」，帖子本身还在
  [6] 管理员护栏：不能注销自己、不能注销持 user:manage 的账号
  [7] 管理员代注销：普通用户可以被注销，效果与自助一致
  [8] 后台列表：默认不含已注销，includeDeleted=true 才带出来

全程用临时账号，测完删干净（含帖子）。

用法：cd tools && python test-deactivate-api.py
（需要本地后端 18080 + 本地配置 app.mail.dev-echo=true）
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


# ----------------------------------------------------------------------
# RSA：前端 JSEncrypt 那一套（PKCS#1 v1.5），纯 Python 复刻
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
    msg = text.encode()
    k = (_N.bit_length() + 7) // 8
    pad_len = k - 3 - len(msg)
    pad = bytes(b for b in os.urandom(pad_len * 2) if b != 0)[:pad_len]
    em = b"\x00\x02" + pad + b"\x00" + msg
    c = pow(int.from_bytes(em, "big"), _E, _N)
    return base64.b64encode(c.to_bytes(k, "big")).decode()


PWD = "test123456"


def register_user(tag):
    """走真实注册链路（邮箱验证码 dev-echo），拿到一个密码已知的正常账号。"""
    stamp = str(int(time.time() * 1000))[-8:]
    email = f"del_{tag}_{stamp}@example.com"

    st, body = call("POST", "/user/register/email-code", body={"email": email})
    code = (body.get("data") or {}).get("devCode")
    assert code, f"没拿到验证码: {body}"

    st, body = call("POST", "/user/register/verify-email",
                    body={"email": email, "code": code})
    ticket = (body.get("data") or {}).get("ticket")
    assert ticket, f"没拿到 ticket: {body}"

    cipher = rsa_encrypt('{"password":"%s","confirmPassword":"%s"}' % (PWD, PWD))
    st, body = call("POST", "/user/register",
                    body={"ticket": ticket, "encryptedData": cipher})
    data = body.get("data") or {}
    uid = int((data.get("user") or {}).get("id") or 0)
    assert uid, f"注册失败: {body}"
    return uid, data.get("token"), email


def make_admin(tag):
    """直接插库建一个持 user:manage 的账号（不用走注册，省一次验证码）。"""
    stamp = str(int(time.time() * 1000))[-8:]
    name = f"adm_{tag}_{stamp}"
    mysql("INSERT INTO user (username, password, name, email, email_verified, primary_role) "
          f"VALUES ('{name}', 'x', '{name}', '{name}@example.com', 1, 'admin')")
    uid = int(scalar(f"SELECT id FROM user WHERE username = '{name}'", "0"))
    mysql(f"INSERT INTO user_role (user_id, role_code) VALUES ({uid}, 'admin')")
    # ⚠️ token_version 的 DDL 默认值是 1（不是 0），必须从库里读，不能写死
    return uid, make_token(uid, int(scalar(
        f"SELECT token_version FROM user WHERE id = {uid}", "1")))


def token_of(uid):
    tv = int(scalar(f"SELECT token_version FROM user WHERE id = {uid}", "1"))
    return make_token(uid, tv)


def deactivate(token, pwd=None):
    cipher = rsa_encrypt('{"oldPassword":"%s"}' % pwd) if pwd is not None else ""
    return call("POST", "/user/deactivate", token, {"encryptedData": cipher})


def login(account, pwd):
    """真实登录：图形验证码走 dev-echo 拿明文。"""
    st, body = call("GET", "/captcha")
    d = body.get("data") or {}
    cipher = rsa_encrypt('{"account":"%s","password":"%s"}' % (account, pwd))
    return call("POST", "/user/login", body={
        "captchaKey": d.get("captchaKey"),
        "captchaCode": d.get("captchaCode"),
        "encryptedData": cipher,
    })


def user_row(uid):
    rows = mysql(
        "SELECT username, name, email, avatar, signature, password, deleted_at, "
        "token_version, status FROM user WHERE id = %d" % uid)
    return rows[0] if rows else None


def cleanup(uids):
    for uid in uids:
        if not uid:
            continue
        mysql(f"DELETE FROM post_like WHERE user_id = {uid}")
        mysql(f"DELETE FROM post WHERE user_id = {uid}")
        mysql(f"DELETE FROM comment_like WHERE user_id = {uid}")
        mysql(f"DELETE FROM comment WHERE user_id = {uid}")
        mysql(f"DELETE FROM user_role WHERE user_id = {uid}")
        mysql(f"DELETE FROM user WHERE id = {uid}")


uids = []
try:
    # ------------------------------------------------------------------
    print("[1] 未登录保护")
    st, body = call("POST", "/user/deactivate", body={"encryptedData": ""})
    check("未登录不能注销（401）", body.get("code") == 401, f"code={body.get('code')}")

    # ------------------------------------------------------------------
    print("[2] 密码校验（不可逆操作必须复核身份）")
    uid_a, tok_a, email_a = register_user("self")
    uids.append(uid_a)
    check("测试账号注册成功", uid_a > 0, f"id={uid_a}")

    st, body = deactivate(tok_a, None)
    check("缺密码 → 400", body.get("code") == 400,
          f"code={body.get('code')} msg={body.get('msg')}")

    st, body = deactivate(tok_a, "wrong_password")
    check("密码错 → 504", body.get("code") == 504,
          f"code={body.get('code')} msg={body.get('msg')}")

    before = user_row(uid_a)
    check("密码错时账号没被动过", before and before[6] in ("NULL", ""),
          f"deleted_at={before[6] if before else '?'}")

    # 先发一篇帖，用来验证「作者变成已注销用户」
    mysql("INSERT INTO post (title, content, user_id, type, created_at, updated_at) "
          f"VALUES ('注销测试帖 {uid_a}', '正文', {uid_a}, 'normal', NOW(), NOW())")
    post_id = scalar("SELECT MAX(id) FROM post WHERE user_id = %d" % uid_a, "0")

    # ------------------------------------------------------------------
    print("[3] 自助注销")
    old_hash = before[5]
    st, body = deactivate(tok_a, PWD)
    check("密码正确 → 注销成功", body.get("code") == 200,
          f"code={body.get('code')} msg={body.get('msg')}")

    row = user_row(uid_a)
    check("deleted_at 已写入", row[6] not in ("NULL", ""), f"deleted_at={row[6]}")
    check("邮箱被清空（释放唯一索引）", row[2] == "NULL", f"email={row[2]}")
    check("昵称变成「已注销用户」", row[1] == "已注销用户", f"name={row[1]}")
    check("头像被清空", row[3] == "NULL", f"avatar={row[3]}")
    check("签名被清空", row[4] == "NULL", f"signature={row[4]}")
    check("用户名改成 deleted_{id}", row[0] == f"deleted_{uid_a}", f"username={row[0]}")
    check("密码换成随机串（不再是原哈希）", row[5] != old_hash and len(row[5]) > 20)
    check("token_version +1", int(row[7]) >= 2, f"tv={row[7]}")

    st, body = call("GET", "/user/info", tok_a)
    check("旧 token 立即失效", body.get("code") == 401, f"code={body.get('code')}")

    st, body = login(email_a, PWD)
    check("原邮箱 + 原密码登不进去（501 账号或密码不正确）",
          body.get("code") == 501,
          f"code={body.get('code')} msg={body.get('msg')}")

    # 后面几段都要用管理员身份：帖子列表需要登录态，后台接口需要 user:manage
    admin_id, admin_tok = make_admin("self")
    uids.append(admin_id)

    # ------------------------------------------------------------------
    print("[4] 邮箱释放：同邮箱可重新注册")
    st, body = call("POST", "/user/register/email-code", body={"email": email_a})
    check("原邮箱可以重新发注册码（说明已不被占用）",
          bool((body.get("data") or {}).get("devCode")),
          f"code={body.get('code')} msg={body.get('msg')}")

    # ------------------------------------------------------------------
    print("[5] 帖子保留，作者显示「已注销用户」")
    st, body = call("GET", "/post/getPosts?pageNum=1&pageSize=20&sort=update", admin_tok)
    items = ((body.get("data") or {}).get("list") or [])
    mine = next((p for p in items if str(p.get("id")) == str(post_id)), None)
    if mine is None:
        # 列表没命中就退回单帖接口：可能是分页/排序把它挤出第一页了，
        # 这里要验的是「作者信息」，不是列表顺序
        st, body = call("GET", f"/post/{post_id}", admin_tok)
        mine = body.get("data")
    check("帖子还在（没被连坐删除）", mine is not None, f"post_id={post_id}")
    if mine:
        author = mine.get("author") or {}
        check("作者名显示「已注销用户」", author.get("name") == "已注销用户",
              f"name={author.get('name')}")
        check("作者 id 还挂着（帖子归属没丢）", str(author.get("id")) == str(uid_a),
              f"author.id={author.get('id')}")

    # ------------------------------------------------------------------
    print("[6] 管理员护栏")
    st, body = call("POST", f"/admin/user/{admin_id}/deactivate", admin_tok)
    check("管理员不能注销自己 → 400", body.get("code") == 400,
          f"code={body.get('code')} msg={body.get('msg')}")

    other_admin, other_tok = make_admin("peer")
    uids.append(other_admin)
    st, body = call("POST", f"/admin/user/{other_admin}/deactivate", admin_tok)
    check("不能注销持 user:manage 的账号 → 403", body.get("code") == 403,
          f"code={body.get('code')} msg={body.get('msg')}")

    row = user_row(other_admin)
    check("被拒后对方账号完好", row and row[6] in ("NULL", ""), f"deleted_at={row[6] if row else '?'}")

    # 管理员自己也走不了自助注销
    st, body = deactivate(admin_tok, "x")
    check("管理员自助注销被拒（403）", body.get("code") == 403,
          f"code={body.get('code')} msg={body.get('msg')}")

    # ------------------------------------------------------------------
    print("[7] 管理员代注销普通用户")
    uid_b, tok_b, email_b = register_user("byadmin")
    uids.append(uid_b)

    st, body = call("POST", f"/admin/user/{uid_b}/deactivate", admin_tok)
    check("代注销成功", body.get("code") == 200,
          f"code={body.get('code')} msg={body.get('msg')}")

    row = user_row(uid_b)
    check("代注销同样清空邮箱", row[2] == "NULL", f"email={row[2]}")
    check("代注销同样写 deleted_at", row[6] not in ("NULL", ""), f"deleted_at={row[6]}")

    st, body = call("GET", "/user/info", tok_b)
    check("被注销者旧 token 失效", body.get("code") == 401, f"code={body.get('code')}")

    st, body = call("POST", f"/admin/user/{uid_b}/deactivate", admin_tok)
    check("重复注销 → 400（不能重复清一次）", body.get("code") == 400,
          f"code={body.get('code')} msg={body.get('msg')}")

    # ------------------------------------------------------------------
    print("[8] 后台列表过滤")
    st, body = call("GET", "/admin/users?pageNum=1&pageSize=50", admin_tok)
    ids = [str(u.get("id")) for u in ((body.get("data") or {}).get("list") or [])]
    check("默认列表不含已注销", str(uid_a) not in ids and str(uid_b) not in ids,
          f"共 {len(ids)} 条")

    st, body = call("GET", "/admin/users?pageNum=1&pageSize=50&includeDeleted=true", admin_tok)
    rows = ((body.get("data") or {}).get("list") or [])
    ids = [str(u.get("id")) for u in rows]
    check("includeDeleted=true 才带出来", str(uid_a) in ids and str(uid_b) in ids,
          f"共 {len(ids)} 条")
    hit = next((u for u in rows if str(u.get("id")) == str(uid_a)), None)
    check("列表项带 deletedAt 标记", hit and hit.get("deletedAt"),
          f"deletedAt={hit.get('deletedAt') if hit else '?'}")
    check("已注销的人邮箱为空", hit and not hit.get("email"),
          f"email={hit.get('email') if hit else '?'}")

finally:
    print("\n清理测试数据…")
    cleanup(uids)
    try:
        mysql(f"DELETE FROM post WHERE id = {post_id}")
    except NameError:
        pass
    print(f"\n通过 {len(PASS)} / {len(PASS) + len(FAIL)}")
    if FAIL:
        print("失败项：")
        for f in FAIL:
            print("  - " + f)
