"""邮箱验证（防批量注册幽灵号）接口验收。

背景：以前注册只校验「邮箱格式对不对」，不验证邮箱是不是你的，
换个邮箱就能无限注册。现在要求收一次验证码才能发言。

覆盖：
  [1] 未验证账号：能登录、能浏览，但发帖 / 评论 / 举报被 507 拦下
  [2] 发码：打码邮箱、60 秒重发限制、已验证的账号不再发
  [3] 验码：错码 508、正确码解锁、幂等、解锁后能正常发帖
  [4] 管理端兜底：普通用户调不动，管理员能手动激活
  [5] 边界：未登录、手机号老账号没有邮箱、连续错 5 次作废

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
create_post = report_api.create_post
create_comment = report_api.create_comment
report = report_api.report

ADMIN_ID, MEMBER_ID = 1, 9
PASS, FAIL = [], []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(("  PASS " if ok else "  FAIL ") + name + (f"  ({detail})" if detail else ""))


def token_of(uid):
    tv = int(scalar(f"SELECT token_version FROM user WHERE id = {uid}", "1"))
    return make_token(uid, tv)


def make_user(tag, verified=0, phone=""):
    """直接建一个账号（绕开 RSA + 图形验证码），返回 id。"""
    stamp = str(int(time.time() * 1000))[-8:]
    account = f"verify_{tag}_{stamp}"
    email = f"'{account}@example.com'" if not phone else "NULL"
    phone_sql = f"'{phone}'" if phone else "NULL"
    mysql(
        "INSERT INTO user (username, password, name, email, phone, email_verified, primary_role) "
        f"VALUES ('{account}', 'x', '{account}', {email}, {phone_sql}, {verified}, 'member')"
    )
    uid = int(scalar(f"SELECT id FROM user WHERE username = '{account}'", "0"))
    if uid:
        mysql(f"INSERT INTO user_role (user_id, role_code) VALUES ({uid}, 'member')")
    return uid


def cleanup(uids):
    for uid in uids:
        if not uid:
            continue
        mysql(f"DELETE FROM user_role WHERE user_id = {uid}")
        mysql(f"DELETE FROM user WHERE id = {uid}")


def send(token):
    st, res = call("POST", "/user/verify/send", token, {})
    return res.get("code"), res.get("data") or {}, res.get("msg")


def confirm(token, code):
    st, res = call("POST", "/user/verify/confirm", token, {"code": code})
    return res.get("code"), res.get("msg")


def email_verified(token):
    st, res = call("GET", "/user/info", token, None)
    return (res.get("data") or {}).get("user", {}).get("emailVerified")


def main():
    admin = token_of(ADMIN_ID)
    created = []
    posts = []

    try:
        print("\n[准备] 造两个未验证账号 + 一个已验证的老用户")
        uname_a = make_user("a", verified=0)
        uname_c = make_user("c", verified=0)
        verified_uid = make_user("ok", verified=1)
        created += [uname_a, uname_c, verified_uid]
        check("三个临时账号已创建", all([uname_a, uname_c, verified_uid]),
              f"{uname_a}/{uname_c}/{verified_uid}")
        if not all([uname_a, uname_c, verified_uid]):
            sys.exit(1)
        a = token_of(uname_a)
        c = token_of(uname_c)
        ok_user = token_of(verified_uid)

        anchor = create_post(admin, "邮箱验证测试-锚点", "给评论和举报做目标")
        posts.append(anchor)

        # ---------------------------------------------------------- 1 未验证的限制
        print("\n[1] 未验证账号：能浏览，但发不出内容")
        st, res = call("GET", "/user/info", a, None)
        check("能读自己的资料（没被禁止登录）", res.get("code") == 200, str(res.get("code")))
        check("资料里 emailVerified=false", email_verified(a) is False, str(email_verified(a)))
        check("帖子列表仍能看", call("GET", "/post/getPosts?pageNum=1&pageSize=3")[1]
              .get("code") == 200)

        st, res = call("POST", "/post/createPost", a,
                       {"title": "未验证不该成功", "content": "正文", "type": "tech"})
        check("发帖被拦，业务码 507", res.get("code") == 507, str(res.get("code")))
        check("提示文案提到验证邮箱", "验证邮箱" in (res.get("msg") or ""), res.get("msg"))

        st, res = call("POST", f"/comments/create?postId={anchor}", a, {"content": "未验证评论"})
        check("评论被拦，业务码 507", res.get("code") == 507, str(res.get("code")))

        st, res = report(a, "post", anchor)
        check("举报被拦，业务码 507", res.get("code") == 507, str(res.get("code")))

        # 点赞不拦：让人连看帖都不能互动，体验太差，且刷赞价值很低
        st, res = call("POST", f"/post/{anchor}/like", a, None)
        check("点赞没被拦（故意放行）", res.get("code") == 200, str(res.get("code")))

        # ---------------------------------------------------------- 2 发码
        print("\n[2] 发送验证码")
        code, data, msg = send(a)
        check("发码成功", code == 200 and data.get("sent") is True, f"{code} {msg}")
        masked = data.get("email") or ""
        check("返回的邮箱已打码", "***" in masked and masked.endswith("@example.com"), masked)
        dev = data.get("devCode") or ""
        check("本地 dev-echo 给了明文验证码（6 位）", len(dev) == 6 and dev.isdigit(), dev)
        check("首次发送倒计时 60 秒", data.get("retryAfter") == 60, str(data.get("retryAfter")))

        code, data, msg = send(a)
        check("60 秒内重发被挡住（不是报错，是 sent=false）",
              code == 200 and data.get("sent") is False, f"{code} {msg}")
        check("挡下时给了倒计时", (data.get("retryAfter") or 0) > 0, str(data.get("retryAfter")))

        code, data, msg = send(ok_user)
        check("已验证账号不再发码", data.get("sent") is False and "已验证" in (data.get("message") or ""),
              f"{data.get('sent')} {data.get('message')}")

        # ---------------------------------------------------------- 3 验码
        print("\n[3] 验证码校验")
        code, msg = confirm(a, "000000" if dev != "000000" else "111111")
        check("错码返回 508", code == 508, f"{code} {msg}")
        check("错码提示剩余次数", "还可以再试" in (msg or ""), msg)

        code, msg = confirm(a, dev)
        check("正确码验证通过", code == 200, f"{code} {msg}")
        check("资料里 emailVerified 变成 true", email_verified(a) is True, str(email_verified(a)))

        code, msg = confirm(a, dev)
        check("重复提交同一个码不报错（幂等）", code == 200, f"{code} {msg}")

        new_post = create_post(a, "验证后应该能发帖", "解锁后的正文")
        check("解锁后能发帖", bool(new_post), f"id={new_post}")
        if new_post:
            posts.append(new_post)

        code, msg = confirm(a, "123456")
        check("已验证的账号再提交随意码也不会报错", code == 200, f"{code} {msg}")

        # ---------------------------------------------------------- 4 管理端兜底
        print("\n[4] 管理端手动激活（发信故障时的兜底）")
        st, res = call("POST", f"/admin/user/{uname_c}/verify", a, {})
        check("普通用户调不动（403）", res.get("code") == 403, str(res.get("code")))

        st, res = call("POST", f"/admin/user/{uname_c}/verify", admin, {})
        check("管理员可以手动激活", res.get("code") == 200, f"{res.get('code')} {res.get('msg')}")
        check("激活后资料里是 true", email_verified(c) is True, str(email_verified(c)))
        c_post = create_post(c, "手动激活后能发帖", "正文")
        check("激活后能发帖", bool(c_post), f"id={c_post}")
        if c_post:
            posts.append(c_post)

        # ---------------------------------------------------------- 5 边界
        print("\n[5] 边界情况")
        st, res = call("POST", "/user/verify/send", None, {})
        check("未登录调发码接口 → 401", res.get("code") == 401, str(res.get("code")))

        phone_uid = make_user("phone", verified=0, phone="13900001111")
        created.append(phone_uid)
        phone_token = token_of(phone_uid)
        st, res = call("POST", "/user/verify/send", phone_token, {})
        check("没有邮箱的老账号发码被拒（400）", res.get("code") == 400, str(res.get("code")))
        check("提示联系管理员激活", "管理员" in (res.get("msg") or ""), res.get("msg"))

        # 连错 5 次：第 5 次直接把码作废
        exp_uid = make_user("exp", verified=0)
        created.append(exp_uid)
        exp = token_of(exp_uid)
        _, data, _ = send(exp)
        real = data.get("devCode")
        wrong = "000000" if real != "000000" else "111111"
        last_code, last_msg = None, ""
        for _ in range(5):
            last_code, last_msg = confirm(exp, wrong)
        check("连错 5 次后码作废（508）", last_code == 508, f"{last_code} {last_msg}")
        code, msg = confirm(exp, real)
        check("作废后连正确码也不认", code == 508, f"{code} {msg}")
        check("作废后仍未验证", email_verified(exp) is False, str(email_verified(exp)))

        print("\n[清理] 删除临时账号与帖子")
    finally:
        cleanup(created)
        for pid in posts:
            if pid:
                mysql(f"DELETE FROM comment WHERE post_id = {pid}")
                mysql(f"DELETE FROM post WHERE id = {pid}")
        print(f"  已清理 {len([x for x in created if x])} 个账号 / {len([x for x in posts if x])} 条帖子")

    print(f"\n通过 {len(PASS)} / 失败 {len(FAIL)}")
    if FAIL:
        print("失败项：\n - " + "\n - ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
