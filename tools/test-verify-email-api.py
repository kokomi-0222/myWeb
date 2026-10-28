"""邮箱绑定（发码 / 验码 / 限流）接口验收。

背景：注册已经不再收邮箱了 —— 新注册的账号是「游客」，只有绑定了邮箱
才能升成「普通用户」去评论。所以这个文件现在只测「绑定」这条链路本身：
发码的频控、验证码的错次与作废、管理端兜底。

等级（谁能发帖 / 谁能评论）在 test-tier-permission-api.py 里测，别在这里重复。

覆盖：
  [1] 发码：打码邮箱、本地 dev-echo 的 6 位明文码、60 秒重发限制、已验证的账号不再发
  [2] 验码：错码 508 + 剩余次数、正确码绑定成功、幂等、重复绑被拒
  [3] 管理端兜底：普通用户调不动，管理员能手动激活
  [4] 边界：未登录、没填邮箱、格式错、邮箱被别人占用、连错 5 次作废

全程用临时账号，测完删干净。依赖本地后端（18080）+ 本地配置里的
app.mail.dev-echo=true（没配 SMTP 时把验证码明文放进响应）。

用法：cd tools && python test-verify-email-api.py
"""
import importlib.util
import os
import sys
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

ADMIN_ID = 1
PASS, FAIL = [], []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(("  PASS " if ok else "  FAIL ") + name + (f"  ({detail})" if detail else ""))


def token_of(uid):
    tv = int(scalar(f"SELECT token_version FROM user WHERE id = {uid}", "1"))
    return make_token(uid, tv)


def make_user(tag, email=None, verified=0, role="guest"):
    """直接建账号（绕开 RSA + 图形验证码），返回 (id, email)。

    email 传 None = 「刚注册的游客」：库里 email 为 NULL，返回的 email
    只是一个还没被任何人用过的地址，用来做后面的「绑定」测试。
    """
    stamp = str(int(time.time() * 1000))[-8:]
    account = f"vfy_{tag}_{stamp}"
    email_sql = "NULL"
    if email is None:
        email = f"{account}@example.com"
    else:
        email_sql = f"'{email}'"
    mysql(
        "INSERT INTO user (username, password, name, email, email_verified, primary_role) "
        f"VALUES ('{account}', 'x', '{account}', {email_sql}, {verified}, '{role}')"
    )
    uid = int(scalar(f"SELECT id FROM user WHERE username = '{account}'", "0"))
    if uid:
        mysql(f"INSERT INTO user_role (user_id, role_code) VALUES ({uid}, '{role}')")
    return uid, email


def cleanup(uids):
    for uid in uids:
        if not uid:
            continue
        mysql(f"DELETE FROM user_role WHERE user_id = {uid}")
        mysql(f"DELETE FROM user WHERE id = {uid}")


def send(token, email=None):
    body = {"email": email} if email else {}
    st, res = call("POST", "/user/verify/send", token, body)
    return res.get("code"), res.get("data") or {}, res.get("msg")


def confirm(token, code, email=None):
    body = {"code": code}
    if email:
        body["email"] = email
    st, res = call("POST", "/user/verify/confirm", token, body)
    return res.get("code"), res.get("msg")


def email_verified(token):
    st, res = call("GET", "/user/info", token, None)
    return (res.get("data") or {}).get("user", {}).get("emailVerified")


def bound_email(uid):
    """库里存的邮箱；没绑过时 mysql CLI 会打出字符串 "NULL"，这里统一成空串。"""
    raw = scalar(f"SELECT IFNULL(email, '') FROM user WHERE id = {uid}", "")
    return "" if raw in ("", "NULL") else raw


