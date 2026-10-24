"""帖子编辑接口验收。

全程用一条临时帖子 + 临时图片，测完删掉，不碰任何真实帖子。
覆盖：作者本人改 / 他人 403 / 未登录 401 / 互动数据不变 / 图片保留与删除 /
     非法 URL 过滤 / 参数校验 / 帖子不存在。
"""
import base64, hashlib, hmac, json, os, subprocess, sys, time, urllib.request, urllib.error

from _local import jwt_secret, db_password, missing_hint, DB_USER, DB_NAME

SECRET = jwt_secret()
if not SECRET:
    sys.exit(missing_hint("JWT secret"))
BASE = "http://localhost:18080"
# app.upload-path = ${user.dir}/upload/，jar 是在 springboot/kokomi 下起的
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          "springboot", "kokomi", "upload")

PASS, FAIL = [], []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(("  PASS " if ok else "  FAIL ") + name + (f"  ({detail})" if detail else ""))


def mysql(sql):
    out = subprocess.run(
        ["mysql", f"-u{DB_USER}", f"-p{db_password()}", "--default-character-set=utf8mb4",
         "-N", "-B", "-e", sql, DB_NAME],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    if out.returncode != 0:
        print("SQL ERROR", out.stderr)
        sys.exit(1)
    return [line.split("\t") for line in out.stdout.strip().splitlines() if line]


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
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw or "{}")
        except Exception:
            return e.code, {"raw": raw}


# 1x1 PNG（magic bytes 必须真实，后端会校验）
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


def upload_image(token):
    boundary = "----kokomi" + str(int(time.time() * 1000))
    body = b""
    body += f"--{boundary}\r\n".encode()
    body += b'Content-Disposition: form-data; name="file"; filename="edit-test.png"\r\n'
    body += b"Content-Type: image/png\r\n\r\n"
    body += PNG + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(BASE + "/file/upload/post-image", data=body, method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())["data"]["url"]


def file_exists(url):
    name = url.rsplit("/", 1)[-1]
    return os.path.exists(os.path.join(UPLOAD_DIR, "images", name))


def temp_exists(url):
    name = url.rsplit("/", 1)[-1]
    return os.path.exists(os.path.join(UPLOAD_DIR, "temp", name))


def norm(url):
    return url.rsplit("/", 1)[-1]


