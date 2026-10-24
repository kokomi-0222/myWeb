"""处罚分级（禁言 / 封号）接口验收。

两级处罚的区别：
  status=1 禁言 —— 能登录、能浏览、能点赞，但发不出帖子 / 评论 / 回复
  status=2 封号 —— 连登录都不给

覆盖：后台处罚接口的权限与参数校验、禁言后各接口的实际表现、
     临时处罚到期自动解除、解除后恢复、举报处理里选「禁言」、
     以及「不能处罚自己 / 不能处罚有 user:manage 的人」。

全程用临时账号与临时帖子，测完删干净。

用法：cd tools && python test-ban-level-api.py   （需本地后端跑在 18080）
"""
import importlib.util
import json
import os
import sys
import time

from _local import jwt_secret, missing_hint

# 复用举报测试里的 call / mysql / make_token —— 那套已经跑熟了，
# 复制一份只会让两边的 JWT 细节慢慢走偏。
# 文件名带连字符，不能直接 import，只能按路径加载。
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

BASE = "http://localhost:18080"
ADMIN_ID, MEMBER_ID = 1, 9

PASS, FAIL = [], []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(("  PASS " if ok else "  FAIL ") + name + (f"  ({detail})" if detail else ""))


def token_of(uid):
    """按库里当前的 token_version 现场签一个（绕开登录验证码）"""
    tv = int(scalar(f"SELECT token_version FROM user WHERE id = {uid}", "1"))
    return make_token(uid, tv)


def ban_state(uid):
    rows = mysql(f"SELECT status, ban_until, ban_reason FROM user WHERE id = {uid}")
    if not rows:
        return None
    s, until, reason = rows[0]
    return {"status": int(s), "until": None if until in ("NULL", "") else until, "reason": reason}


def punish(token, uid, level, days, reason=None):
    body = {"level": level, "days": days}
    if reason:
        body["reason"] = reason
    return call("POST", f"/admin/user/{uid}/punish", token, body)


def cleanup(uid):
    mysql(f"DELETE FROM user_role WHERE user_id = {uid}")
    mysql(f"DELETE FROM user WHERE id = {uid}")


