"""正文行首缩进（空格 / Tab / 空行）不被吞掉的验收。

背景：正文此前在「前端提交」和「后端入库」两处都做了 trim()，
用户在第一行敲的缩进会被当场删掉，保存和列表都看不出异常，
只有下次点编辑回填时才暴露。这个脚本专门守住这条。

全程用一条临时帖子，测完删掉。
"""
import base64, hashlib, hmac, json, subprocess, sys, time, urllib.request, urllib.error

from _local import jwt_secret, db_password, missing_hint, DB_USER, DB_NAME

SECRET = jwt_secret()
if not SECRET:
    sys.exit(missing_hint("JWT secret"))
BASE = "http://localhost:18080"

PASS, FAIL = [], []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(("  PASS " if ok else "  FAIL ") + name + (f"  ({detail})" if detail else ""))


def mysql(sql):
    out = subprocess.run(
        ["mysql", f"-u{DB_USER}", f"-p{db_password()}", "--default-character-set=utf8mb4",
         "-N", "-B", "--raw", "-e", sql, DB_NAME],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    if out.returncode != 0:
        print("SQL ERROR", out.stderr)
        sys.exit(1)
    return out.stdout


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


def db_text(sql):
    """用 HEX() 取文本，避开 mysql 客户端每行补的 \\n（-N -B 会多一个换行）"""
    hx = mysql(sql).strip()
    return bytes.fromhex(hx).decode("utf-8") if hx else ""


def main():
    rows = subprocess.run(
        ["mysql", f"-u{DB_USER}", f"-p{db_password()}", "--default-character-set=utf8mb4",
         "-N", "-B", "-e", "SELECT id, token_version FROM user WHERE id=1", DB_NAME],
        capture_output=True, text=True, encoding="utf-8").stdout.split()
    admin = make_token(int(rows[0]), int(rows[1]))

    # 期望值：首行两个空格保留、行尾空白去掉、结尾空行去掉
    raw = "  首行两个空格\n第二行有缩进\n\n结尾还有空行\n"
    expect = "  首行两个空格\n第二行有缩进\n\n结尾还有空行"

    print("\n[1] 新建帖子：保留首行缩进，清掉尾部空白")
    st, res = call("POST", "/post/createPost", admin, {"title": "缩进测试帖", "content": raw})
    pid = res.get("data", {}).get("id")
    check("创建成功", bool(pid), f"id={pid} code={res.get('code')}")
    if not pid:
        sys.exit(1)

    db = db_text(f"SELECT HEX(content) FROM post WHERE id={pid}")
    check("库里首行有 2 个空格", db.startswith("  首"), repr(db[:6]))
    check("行尾空白被清掉", db == expect, repr(db))
    check("中间空行保留", "\n\n" in db, repr(db))

    print("\n[2] 接口读回：内容原样")
    st, res = call("GET", f"/post/{pid}", admin)
    got = (res.get("data") or {}).get("content", "")
    check("读回内容与库一致", got == db, repr(got[:10]))

    print("\n[3] 编辑：缩进改成 4 个空格仍在")
    st, res = call("PUT", f"/post/{pid}", admin, {"title": "缩进测试帖", "content": "    改成四个空格\n正文"})
    check("编辑成功", res.get("code") == 200, str(res.get("code")))
    db = db_text(f"SELECT HEX(content) FROM post WHERE id={pid}")
    check("库里首行 4 个空格", db.startswith("    改"), repr(db[:8]))

    print("\n[4] Tab 缩进与开头空行")
    st, res = call("PUT", f"/post/{pid}", admin, {"title": "缩进测试帖", "content": "\n\n\tTab 缩进正文"})
    db = db_text(f"SELECT HEX(content) FROM post WHERE id={pid}")
    check("开头空行被去掉", not db.startswith("\n"), repr(db[:4]))
    check("Tab 缩进保留", db.startswith("\tTab"), repr(db[:6]))

    print("\n[5] 评论：行首缩进同样保留")
    st, res = call("POST", f"/comments/create?postId={pid}", admin,
                   {"content": "   缩进评论\n第二行", "parentId": None, "replyTo": None})
    cid = (res.get("data") or {}).get("id")
    check("评论创建成功", bool(cid), f"id={cid} code={res.get('code')}")
    if cid:
        cdb = db_text(f"SELECT HEX(content) FROM comment WHERE id={cid}")
        check("评论首行 3 个空格", cdb.startswith("   缩"), repr(cdb[:6]))

    print("\n[6] 纯空白不写脏数据")
    st, res = call("POST", f"/comments/create?postId={pid}", admin,
                   {"content": "   \n  ", "parentId": None, "replyTo": None})
    check("纯空格评论被拒", res.get("code") != 200, f"code={res.get('code')}")

    print("\n[7] 清理")
    if cid:
        call("DELETE", f"/comments/{cid}", admin)
    st, res = call("DELETE", f"/post/{pid}", admin)
    check("临时帖子已删除", res.get("code") == 200, str(res.get("code")))
    left = mysql(f"SELECT COUNT(*) FROM post WHERE id={pid}").strip()
    check("帖子行已不存在", left == "0", left)

    print(f"\n===== {len(PASS)} 通过 / {len(FAIL)} 失败 =====")
    if FAIL:
        print("失败项：")
        for f in FAIL:
            print("  - " + f)
        sys.exit(1)


if __name__ == "__main__":
    main()
