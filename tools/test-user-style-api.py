import base64, hashlib, hmac, json, time, subprocess, sys, urllib.request

from _local import jwt_secret, db_password, missing_hint, DB_USER, DB_NAME

SECRET = jwt_secret()
if not SECRET:
    sys.exit(missing_hint("JWT secret"))
BASE = "http://localhost:18080"


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
        return e.code, json.loads(e.read().decode() or "{}")


tv = int(mysql("SELECT token_version FROM kokomi.user WHERE id=1")[0][0])
tok = make_token(1, tv)
print("admin token ok, tokenVersion =", tv)

# 1) 后台列表应带 nameColor / roleColor
st, res = call("GET", "/admin/users?pageNum=1&pageSize=20", tok)
users = res.get("data", {}).get("list", [])
print("GET /admin/users ->", st, "共", len(users), "人")
u8 = [u for u in users if u["id"] == 8][0]
print("  user8 原始:", {k: u8.get(k) for k in ("name", "nameColor", "roleColor", "primaryRole")})

# 2) 保存外观
st, res = call("PUT", "/admin/user/8/style", tok,
               {"nameColor": "#2f7de1", "roleColor": "#ff8a00"})
print("PUT /admin/user/8/style ->", st, res.get("msg") or res.get("message"))

st, res = call("GET", "/admin/users?pageNum=1&pageSize=20", tok)
u8b = [u for u in res["data"]["list"] if u["id"] == 8][0]
print("  保存后:", {k: u8b.get(k) for k in ("nameColor", "roleColor")})

# 3) 公开主页要带 roleColor
st, res = call("GET", "/user/profile/8")
p = res.get("data", {})
print("GET /user/profile/8 ->", st, {k: p.get(k) for k in ("name", "nameColor", "roleColor")})

# 4) 帖子列表作者要带 roleColor
st, res = call("GET", "/post/getPosts?pageNum=1&pageSize=5")
posts = res.get("data", {}).get("list", [])
hit = [p for p in posts if p.get("author", {}).get("id") == 8]
if hit:
    a = hit[0]["author"]
    print("帖子作者(id=8) ->", {k: a.get(k) for k in ("name", "nameColor", "roleColor")})
else:
    print("帖子列表里没有 id=8 的帖子（跳过该项），返回", len(posts), "篇")

# 5) 非法颜色要被挡
st, res = call("PUT", "/admin/user/8/style", tok, {"nameColor": "red;background:#000"})
print("非法颜色 ->", st, res.get("msg") or res.get("message"))

# 6) 清空 = 恢复默认
st, res = call("PUT", "/admin/user/8/style", tok, {"nameColor": "", "roleColor": ""})
print("清空 ->", st, res.get("msg") or res.get("message"))
print("数据库现状:", mysql("SELECT id,name_color,role_color FROM kokomi.user WHERE id=8"))

# 7) 没权限的人不能改
tv8 = int(mysql("SELECT token_version FROM kokomi.user WHERE id=9")[0][0])
st, res = call("PUT", "/admin/user/8/style", make_token(9, tv8), {"nameColor": "#123456"})
print("普通用户改别人 ->", st, res.get("msg") or res.get("message"))
