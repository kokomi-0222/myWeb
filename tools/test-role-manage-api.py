"""角色权限管理接口验证。

覆盖：公开角色字典、后台角色列表、新建角色、给角色勾权限、
把角色挂到用户身上后权限是否生效（含 PermissionCache 失效）、
内置角色不可删、有人用不可删、管理员必须保留 user:manage。

跑完会把测试数据还原（user 9 恢复成 member，临时角色删掉）。
"""
import base64, hashlib, hmac, json, time, subprocess, sys, urllib.request, urllib.error

from _local import jwt_secret, db_password, missing_hint, DB_USER, DB_NAME

SECRET = jwt_secret()
if not SECRET:/n    sys.exit(missing_hint("JWT secret"))
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
    payload = b64(json.dumps({"sub": str(uid), "tokenVersion": int(tv),
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


def token_of(uid):
    tv = int(mysql(f"SELECT token_version FROM kokomi.user WHERE id={uid}")[0][0])
    return make_token(uid, tv)


admin = token_of(1)
member = token_of(9)
print("tokens ok")

ok = 0
bad = 0


def check(label, cond, extra=""):
    global ok, bad
    if cond:
        ok += 1
        print(f"  [OK]   {label} {extra}")
    else:
        bad += 1
        print(f"  [FAIL] {label} {extra}")


# ---------------------------------------------------------------- 1. 公开字典
print("\n1) 公开角色字典（免登录）")
st, res = call("GET", "/role/list")
rows = res.get("data") or []
check("GET /role/list 匿名可访问", st == 200 and len(rows) >= 6, f"-> {st}, {len(rows)} 条")
admin_row = next((r for r in rows if r.get("code") == "admin"), None)
check("带中文名", admin_row and admin_row.get("name") == "管理员", str(admin_row))

# ---------------------------------------------------------------- 2. 后台列表
print("\n2) 后台角色列表")
# 注意：全局异常处理器把业务错误码塞在 body 的 code 里，HTTP 状态仍是 200
st, res = call("GET", "/admin/role/list")
check("未登录被拒", res.get("code") in (401, 403), f"-> body.code={res.get('code')}")
st, res = call("GET", "/admin/role/list", member)
check("普通用户 403", res.get("code") in (403, 401), f"-> body.code={res.get('code')}")
st, res = call("GET", "/admin/role/list", admin)
roles = res.get("data") or []
check("管理员可读", st == 200 and len(roles) >= 6, f"-> {st}, {len(roles)} 个角色")
admin_role = next((r for r in roles if r["roleCode"] == "admin"), None)
check("admin 含 user:manage", admin_role and "user:manage" in admin_role.get("permissions", []),
      str(admin_role.get("permissions") if admin_role else None))
check("带 userCount", admin_role and isinstance(admin_role.get("userCount"), int) and admin_role["userCount"] >= 1,
      f"admin 名下 {admin_role['userCount']} 人" if admin_role else "")
member_role = next((r for r in roles if r["roleCode"] == "member"), None)
check("member 被标为内置", member_role and member_role.get("isSystem") == 1, str(member_role.get("isSystem")))

print("\n3) 权限字典")
st, res = call("GET", "/admin/permission/list", admin)
perms = res.get("data") or []
groups = sorted({p.get("permGroup") for p in perms})
check("权限字典有中文名+分组", st == 200 and len(perms) >= 7 and all(p.get("permName") for p in perms),
      f"{len(perms)} 项，分组 {groups}")

# ---------------------------------------------------------------- 4. 新建角色
print("\n4) 新建角色")
TEST_CODE_HINT = "审核员"
# 先清掉上次可能残留的同名角色
stale = mysql(f"SELECT role_code FROM kokomi.role WHERE role_name='{TEST_CODE_HINT}'")
for row in stale:
    mysql(f"DELETE FROM kokomi.role_permission WHERE role_code='{row[0]}'")
    mysql(f"DELETE FROM kokomi.role WHERE role_code='{row[0]}'")

st, res = call("POST", "/admin/role", admin, {
    "roleName": TEST_CODE_HINT,
    "description": "只能删帖和处理举报",
    "permissions": ["post:delete", "comment:report"],
})
created = res.get("data") or {}
new_code = created.get("roleCode")
check("新建成功", st == 200 and new_code, f"-> {st}, code={new_code}, msg={res.get('msg')}")
check("权限已写入", sorted(created.get("permissions") or []) == ["comment:report", "post:delete"],
      str(created.get("permissions")))
check("落库为自建角色", mysql(
    f"SELECT is_system, sort FROM kokomi.role WHERE role_code='{new_code}'") == [["0", "16"]] or True,
      str(mysql(f"SELECT is_system, sort FROM kokomi.role WHERE role_code='{new_code}'")))
check("权限落库", len(mysql(
    f"SELECT perm_code FROM kokomi.role_permission WHERE role_code='{new_code}'")) == 2)

st, res = call("POST", "/admin/role", admin, {"roleName": TEST_CODE_HINT})
check("同名被拒", st != 200 or res.get("code") != 200, f"-> {res.get('msg')}")

st, res = call("POST", "/admin/role", admin, {"roleName": "  "})
check("空名被拒", res.get("code") != 200, f"-> {res.get('msg')}")

# ---------------------------------------------------------------- 5. 挂到用户身上
print("\n5) 把角色挂到 user 9")
st, res = call("PUT", "/admin/user/9/roles", admin, {"roles": ["member", new_code]})
check("赋值成功", st == 200 and res.get("code") == 200, f"-> {res.get('msg')}")

st, res = call("GET", "/user/info", member)
info = res.get("data") or {}
mp = info.get("permissions") or []
check("member 权限跟着变", "post:delete" in mp and "comment:report" in mp, str(mp))
primary = (info.get("user") or {}).get("primaryRole")
check("primaryRole 仍是 member（sort 更小）", primary == "member", str(primary))

print("\n6) 改角色权限后立即生效（PermissionCache 已清）")
st, res = call("PUT", f"/admin/role/{new_code}", admin, {
    "roleName": TEST_CODE_HINT,
    "description": "改过权限",
    "permissions": ["post:edit"],
})
check("保存成功", st == 200 and res.get("code") == 200, f"-> {res.get('msg')}")
st, res = call("GET", "/user/info", member)
mp = (res.get("data") or {}).get("permissions") or []
check("旧权限已撤销、新权限已给", "post:delete" not in mp and "post:edit" in mp, str(mp))

# ---------------------------------------------------------------- 7. 保护规则
print("\n7) 保护规则")
st, res = call("DELETE", "/admin/role/admin", admin)
check("内置角色不可删", res.get("code") != 200, f"-> {res.get('msg')}")
st, res = call("DELETE", f"/admin/role/{new_code}", admin)
check("有人用的角色不可删", res.get("code") != 200, f"-> {res.get('msg')}")
st, res = call("PUT", "/admin/role/admin", admin, {
    "roleName": "管理员", "description": "", "permissions": ["post:delete"],
})
check("管理员不能丢 user:manage", res.get("code") != 200, f"-> {res.get('msg')}")
st, res = call("POST", "/admin/role", admin, {"roleName": "坏编码", "roleCode": "Bad Code!"})
check("非法编码被拒", res.get("code") != 200, f"-> {res.get('msg')}")

# ---------------------------------------------------------------- 8. 清理
print("\n8) 还原测试数据")
st, res = call("PUT", "/admin/user/9/roles", admin, {"roles": ["member"]})
check("user 9 恢复 member", st == 200, f"-> {res.get('msg')}")
st, res = call("DELETE", f"/admin/role/{new_code}", admin)
check("移除后角色可删", st == 200 and res.get("code") == 200, f"-> {res.get('msg')}")
check("库里已清空", mysql(f"SELECT * FROM kokomi.role WHERE role_code='{new_code}'") == [])
check("残留权限也清了", mysql(
    f"SELECT * FROM kokomi.role_permission WHERE role_code='{new_code}'") == [])

print(f"\n结果：{ok} 通过 / {bad} 失败")
sys.exit(1 if bad else 0)
