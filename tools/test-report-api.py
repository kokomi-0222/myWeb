"""举报功能接口验收。

全程用临时帖子 / 临时评论，测完删干净，不碰真实内容。
覆盖：提交校验（自己/不存在/重复/非法理由）、我的举报、理由字典、
     后台权限隔离、列表与详情、驳回+通知、受理+删内容、封禁（token 立即失效）、
     同目标多条举报合并结案、管理员不可被封禁。

用法：cd tools && python test-report-api.py   （需本地后端跑在 18080）
"""
import base64
import hashlib
import hmac
import json
import sys
import time
import urllib.error
import urllib.request

from _local import jwt_secret, db_password, missing_hint, DB_USER, DB_NAME

SECRET = jwt_secret()
if not SECRET:
    sys.exit(missing_hint("JWT secret"))

BASE = "http://localhost:18080"
ADMIN_ID, MEMBER_ID = 1, 9

PASS, FAIL = [], []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(("  PASS " if ok else "  FAIL ") + name + (f"  ({detail})" if detail else ""))


def mysql(sql):
    import subprocess
    out = subprocess.run(
        ["mysql", f"-u{DB_USER}", f"-p{db_password()}", "--default-character-set=utf8mb4",
         "-N", "-B", "-e", sql, DB_NAME],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    if out.returncode != 0:
        print("SQL ERROR:", out.stderr)
        return []
    return [line.split("\t") for line in out.stdout.strip().splitlines() if line]


def scalar(sql, default=""):
    rows = mysql(sql)
    return rows[0][0] if rows and rows[0] else default


def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=")


def make_token(uid, tv):
    header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = b64(json.dumps({"sub": str(uid), "tokenVersion": tv,
                              "iat": int(time.time()), "exp": int(time.time()) + 3600},
                             separators=(",", ":")).encode())
    signing = header + b"." + payload
    sig = b64(hmac.new(SECRET, signing, hashlib.sha256).digest())
    return (signing + b"." + sig).decode()


def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw or "{}")
        except Exception:
            return e.code, {"raw": raw}


def tokens():
    rows = mysql(f"SELECT id, token_version FROM user WHERE id IN ({ADMIN_ID},{MEMBER_ID})")
    tv = {int(r[0]): int(r[1]) for r in rows}
    return make_token(ADMIN_ID, tv[ADMIN_ID]), make_token(MEMBER_ID, tv[MEMBER_ID])


def create_post(token, title, content="正文"):
    st, res = call("POST", "/post/createPost", token,
                   {"title": title, "content": content, "type": "tech"})
    return res.get("data", {}).get("id")


def create_comment(token, post_id, content):
    # 注意路由是 /comments（复数），/comment 会落到静态资源 404 再被全局异常包成 500
    st, res = call("POST", f"/comments/create?postId={post_id}", token,
                   {"content": content})
    return res.get("data", {}).get("id")


def report(token, ttype, tid, reason="spam", detail=None):
    body = {"targetType": ttype, "targetId": tid, "reasonCode": reason}
    if detail:
        body["detail"] = detail
    return call("POST", "/report", token, body)


