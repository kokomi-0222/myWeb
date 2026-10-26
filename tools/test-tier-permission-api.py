"""等级制权限（游客 / 普通用户 / 会员）接口验收。

站内规则：
  guest  游客      刚注册 —— 能登录、浏览、点赞，不能发帖也不能评论
  member 普通用户  绑定邮箱后自动升级 —— 能评论 / 回复 / 举报 / 发帖
  vip    会员      管理员授予 —— 权限与普通用户相同，留作以后的档位

对应权限码（见 sql_tier_permission.sql）：
  post:create    发帖（admin / moderator / editor / vip / member）
  comment:create 评论 + 举报（同上）
拒绝码：507 = 还是游客（绑个邮箱就能解决）；509 = 缺发帖权但能评论（只能找站长）。

覆盖：
  [1] 三个档位的权限矩阵（/user/info 的 permissions）
  [2] 发帖闸门：游客 507，普通用户 / 会员放行
  [3] 评论闸门：游客 507，普通用户放行
  [4] 举报闸门：游客 507，普通用户放行
  [5] 绑定邮箱自动升级：guest → member，升级后评论和发帖都通了
  [6] 管理员改等级：改成 guest 立刻不能发帖（缓存失效对不对）
  [7] 只读角色（能评论不能发帖）走 509 分支，而不是 507
  [8] 边界：邮箱被占用、邮箱格式错、未登录、角色不能清空

全程用临时账号与临时帖子，测完删干净。依赖本地后端（18080）+ 本地配置里的
app.mail.dev-echo=true（没配 SMTP 时把验证码明文放进响应）。

用法：cd tools && python test-tier-permission-api.py
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

ADMIN_ID = 1
PASS, FAIL = [], []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(("  PASS " if ok else "  FAIL ") + name + (f"  ({detail})" if detail else ""))


def token_of(uid):
    tv = int(scalar(f"SELECT token_version FROM user WHERE id = {uid}", "1"))
    return make_token(uid, tv)


def make_user(tag, role):
    """直接建账号（绕开 RSA + 图形验证码），返回 (id, email)。"""
    stamp = str(int(time.time() * 1000))[-8:]
    account = f"tier_{tag}_{stamp}"
    email = f"{account}@example.com"
    mysql(
        "INSERT INTO user (username, password, name, email, email_verified, primary_role) "
        f"VALUES ('{account}', 'x', '{account}', NULL, 0, '{role}')"
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


def perms_of(token):
    st, res = call("GET", "/user/info", token, None)
    data = res.get("data") or {}
    return set(data.get("permissions") or []), set(data.get("roles") or [])


def try_post(token, title):
    st, res = call("POST", "/post/createPost", token,
                   {"title": title, "content": "等级制权限测试正文", "type": "life",
                    "media": [], "tags": []})
    return res.get("code"), (res.get("data") or {}).get("id"), res.get("msg")


def try_comment(token, post_id, text):
    st, res = call("POST", f"/comments/create?postId={post_id}", token,
                   {"content": text})
    return res.get("code"), res.get("msg")


def try_report(token, post_id):
    # reasonCode 走后端白名单（spam / porn / abuse / illegal / plagiarism / other），
    # 传中文会被当成非法参数回 400。成功时 data 直接就是举报 id（不是对象）。
    st, res = call("POST", "/report", token,
                   {"targetType": "post", "targetId": post_id,
                    "reasonCode": "spam", "detail": "等级制测试"})
    data = res.get("data")
    rid = data.get("id") if isinstance(data, dict) else data
    return res.get("code"), rid, res.get("msg")


def send_code(token, email=None):
    body = {"email": email} if email else {}
    st, res = call("POST", "/user/verify/send", token, body)
    return res.get("code"), res.get("data") or {}, res.get("msg")


def confirm_code(token, code, email=None):
    body = {"code": code}
    if email:
        body["email"] = email
    st, res = call("POST", "/user/verify/confirm", token, body)
    return res.get("code"), res.get("msg")


def set_roles(admin_token, uid, roles):
    st, res = call("PUT", f"/admin/user/{uid}/roles", admin_token, {"roles": roles})
    return res.get("code"), res.get("msg")


def main():
    admin = token_of(ADMIN_ID)
    created, posts, roles_made = [], [], []

    try:
        print("\n[准备] 造一个游客 / 一个普通用户 / 一个会员")
        guest_id, guest_email = make_user("guest", "guest")
        member_id, member_email = make_user("member", "member")
        vip_id, _ = make_user("vip", "vip")
        created += [guest_id, member_id, vip_id]
        check("三个账号已创建", all([guest_id, member_id, vip_id]),
              f"{guest_id}/{member_id}/{vip_id}")
        if not all([guest_id, member_id, vip_id]):
            sys.exit(1)
        guest, member, vip = token_of(guest_id), token_of(member_id), token_of(vip_id)

        anchor = create_post(vip, "等级制测试-锚点", "给评论和举报当靶子")
        posts.append(anchor)
        check("会员能发帖（锚点帖创建成功）", bool(anchor), f"id={anchor}")
        if not anchor:
            sys.exit(1)

        # ---------------------------------------------------------- 1 权限矩阵
        print("\n[1] 三个档位的权限")
        g_perms, g_roles = perms_of(guest)
        m_perms, m_roles = perms_of(member)
        v_perms, v_roles = perms_of(vip)
        check("游客没有 comment:create", "comment:create" not in g_perms, str(sorted(g_perms)))
        check("游客没有 post:create", "post:create" not in g_perms)
        check("游客角色是 guest", g_roles == {"guest"}, str(g_roles))
        check("普通用户能评论（有 comment:create）", "comment:create" in m_perms,
              str(sorted(m_perms)))
        check("普通用户能发帖（有 post:create）", "post:create" in m_perms, str(sorted(m_perms)))
        check("会员能发帖（有 post:create）", "post:create" in v_perms, str(sorted(v_perms)))
        check("会员也能评论", "comment:create" in v_perms)

        # ---------------------------------------------------------- 2 发帖闸门
        print("\n[2] 发帖：游客被 507 拦，普通用户 / 会员放行")
        code, pid, msg = try_post(guest, "游客不该发出来的帖子")
        # 游客连评论都没有 → 走「去绑邮箱」而不是「找站长」，
        # 因为绑完邮箱他就是普通用户，发帖权自然就有了。
        check("游客发帖返回 507（不是 509）", code == 507, f"{code} {msg}")
        check("提示文案指向绑定邮箱", "邮箱" in (msg or ""), msg)
        code, pid, msg = try_post(member, "普通用户发的帖子")
        check("普通用户发帖成功", code == 200 and bool(pid), f"{code} id={pid}")
        if pid:
            posts.append(pid)
        code, pid, msg = try_post(vip, "会员发的帖子")
        check("会员发帖成功", code == 200 and bool(pid), f"{code} id={pid}")
        if pid:
            posts.append(pid)

        # ---------------------------------------------------------- 3 评论闸门
        print("\n[3] 评论：游客 507，普通用户放行")
        code, msg = try_comment(guest, anchor, "游客的评论")
        check("游客评论返回 507", code == 507, f"{code} {msg}")
        check("提示文案提到绑定邮箱", "邮箱" in (msg or ""), msg)
        code, msg = try_comment(member, anchor, "普通用户的评论")
        check("普通用户评论成功", code == 200, f"{code} {msg}")

        # ---------------------------------------------------------- 4 举报闸门
        print("\n[4] 举报：游客 507，普通用户放行")
        code, rid, msg = try_report(guest, anchor)
        check("游客举报返回 507", code == 507, f"{code} {msg}")
        code, rid, msg = try_report(member, anchor)
        check("普通用户举报成功", code == 200 and bool(rid), f"{code} id={rid}")
        if rid:
            mysql(f"DELETE FROM report WHERE id = {rid}")

        # ---------------------------------------------------------- 5 绑邮箱自动升级
        print("\n[5] 绑定邮箱：游客自动升级成普通用户")
        code, data, msg = send_code(guest, guest_email)
        check("发码成功", code == 200 and data.get("sent"), f"{code} {msg}")
        check("响应里带打码邮箱", "***" in (data.get("email") or ""), data.get("email"))
        dev = data.get("devCode")
        check("本地 dev-echo 给了明文码", bool(dev), str(dev))
        if dev:
            code, msg = confirm_code(guest, dev, guest_email)
            check("验证通过", code == 200, f"{code} {msg}")
            g_perms, g_roles = perms_of(guest)
            check("升级后角色是 member", "member" in g_roles, str(g_roles))
            check("升级后不再是 guest", "guest" not in g_roles, str(g_roles))
            check("升级后有了 comment:create", "comment:create" in g_perms, str(sorted(g_perms)))
            check("升级后也有了 post:create", "post:create" in g_perms, str(sorted(g_perms)))
            code, msg = try_comment(guest, anchor, "升级后的评论")
            check("升级后能评论了", code == 200, f"{code} {msg}")
            code, pid, msg = try_post(guest, "升级成普通用户后能发帖了")
            check("升级后能发帖了", code == 200 and bool(pid), f"{code} {msg}")
            if pid:
                posts.append(pid)
            code, data, msg = send_code(guest, guest_email)
            check("已绑定邮箱不再发码", code == 200 and data.get("sent") is False,
                  f"{code} {msg}")

        # ---------------------------------------------------------- 6 管理员改等级
        print("\n[6] 管理员改等级：立即生效（权限缓存要失效）")
        code, msg = set_roles(admin, member_id, ["guest"])
        check("把普通用户降成游客", code == 200, f"{code} {msg}")
        code, pid, msg = try_post(member, "被降成游客的人发不了帖")
        check("降级后立刻不能发帖（507）", code == 507, f"{code} {msg}")
        code, msg = try_comment(member, anchor, "游客也不能评论了")
        check("降级后连评论也不行", code == 507, f"{code} {msg}")

        code, msg = set_roles(admin, member_id, ["member"])
        check("改回普通用户", code == 200, f"{code} {msg}")
        code, pid, msg = try_post(member, "改回普通用户后又能发帖")
        check("改回来立刻能发帖（不用等缓存过期）", code == 200 and bool(pid),
              f"{code} {msg}")
        if pid:
            posts.append(pid)

        # ---------------------------------------------------------- 7 只读角色 → 509
        print("\n[7] 能评论但不能发帖的自定义角色：走 509 分支")
        # 509 是留给「后台造出来的只读角色」的：他评论是通的，自己解决不了发帖，
        # 所以不能给 507（弹绑定邮箱会让人白绑一遍）。
        ro_code = f"tier_ro_{str(int(time.time() * 1000))[-6:]}"
        ro_name = "只读测试角色"
        mysql(f"INSERT INTO `role` (role_code, role_name, is_system, sort) "
              f"VALUES ('{ro_code}', '{ro_name}', 0, 90)")
        mysql(f"INSERT INTO role_permission (role_code, perm_code) "
              f"VALUES ('{ro_code}', 'comment:create')")
        roles_made.append(ro_code)
        ro_id, _ = make_user("readonly", ro_code)
        created.append(ro_id)
        ro = token_of(ro_id)

        ro_perms, ro_roles = perms_of(ro)
        check("只读角色只有 comment:create", ro_perms == {"comment:create"},
              str(sorted(ro_perms)))
        code, msg = try_comment(ro, anchor, "只读角色能评论")
        check("只读角色评论成功", code == 200, f"{code} {msg}")
        code, pid, msg = try_post(ro, "只读角色不该发出来的帖子")
        check("只读角色发帖返回 509（不是 507）", code == 509, f"{code} {msg}")
        check("509 文案不再说「会员」，而是「没开通」",
              "会员" not in (msg or "") and ("开通" in (msg or "") or "站长" in (msg or "")),
              msg)

        # ---------------------------------------------------------- 8 边界
        print("\n[8] 边界情况")
        # guest 在上一步已经把 guest_email 绑掉了，这里换个账号去抢这个邮箱
        other_id, _ = make_user("other", "guest")
        created.append(other_id)
        code, data, msg = send_code(token_of(other_id), guest_email)
        check("邮箱已被别的账号绑走 → 400", code == 400, f"{code} {msg}")
        check("提示说清楚是被占用", "已被" in (msg or ""), msg)

        code, data, msg = send_code(token_of(other_id), "not-an-email")
        check("邮箱格式不对 → 400", code == 400, f"{code} {msg}")

        st, res = call("POST", "/user/verify/send", None, {"email": "a@b.com"})
        check("未登录取码 → 401", res.get("code") == 401, str(res.get("code")))

        code, msg = set_roles(admin, member_id, [])
        check("角色不能清空（至少留一个）", code != 200, f"{code} {msg}")

    finally:
        print("\n[清理] 删除临时账号与帖子")
        for pid in posts:
            if pid:
                mysql(f"DELETE FROM report WHERE target_type='post' AND target_id={pid}")
                mysql(f"DELETE FROM comment WHERE post_id = {pid}")
                mysql(f"DELETE FROM post WHERE id = {pid}")
        cleanup(created)
        for rc in roles_made:
            mysql(f"DELETE FROM role_permission WHERE BINARY role_code = BINARY '{rc}'")
            mysql(f"DELETE FROM `role` WHERE BINARY role_code = BINARY '{rc}'")
        print(f"  已清理 {len(created)} 个账号 / {len(posts)} 条帖子 / {len(roles_made)} 个临时角色")

    print(f"\n通过 {len(PASS)} / 失败 {len(FAIL)}")
    if FAIL:
        print("失败项：\n - " + "\n - ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