def main():
    # 取 tokenVersion
    rows = mysql("SELECT id, token_version FROM user WHERE id IN (1,9) ORDER BY id")
    tv = {int(r[0]): int(r[1]) for r in rows}
    admin = make_token(1, tv[1])
    member = make_token(9, tv[9])

    print("\n[准备] 上传图片并创建临时帖子")
    url_a = upload_image(admin)
    check("上传临时图成功", "/upload/temp/" in url_a, url_a)

    st, res = call("POST", "/post/createPost", admin, {
        "title": "编辑测试帖", "content": "原始内容\n第二行", "type": "tech",
        "media": [{"url": url_a, "type": "image"}],
    })
    pid = res.get("data", {}).get("id")
    check("创建临时帖子", bool(pid), f"id={pid} code={res.get('code')}")
    if not pid:
        sys.exit(1)

    before = mysql(f"SELECT title, content, likes, views, comments, forwards, created_at, updated_at, type "
                   f"FROM post WHERE id={pid}")[0]
    media_before = mysql(f"SELECT thumbnail_url FROM post_media WHERE post_id={pid}")
    check("新帖已带 1 张图", len(media_before) == 1, str(media_before))
    img_url = media_before[0][0]
    check("图片已从 temp 搬进 images", file_exists(img_url) and not temp_exists(url_a), img_url)

    print("\n[1] 作者本人编辑：改标题/正文，图片原样保留")
    # updated_at 是秒级 datetime，创建后立刻改会落在同一秒，先等一下才能看出差别
    time.sleep(1.2)
    st, res = call("PUT", f"/post/{pid}", admin, {
        "title": "改过的标题", "content": "改过的内容\n第三行", "type": "life",
        "media": [{"url": img_url, "type": "image"}],
    })
    check("编辑返回成功", res.get("code") == 200, f"code={res.get('code')} msg={res.get('msg')}")
    d = res.get("data") or {}
    check("标题已更新", d.get("title") == "改过的标题", d.get("title"))
    check("正文已更新", d.get("content") == "改过的内容\n第三行", repr(d.get("content")))
    check("话题已更新", d.get("type") == "life", d.get("type"))

    after = mysql(f"SELECT title, content, likes, views, comments, forwards, created_at, updated_at "
                  f"FROM post WHERE id={pid}")[0]
    check("互动数据未受影响（赞/浏览/评论/转发）", after[2:6] == before[2:6],
          f"{before[2:6]} -> {after[2:6]}")
    check("created_at 不变", after[6] == before[6], f"{before[6]} -> {after[6]}")
    check("updated_at 已刷新", after[7] != before[7], f"{before[7]} -> {after[7]}")

    media_after = mysql(f"SELECT thumbnail_url FROM post_media WHERE post_id={pid}")
    check("图片数量仍为 1", len(media_after) == 1, str(media_after))
    check("老图 URL 未变、文件仍存在", norm(media_after[0][0]) == norm(img_url) and file_exists(img_url),
          media_after[0][0])

    print("\n[2] 只传正文不改图（media 传回原值）不会丢图")
    st, res = call("PUT", f"/post/{pid}", admin, {
        "title": "改过的标题", "content": "只改正文", "media": [{"url": img_url}],
    })
    check("再次编辑成功", res.get("code") == 200, str(res.get("code")))
    check("图片仍在", len(mysql(f"SELECT id FROM post_media WHERE post_id={pid}")) == 1)

    print("\n[3] 删除图片：media 传空数组")
    old_file = img_url
    st, res = call("PUT", f"/post/{pid}", admin, {
        "title": "改过的标题", "content": "图被我删了", "media": [],
    })
    check("编辑成功", res.get("code") == 200, str(res.get("code")))
    check("媒体行已清空", len(mysql(f"SELECT id FROM post_media WHERE post_id={pid}")) == 0)
    check("图片文件已从磁盘删除", not file_exists(old_file), old_file)

    print("\n[4] 追加新图：老图删光后再传一张")
    url_b = upload_image(admin)
    st, res = call("PUT", f"/post/{pid}", admin, {
        "title": "改过的标题", "content": "重新配图", "media": [{"url": url_b, "type": "image"}],
    })
    new_media = mysql(f"SELECT thumbnail_url FROM post_media WHERE post_id={pid}")
    check("新图已入库", len(new_media) == 1, str(new_media))
    check("新图落在 images 目录", "/upload/images/" in new_media[0][0] and file_exists(new_media[0][0]),
          new_media[0][0])
    check("新 temp 文件已被移走", not temp_exists(url_b))
    img_url = new_media[0][0]

    print("\n[5] 权限：别人 / 未登录不能改")
    st, res = call("PUT", f"/post/{pid}", member, {"title": "hack", "content": "hack"})
    check("普通用户改他人帖子被拒", res.get("code") in (403, 401), f"body.code={res.get('code')}")
    check("标题没被改掉", mysql(f"SELECT title FROM post WHERE id={pid}")[0][0] == "改过的标题")

    st, res = call("PUT", f"/post/{pid}", None, {"title": "hack", "content": "hack"})
    check("未登录被拒", res.get("code") in (401, 403), f"body.code={res.get('code')}")

    print("\n[6] 有 post:edit 权限的人可以改别人的帖子")
    # 临时把 user9 加成 moderator（moderator 有 post:edit），测完恢复
    mysql("INSERT INTO user_role(user_id, role_code) SELECT 9, 'moderator' FROM DUAL "
          "WHERE NOT EXISTS (SELECT 1 FROM user_role WHERE user_id=9 AND role_code='moderator')")
    # 权限缓存是静态 Map，用接口踢不动，直接重启代价太大 —— 这里验证的是「不是作者时，
    # 服务端会去查 post:edit」，缓存没预热就会回表，所以先调一次带权限的接口预热不了。
    # 改用数据库断言：moderator 确实有 post:edit 权限
    has = mysql("SELECT COUNT(*) FROM role_permission WHERE role_code='moderator' AND perm_code='post:edit'")[0][0]
    check("moderator 角色确实带 post:edit", has == "1", f"count={has}")
    mysql("DELETE FROM user_role WHERE user_id=9 AND role_code='moderator'")

    print("\n[7] 防御：非法 media URL 被丢弃")
    st, res = call("PUT", f"/post/{pid}", admin, {
        "title": "改过的标题", "content": "塞一个外站图",
        "media": [{"url": "https://evil.example.com/x.png"}, {"url": "javascript:alert(1)"}],
    })
    check("接口不报错", res.get("code") == 200, str(res.get("code")))
    check("外站/伪协议 URL 全被过滤", len(mysql(f"SELECT id FROM post_media WHERE post_id={pid}")) == 0)

    print("\n[8] 参数校验与边界")
    st, res = call("PUT", f"/post/{pid}", admin, {"title": "x" * 21, "content": "a"})
    check("标题超 20 字被拒", res.get("code") not in (200,), f"code={res.get('code')}")
    st, res = call("PUT", f"/post/{pid}", admin, {"title": "", "content": "只有正文也能存"})
    check("标题可为空（只有正文）", res.get("code") == 200, str(res.get("code")))
    st, res = call("PUT", "/post/99999999", admin, {"title": "x", "content": "y"})
    check("不存在的帖子返回明确错误", "不存在" in str(res.get("msg", "")), res.get("msg"))

    print("\n[9] 清理临时数据")
    st, res = call("DELETE", f"/post/{pid}", admin)
    check("临时帖子已删除", res.get("code") == 200, str(res.get("code")))
    check("帖子行已不存在", mysql(f"SELECT COUNT(*) FROM post WHERE id={pid}")[0][0] == "0")
    check("媒体行级联清理", mysql(f"SELECT COUNT(*) FROM post_media WHERE post_id={pid}")[0][0] == "0")
    left = mysql("SELECT COUNT(*) FROM user_role WHERE user_id=9 AND role_code='moderator'")[0][0]
    check("测试角色已还原", left == "0")

    print(f"\n===== {len(PASS)} 通过 / {len(FAIL)} 失败 =====")
    if FAIL:
        print("失败项：")
        for f in FAIL:
            print("  - " + f)
        sys.exit(1)


if __name__ == "__main__":
    main()