def main():
    admin = token_of(ADMIN_ID)
    member = token_of(MEMBER_ID)

    temp_guard_uid = None
    created_posts = []

    try:
        print("\n[准备] 建一条成员临时帖")
        member_post = create_post(member, "处罚分级测试帖", "这是用来测禁言的正文")
        created_posts.append(member_post)
        check("成员帖子已创建", bool(member_post), f"id={member_post}")
        if not member_post:
            sys.exit(1)

        # ---------------------------------------------------------- 1 权限与参数
        print("\n[1] 处罚接口的权限与参数校验")
        st, res = punish(None, MEMBER_ID, 1, 7)
        check("未登录调处罚被拒", res.get("code") == 401, str(res))

        st, res = punish(member, ADMIN_ID, 1, 7)
        check("普通用户调处罚被拒", res.get("code") == 403, res.get("msg", ""))

        st, res = punish(admin, ADMIN_ID, 1, 7)
        check("不能处罚自己", res.get("code") == 400 and "自己" in res.get("msg", ""),
              res.get("msg", ""))

        st, res = punish(admin, MEMBER_ID, 3, 7)
        check("非法处罚级别被拒", res.get("code") == 400, res.get("msg", ""))

        st, res = punish(admin, MEMBER_ID, 1, 0)
        check("时长 0 被拒", res.get("code") == 400, res.get("msg", ""))

        st, res = punish(admin, 99999999, 1, 7)
        check("处罚不存在的用户被拒",
              res.get("code") == 400 and "不存在" in res.get("msg", ""), res.get("msg", ""))

        # 造一个「有后台权限但不是自己」的临时号，验证保护逻辑
        mysql("INSERT INTO user(password, email, primary_role) "
              "VALUES ('x', 'ban_guard_test@local', 'admin')")
        temp_guard_uid = int(scalar("SELECT id FROM user WHERE email = 'ban_guard_test@local'", "0"))
        if temp_guard_uid:
            mysql(f"INSERT INTO user_role(user_id, role_code) VALUES ({temp_guard_uid}, 'admin')")
        st, res = punish(admin, temp_guard_uid, 2, 7)
        check("不能处罚拥有 user:manage 的用户",
              res.get("code") == 403 and "后台" in res.get("msg", ""), res.get("msg", ""))
        check("被拒后对方状态没被改动",
              ban_state(temp_guard_uid)["status"] == 0, str(ban_state(temp_guard_uid)))

        # ---------------------------------------------------------- 2 禁言生效
        print("\n[2] 禁言：能登录浏览，发不出内容")
        before_version = int(scalar(f"SELECT token_version FROM user WHERE id = {MEMBER_ID}", "0"))
        st, res = punish(admin, MEMBER_ID, 1, 7, "刷屏广告")
        check("禁言成功", res.get("code") == 200, res.get("msg", ""))

        state = ban_state(MEMBER_ID)
        check("status 变成 1（禁言）", state["status"] == 1, str(state))
        check("ban_until 有值（7 天后）", state["until"] is not None, str(state["until"]))
        check("ban_reason 写进去了", state["reason"] == "刷屏广告", state["reason"])

        after_version = int(scalar(f"SELECT token_version FROM user WHERE id = {MEMBER_ID}", "0"))
        check("token_version 没变（禁言不踢下线）",
              after_version == before_version, f"{before_version} → {after_version}")

        st, res = call("GET", "/user/info", member)
        check("禁言后原来那份 token 依然有效（不掉线）", res.get("code") == 200, res.get("msg", ""))
        data = res.get("data") or {}
        user_info = data.get("user") or {}
        check("禁言的人 /user/info 返回 status=1", user_info.get("status") == 1,
              str(user_info.get("status")))
        check("/user/info 返回 banReason", user_info.get("banReason") == "刷屏广告",
              str(user_info.get("banReason")))
        check("/user/info 返回 banUntil", bool(user_info.get("banUntil")),
              str(user_info.get("banUntil")))

        st, res = call("GET", "/post/getPosts?pageNum=1&pageSize=5", member)
        check("禁言后仍能浏览帖子列表", res.get("code") == 200, res.get("msg", ""))

        st, res = call("POST", "/post/createPost", member,
                       {"title": "禁言时发帖", "content": "应该被拦", "type": "tech"})
        check("禁言不能发帖（506 专用码）", res.get("code") == 506 and "禁言" in res.get("msg", ""),
              str(res))
        check("提示里带了解除时间", "解除" in res.get("msg", "") or "永久" in res.get("msg", ""),
              res.get("msg", ""))

        st, res = call("POST", f"/comments/create?postId={member_post}", member,
                       {"content": "禁言时评论"})
        check("禁言不能评论（506）", res.get("code") == 506 and "禁言" in res.get("msg", ""),
              str(res))

        st, res = call("PUT", f"/post/{member_post}", member,
                       {"title": "改个标题", "content": "禁言时改自己的旧帖", "type": "tech"})
        check("禁言不能编辑自己的旧帖（506）",
              res.get("code") == 506 and "禁言" in res.get("msg", ""), str(res))

        st, res = call("POST", f"/post/{member_post}/like", member)
        check("禁言仍可以点赞（不算发言）", res.get("code") == 200, res.get("msg", ""))
        call("DELETE", f"/post/{member_post}/like", member)

        # ---------------------------------------------------------- 3 到期自动解除
        print("\n[3] 临时禁言到期后自动解除")

        # 路径一：读用户信息。前端刷新页面 / 点提示卡上的「刷新状态」走的就是这条，
        # 所以它必须能自己把过期处罚清掉，不能只靠发帖才解除。
        mysql(f"UPDATE user SET ban_until = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = {MEMBER_ID}")
        st, res = call("GET", "/user/info", member)
        info = (res.get("data") or {}).get("user") or {}
        check("/user/info 会把过期禁言顺手解除", info.get("status") == 0, str(info.get("status")))
        check("库里 status 也回到 0", ban_state(MEMBER_ID)["status"] == 0, str(ban_state(MEMBER_ID)))
        check("ban_until 被清空", ban_state(MEMBER_ID)["until"] is None, str(ban_state(MEMBER_ID)))

        # 路径二：发内容。有人在页面上挂了一整天没刷新，直接点发布也要放行。
        mysql(f"UPDATE user SET status = 1, ban_reason = '到期测试', "
              f"ban_until = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = {MEMBER_ID}")
        st, res = call("POST", "/post/createPost", member,
                       {"title": "到期后发帖", "content": "应该能发出来", "type": "tech"})
        new_post = (res.get("data") or {}).get("id")
        if new_post:
            created_posts.append(new_post)
        check("到期后可以发帖（顺带自动解除）", res.get("code") == 200, res.get("msg", ""))
        check("发帖那条路也把 status 清回 0", ban_state(MEMBER_ID)["status"] == 0,
              str(ban_state(MEMBER_ID)))
        check("ban_until 被清空", ban_state(MEMBER_ID)["until"] is None, str(ban_state(MEMBER_ID)))

        # ---------------------------------------------------------- 4 封号
        print("\n[4] 封号：连登录都不给")
        st, res = punish(admin, MEMBER_ID, 2, 7, "批量广告号")
        check("封号成功", res.get("code") == 200, res.get("msg", ""))
        check("status 变成 2（封号）", ban_state(MEMBER_ID)["status"] == 2, str(ban_state(MEMBER_ID)))

        st, res = call("GET", "/user/info", member)
        check("封号后旧 token 立刻 401", res.get("code") == 401, res.get("msg", ""))

        # 手签一个版本号正确的新 token（现实中拿不到，这里用来验证兜底）
        member = token_of(MEMBER_ID)
        st, res = call("POST", "/post/createPost", member,
                       {"title": "封号时发帖", "content": "应该被拦", "type": "tech"})
        check("封号后即使 token 有效也发不了帖",
              res.get("code") == 401 and "封禁" in res.get("msg", ""), res.get("msg", ""))

        # ---------------------------------------------------------- 5 解除
        print("\n[5] 解除处罚后恢复")
        st, res = call("POST", f"/admin/user/{MEMBER_ID}/unban", admin)
        check("解除成功", res.get("code") == 200, res.get("msg", ""))
        check("解除后 status=0", ban_state(MEMBER_ID)["status"] == 0, str(ban_state(MEMBER_ID)))
        check("解除后 banReason 清空", ban_state(MEMBER_ID)["reason"] in ("", "NULL"),
              str(ban_state(MEMBER_ID)["reason"]))

        st, res = call("POST", f"/admin/user/{MEMBER_ID}/unban", admin)
        check("重复解除被拒（没有处罚可解）", res.get("code") == 400, res.get("msg", ""))

        # 解禁也不动版本号：手上这份 token 直接恢复，不用再登录一次
        st, res = call("POST", "/post/createPost", member,
                       {"title": "解除后发帖", "content": "恢复正常", "type": "tech"})
        restored_post = (res.get("data") or {}).get("id")
        if restored_post:
            created_posts.append(restored_post)
        check("解禁后同一份 token 立刻能发帖（不用重新登录）", res.get("code") == 200,
              res.get("msg", ""))

        # ---------------------------------------------------------- 6 举报处理里选禁言
        print("\n[6] 举报处理时选择「禁言」")
        st, res = report(admin, "post", member_post, "spam")
        report_id = res.get("data")
        check("举报成员帖子成功", bool(report_id), str(res))

        st, res = call("POST", f"/admin/report/{report_id}/handle", admin, {
            "action": "accept",
            "deleteContent": False,
            "banType": "mute",
            "banDays": 3,
            "banReason": "评论区刷广告",
            "note": "禁言三天",
        })
        check("受理并禁言成功", res.get("code") == 200, res.get("msg", ""))
        check("举报处理把状态设成 1 而不是 2", ban_state(MEMBER_ID)["status"] == 1,
              str(ban_state(MEMBER_ID)))
        check("禁言理由来自举报处理", ban_state(MEMBER_ID)["reason"] == "评论区刷广告",
              str(ban_state(MEMBER_ID)["reason"]))

        # banType=mute 和用户管理页的「禁言」走的是同一个 UserBanService.punish，
        # 两处行为必须一致：都不作废登录态
        st, res = call("GET", "/user/info", member)
        check("举报处理选禁言也不掉线", res.get("code") == 200, res.get("msg", ""))
        info = (res.get("data") or {}).get("user") or {}
        check("接口返回 status=1，前端据此禁用发布框", info.get("status") == 1,
              str(info.get("status")))

        # ---------------------------------------------------------- 7 后台列表
        print("\n[7] 用户管理列表带出处罚字段")
        st, res = call("GET", "/admin/users?pageNum=1&pageSize=50", admin)
        rows = (res.get("data") or {}).get("list") or []
        me = next((r for r in rows if r.get("id") == MEMBER_ID), None)
        check("列表里能查到成员", me is not None)
        if me:
            check("列表里 status=1", me.get("status") == 1, str(me.get("status")))
            check("列表里带 banUntil", bool(me.get("banUntil")), str(me.get("banUntil")))
            check("列表里带 banReason", me.get("banReason") == "评论区刷广告",
                  str(me.get("banReason")))

        # 收尾：把人放出来，否则后面的 UI 测试会一脸懵
        call("POST", f"/admin/user/{MEMBER_ID}/unban", admin)
        check("收尾解禁成功", ban_state(MEMBER_ID)["status"] == 0, str(ban_state(MEMBER_ID)))

    finally:
        print("\n[清理] 删临时帖 / 临时账号")
        for pid in created_posts:
            if pid:
                call("DELETE", f"/post/{pid}", token_of(ADMIN_ID))
        # 万一中途失败，别留下被禁言的账号
        mysql(f"UPDATE user SET status = 0, ban_until = NULL, ban_reason = NULL "
              f"WHERE id = {MEMBER_ID}")
        mysql(f"DELETE FROM report WHERE target_id IN "
              f"({','.join(str(p) for p in created_posts if p) or 0})")
        if temp_guard_uid:
            cleanup(temp_guard_uid)
        left = scalar(f"SELECT COUNT(*) FROM user WHERE email = 'ban_guard_test@local'", "0")
        check("临时账号已清理", left == "0", left)

    print(f"\n===== {len(PASS)} 通过 / {len(FAIL)} 失败 =====")
    if FAIL:
        for name in FAIL:
            print("  ✗ " + name)
        sys.exit(1)


if __name__ == "__main__":
    main()