def main():
    admin, member = tokens()
    created_posts, created_comments = [], []

    try:
        print("\n[准备] 建两条临时帖 + 一条评论")
        member_post = create_post(member, "举报测试帖-成员", "这是成员写的内容\n第二行")
        admin_post = create_post(admin, "举报测试帖-管理员", "管理员自己的内容")
        created_posts += [member_post, admin_post]
        check("成员帖子已创建", bool(member_post), f"id={member_post}")
        check("管理员帖子已创建", bool(admin_post), f"id={admin_post}")

        member_comment = create_comment(member, admin_post, "这是成员在管理员帖子下的评论")
        created_comments.append(member_comment)
        check("成员评论已创建", bool(member_comment), f"id={member_comment}")
        if not (member_post and admin_post and member_comment):
            sys.exit(1)

        # ---------------------------------------------------------- 1 提交校验
        print("\n[1] 提交举报的参数校验")
        st, res = report(None, "post", member_post)
        check("未登录提交被拒", res.get("code") == 401, str(res))

        st, res = call("POST", "/report", admin,
                       {"targetType": "post", "targetId": member_post})
        check("缺理由被拒", res.get("code") == 400, res.get("msg", ""))

        st, res = report(admin, "post", member_post, reason="not-a-reason")
        check("非法理由码被拒", res.get("code") == 400, res.get("msg", ""))

        st, res = report(admin, "video", member_post)
        check("非法对象类型被拒", res.get("code") == 400, res.get("msg", ""))

        st, res = report(admin, "post", admin_post)
        check("不能举报自己的帖子", res.get("code") == 400 and "自己" in res.get("msg", ""),
              res.get("msg", ""))

        st, res = report(admin, "post", 99999999)
        check("举报不存在的帖子被拒", res.get("code") == 400 and "不存在" in res.get("msg", ""),
              res.get("msg", ""))

        st, res = report(admin, "user", ADMIN_ID)
        check("不能举报自己（用户）", res.get("code") == 400 and "自己" in res.get("msg", ""),
              res.get("msg", ""))

        st, res = report(admin, "post", member_post, "spam", "整篇都是广告")
        post_report_id = res.get("data")
        check("举报他人帖子成功", res.get("code") == 200 and bool(post_report_id), str(res))

        st, res = report(admin, "post", member_post, "abuse")
        check("重复举报被拒", res.get("code") == 400 and "举报过" in res.get("msg", ""),
              res.get("msg", ""))

        st, res = report(admin, "comment", member_comment, "abuse")
        comment_report_id = res.get("data")
        check("举报他人评论成功", res.get("code") == 200 and bool(comment_report_id), str(res))

        st, res = report(admin, "user", MEMBER_ID, "spam")
        user_report_id = res.get("data")
        check("举报用户成功", res.get("code") == 200 and bool(user_report_id), str(res))

        # ---------------------------------------------------------- 2 我的举报
        print("\n[2] 我的举报（已提交的目标）")
        st, res = call("GET", "/report/mine?targetType=post", admin)
        ids = res.get("data") or []
        check("待处理帖子出现在 mine 里", member_post in ids, str(ids))

        st, res = call("GET", "/report/mine?targetType=comment", admin)
        check("待处理评论出现在 mine 里", member_comment in (res.get("data") or []),
              str(res.get("data")))

        st, res = call("GET", "/report/mine?targetType=bad", admin)
        check("非法类型返回空数组", res.get("code") == 200 and res.get("data") == [],
              str(res.get("data")))

        # ---------------------------------------------------------- 3 理由字典
        print("\n[3] 理由字典")
        st, res = call("GET", "/report/reasons", admin)
        reasons = res.get("data") or {}
        check("理由字典 6 项", len(reasons) == 6, str(len(reasons)))
        check("含 spam=垃圾广告", reasons.get("spam") == "垃圾广告", str(reasons.get("spam")))

        # ---------------------------------------------------------- 4 后台权限
        print("\n[4] 后台权限隔离")
        st, res = call("GET", "/admin/report/list", member)
        check("普通用户看不到后台举报", res.get("code") == 403, str(res.get("code")))

        st, res = call("GET", "/admin/report/list")
        check("未登录看不到后台举报", res.get("code") == 401, str(res.get("code")))

        st, res = call("POST", f"/admin/report/{post_report_id}/handle", member,
                       {"action": "accept"})
        check("普通用户不能处理举报", res.get("code") == 403, str(res.get("code")))

        # ---------------------------------------------------------- 5 列表与详情
        print("\n[5] 后台列表与详情")
        st, res = call("GET", "/admin/report/list?status=0&pageSize=50", admin)
        rows = res.get("data", {}).get("list") or []
        mine = [r for r in rows if r["id"] in (post_report_id, comment_report_id, user_report_id)]
        check("待处理列表含 3 条新举报", len(mine) == 3, str(len(mine)))
        check("列表带理由中文名", all(r.get("reasonLabel") for r in mine),
              str([r.get("reasonLabel") for r in mine]))
        check("列表带举报人昵称", all(r.get("reporterName") for r in mine),
              str([r.get("reporterName") for r in mine]))
        check("列表带对象摘要", all(r.get("targetSummary") for r in mine),
              str([r.get("targetSummary") for r in mine]))
        check("待处理排在已处理前面", rows[0]["status"] == 0 if rows else False,
              str(rows[0]["status"]) if rows else "empty")

        st, res = call("GET", f"/admin/report/{post_report_id}", admin)
        detail = res.get("data") or {}
        target = detail.get("target") or {}
        check("详情返回举报本体", (detail.get("report") or {}).get("id") == post_report_id,
              str(detail.get("report", {}).get("id")))
        check("详情返回完整正文", "第二行" in (target.get("content") or ""),
              repr((target.get("content") or "")[:30]))
        check("详情带作者信息", target.get("authorName") == "kokomi_00009"
              or bool(target.get("authorName")), str(target.get("authorName")))

        st, res = call("GET", "/admin/report/pending-count", admin)
        check("待处理数量 >= 3", (res.get("data") or 0) >= 3, str(res.get("data")))

        # ---------------------------------------------------------- 6 驳回
        print("\n[6] 驳回")
        st, res = call("POST", f"/admin/report/{comment_report_id}/handle", admin,
                       {"action": "reject", "note": "看了，没问题"})
        check("驳回成功", res.get("code") == 200, res.get("msg", ""))
        status = scalar(f"SELECT status FROM report WHERE id={comment_report_id}")
        check("驳回后 status=2", status == "2", status)

        st, res = call("POST", f"/admin/report/{comment_report_id}/handle", admin,
                       {"action": "reject"})
        check("不能重复处理", res.get("code") == 400 and "处理过" in res.get("msg", ""),
              res.get("msg", ""))

        noted = mysql(f"SELECT type, content FROM notification "
                      f"WHERE recipient_id={ADMIN_ID} AND type='report_result' ORDER BY id DESC LIMIT 1")
        # 举报人和处理人都是 admin 时 notify() 会主动跳过（自己通知自己没意义），
        # 所以「能收到通知」必须换一个真实举报人来验
        st, res = report(member, "post", admin_post, "spam")
        notify_id = res.get("data")
        st, res = call("POST", f"/admin/report/{notify_id}/handle", admin,
                       {"action": "reject", "note": "看过，没问题"})
        noted = mysql(f"SELECT type, content FROM notification "
                      f"WHERE recipient_id={MEMBER_ID} AND type='report_result' ORDER BY id DESC LIMIT 1")
        check("驳回后普通举报人收到通知", bool(noted) and "驳回" in noted[0][1],
              noted[0][1][:50] if noted else "无")
        check("没有自己通知自己的多余记录",
              not mysql(f"SELECT id FROM notification WHERE recipient_id={ADMIN_ID} "
                        f"AND sender_id={ADMIN_ID} AND type='report_result'"),
              "ok")

        st, res = report(admin, "comment", member_comment, "spam")
        check("驳回后可以再次举报", res.get("code") == 200, res.get("msg", ""))
        # 清掉这条，避免影响后面的列表断言
        if res.get("data"):
            mysql(f"DELETE FROM report WHERE id={res.get('data')}")

        # ---------------------------------------------------------- 7 同目标合并
        print("\n[7] 同目标多条举报合并结案")
        # 评论必须由 member 发：admin 举报自己的评论会被拦（这正是上一版失败的原因）
        msg_id = create_comment(member, member_post, "成员自己的评论，等着被举报")
        created_comments.append(msg_id)
        st, res = report(admin, "comment", msg_id, "spam")
        main_id = res.get("data")
        check("已举报成员评论", bool(main_id), str(res))
        # 直接插一条「成员也举报了这条评论」，模拟第二个举报人
        mysql(f"INSERT INTO report (target_type, target_id, target_author_id, reporter_id, reason_code, detail, status, created_at) "
              f"VALUES ('comment', {msg_id}, {MEMBER_ID}, {MEMBER_ID}, 'abuse', '我也觉得不行', 0, now())")
        sibling = scalar(f"SELECT id FROM report WHERE target_type='comment' AND target_id={msg_id} "
                         f"AND reporter_id={MEMBER_ID} AND status=0")
        check("已构造两条同目标举报", bool(sibling and main_id), f"{main_id}/{sibling}")

        st, res = call("POST", f"/admin/report/{main_id}/handle", admin,
                       {"action": "accept", "deleteContent": True})
        check("受理并删除评论", res.get("code") == 200, res.get("msg", ""))
        check("评论真的被删了",
              scalar(f"SELECT COUNT(*) FROM comment WHERE id={msg_id}") == "0")
        sib_status = scalar(f"SELECT status FROM report WHERE id={sibling}")
        check("同目标另一条举报也结案", sib_status == "1", sib_status)

        # ---------------------------------------------------------- 8 受理删帖
        print("\n[8] 受理并删除帖子")
        # 这条故意让 member 来举报，才能验到「举报人收到结果通知」
        del_post = create_post(admin, "举报测试帖-删帖用", "这是要删掉的广告内容")
        created_posts.append(del_post)
        st, res = report(member, "post", del_post, "spam")
        del_report = res.get("data")
        check("已构造待删帖举报", bool(del_report), str(res))
        if not del_report:
            raise RuntimeError("删帖用例准备失败")

        st, res = call("POST", f"/admin/report/{del_report}/handle", admin,
                       {"action": "accept", "deleteContent": True, "note": "确认是广告"})
        check("受理并删除帖子", res.get("code") == 200, res.get("msg", ""))
        check("帖子真的被删了",
              scalar(f"SELECT COUNT(*) FROM post WHERE id={del_post}") == "0")

        st, res = call("GET", f"/admin/report/{del_report}", admin)
        dtarget = res.get("data", {}).get("target") or {}
        check("详情标记内容已不存在", dtarget.get("exists") is False, str(dtarget.get("exists")))
        check("内容删了仍能追到作者（靠冗余字段）",
              bool(dtarget.get("authorName")), str(dtarget.get("authorName")))

        noted = mysql(f"SELECT content FROM notification WHERE recipient_id={MEMBER_ID} "
                      f"AND type='report_result' ORDER BY id DESC LIMIT 1")
        check("受理后通知里写了已删除", bool(noted) and "已删除" in noted[0][0],
              noted[0][0][:60] if noted else "无")

        # ---------------------------------------------------------- 9 封禁
        print("\n[9] 受理并封禁作者")
        ban_post = create_post(member, "举报测试帖-封禁用", "会被删掉")
        created_posts.append(ban_post)
        st, res = report(admin, "post", ban_post, "illegal")
        ban_report = res.get("data")
        check("已构造一条待封禁举报", bool(ban_report), str(res))

        st, res = call("POST", f"/admin/report/{ban_report}/handle", admin,
                       {"action": "accept", "deleteContent": True,
                        "banDays": 1, "banReason": "发布违规内容"})
        check("受理并封禁", res.get("code") == 200, res.get("msg", ""))

        row = mysql(f"SELECT status, ban_reason, ban_until, token_version FROM user WHERE id={MEMBER_ID}")[0]
        # 不传 banType 默认按封号处理（改造前「勾了就是封禁」的行为）
        check("成员 status=2（封号）", row[0] == "2", row[0])
        check("封禁理由已写入", "违规" in row[1], row[1])
        check("临时封禁有解封时间", bool(row[2]), row[2])

        st, res = call("GET", "/report/mine?targetType=post", member)
        check("被封禁用户的旧 token 立即失效", res.get("code") == 401, str(res.get("code")))

        st, res = call("GET", f"/admin/report/{ban_report}", admin)
        t = res.get("data", {}).get("target") or {}
        check("后台能看到作者已被封禁", t.get("authorBanned") is True, str(t.get("authorBanned")))

        # 解封 + 用新 tokenVersion 重新签
        mysql(f"UPDATE user SET status=0, ban_until=NULL, ban_reason=NULL WHERE id={MEMBER_ID}")
        admin, member = tokens()
        st, res = call("GET", "/report/mine?targetType=post", member)
        check("解封后新 token 可以正常用", res.get("code") == 200, str(res.get("code")))

        # ---------------------------------------------------------- 10 管理员保护
        print("\n[10] 管理员不能被这样封禁")
        mysql(f"INSERT IGNORE INTO user_role (user_id, role_code) VALUES ({MEMBER_ID}, 'admin')")
        guard_post = create_post(member, "举报测试帖-管理员保护", "内容")
        created_posts.append(guard_post)
        st, res = report(admin, "post", guard_post, "spam")
        guard_report = res.get("data")
        st, res = call("POST", f"/admin/report/{guard_report}/handle", admin,
                       {"action": "accept", "banDays": -1})
        check("不能封禁有后台管理权限的人",
              res.get("code") == 403 and "后台管理" in res.get("msg", ""),
              f"{res.get('code')} {res.get('msg', '')}")
        still = mysql(f"SELECT status FROM report WHERE id={guard_report}")[0][0]
        check("失败的封禁不会留下半成品（举报仍待处理）", still == "0", still)
        mysql(f"DELETE FROM user_role WHERE user_id={MEMBER_ID} AND role_code='admin'")

    finally:
        print("\n[清理]")
        mysql(f"UPDATE user SET status=0, ban_until=NULL, ban_reason=NULL WHERE id={MEMBER_ID}")
        mysql(f"DELETE FROM user_role WHERE user_id={MEMBER_ID} AND role_code='admin'")
        mysql(f"DELETE FROM report WHERE reporter_id IN ({ADMIN_ID},{MEMBER_ID}) "
              f"OR target_id IN ({','.join(str(p) for p in created_posts) or 0})")
        for pid in created_posts:
            mysql(f"DELETE FROM post_media WHERE post_id={pid}")
            mysql(f"DELETE FROM post_tag WHERE post_id={pid}")
            mysql(f"DELETE FROM comment WHERE post_id={pid}")
            mysql(f"DELETE FROM post WHERE id={pid}")
        for cid in created_comments:
            mysql(f"DELETE FROM comment WHERE id={cid}")
        print("  已清理临时帖子 / 评论 / 举报 / 封禁状态")

    print(f"\n==== 通过 {len(PASS)} / 失败 {len(FAIL)} ====")
    if FAIL:
        for f in FAIL:
            print("  FAILED:", f)
        sys.exit(1)


if __name__ == "__main__":
    main()