def main():
    admin = token_of(ADMIN_ID)
    created = []

    try:
        print("\n[准备] 造一个刚注册的游客（没有邮箱）+ 一个已绑定的老用户")
        guest_id, guest_email = make_user("a", email=None)
        done_id, done_email = make_user("ok", email="ok_case@example.com", verified=1)
        created += [guest_id, done_id]
        check("两个临时账号已创建", all([guest_id, done_id]), f"{guest_id}/{done_id}")
        if not all([guest_id, done_id]):
            sys.exit(1)
        a = token_of(guest_id)
        done = token_of(done_id)
        check("游客账号确实没有邮箱", not bound_email(guest_id), bound_email(guest_id))

        # ---------------------------------------------------------- 1 发码
        print("\n[1] 发送验证码")
        code, data, msg = send(a, guest_email)
        check("填邮箱后发码成功", code == 200 and data.get("sent") is True, f"{code} {msg}")
        masked = data.get("email") or ""
        check("返回的邮箱已打码", "***" in masked and masked.endswith("@example.com"), masked)
        dev = data.get("devCode") or ""
        check("本地 dev-echo 给了明文验证码（6 位）", len(dev) == 6 and dev.isdigit(), dev)
        check("首次发送倒计时 60 秒", data.get("retryAfter") == 60, str(data.get("retryAfter")))

        code, data, msg = send(a, guest_email)
        check("60 秒内重发被挡住（不是报错，是 sent=false）",
              code == 200 and data.get("sent") is False, f"{code} {msg}")
        check("挡下时给了倒计时", (data.get("retryAfter") or 0) > 0, str(data.get("retryAfter")))

        code, data, msg = send(done)
        # 只看语义（不发码 + 说清原因），不逐字比对文案：
        # 后端已经改成「这个账号已经绑过邮箱了，要更换请用换绑」，测试没必要跟着改字
        check("已验证账号不再发码",
              data.get("sent") is False and "已经绑过邮箱" in (data.get("message") or ""),
              f"{data.get('sent')} {data.get('message')}")

        # ---------------------------------------------------------- 2 验码
        print("\n[2] 验证码校验")
        code, msg = confirm(a, "000000" if dev != "000000" else "111111", guest_email)
        check("错码返回 508", code == 508, f"{code} {msg}")
        check("错码提示剩余次数", "还可以再试" in (msg or ""), msg)

        code, msg = confirm(a, dev, guest_email)
        check("正确码绑定成功", code == 200, f"{code} {msg}")
        check("资料里 emailVerified 变成 true", email_verified(a) is True, str(email_verified(a)))
        check("邮箱真的写进库了", bound_email(guest_id) == guest_email, bound_email(guest_id))

        code, msg = confirm(a, dev, guest_email)
        check("重复提交同一个码不报错（幂等）", code == 200, f"{code} {msg}")

        code, msg = confirm(a, "123456", guest_email)
        check("已绑定的账号再提交随意码也不会报错", code == 200, f"{code} {msg}")

        # ---------------------------------------------------------- 3 管理端兜底
        print("\n[3] 管理端手动激活（发信故障时的兜底）")
        cold_id, _ = make_user("cold", email="cold_case@example.com")
        created.append(cold_id)
        cold = token_of(cold_id)
        st, res = call("POST", f"/admin/user/{cold_id}/verify", a, {})
        check("普通用户调不动（403）", res.get("code") == 403, str(res.get("code")))
        st, res = call("POST", f"/admin/user/{cold_id}/verify", admin, {})
        check("管理员可以手动激活", res.get("code") == 200, f"{res.get('code')} {res.get('msg')}")
        check("激活后资料里是 true", email_verified(cold) is True, str(email_verified(cold)))
        check("激活后不再是游客（顺带升级）",
              "member" in (scalar(
                  f"SELECT GROUP_CONCAT(role_code) FROM user_role WHERE user_id={cold_id}", "")
              or ""),
              scalar(f"SELECT GROUP_CONCAT(role_code) FROM user_role WHERE user_id={cold_id}", ""))

        # ---------------------------------------------------------- 4 边界
        print("\n[4] 边界情况")
        st, res = call("POST", "/user/verify/send", None, {"email": "a@b.com"})
        check("未登录调发码接口 → 401", res.get("code") == 401, str(res.get("code")))

        no_mail_id, _ = make_user("nomail", email=None)
        created.append(no_mail_id)
        code, data, msg = send(token_of(no_mail_id))
        check("没传邮箱也没绑过 → 400", code == 400, f"{code} {msg}")
        check("提示让用户先填邮箱", "邮箱" in (msg or ""), msg)

        code, data, msg = send(token_of(no_mail_id), "not-an-email")
        check("邮箱格式不对 → 400", code == 400, f"{code} {msg}")

        code, data, msg = send(token_of(no_mail_id), guest_email)
        check("邮箱已被别的账号绑走 → 400", code == 400, f"{code} {msg}")
        check("提示说清楚是被占用", "已被" in (msg or ""), msg)

        # 连错 5 次：第 5 次直接把码作废
        exp_id, exp_email = make_user("exp", email=None)
        created.append(exp_id)
        exp = token_of(exp_id)
        _, data, _ = send(exp, exp_email)
        real = data.get("devCode")
        wrong = "000000" if real != "000000" else "111111"
        last_code, last_msg = None, ""
        for _ in range(5):
            last_code, last_msg = confirm(exp, wrong, exp_email)
        check("连错 5 次后码作废（508）", last_code == 508, f"{last_code} {last_msg}")
        code, msg = confirm(exp, real, exp_email)
        check("作废后连正确码也不认", code == 508, f"{code} {msg}")
        check("作废后仍未验证", email_verified(exp) is False, str(email_verified(exp)))

        print("\n[清理] 删除临时账号")
    finally:
        cleanup(created)
        print(f"  已清理 {len([x for x in created if x])} 个账号")

    print(f"\n通过 {len(PASS)} / 失败 {len(FAIL)}")
    if FAIL:
        print("失败项：\n - " + "\n - ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
