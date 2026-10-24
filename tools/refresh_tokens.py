"""刷新 UI 测试用的登录态（shots/tmp/tokens.json）。

为什么要单独一个脚本：token 里有 exp，而且「封禁」会让 token_version +1，
所以静态存下来的 token 迟早失效，测试里一旦 401 很难分辨是环境问题还是代码问题。
每次跑 UI 测试前执行一次，比在每个测试里各写一份签发逻辑可靠。

用法：python refresh_tokens.py
"""
import base64
import hashlib
import hmac
import json
import os
import subprocess
import sys
import time

from _local import jwt_secret, db_password, missing_hint, DB_USER, DB_NAME

SECRET = jwt_secret()
if not SECRET:
    sys.exit(missing_hint("JWT secret"))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "shots", "tmp", "tokens.json")


def mysql(sql):
    out = subprocess.run(
        ["mysql", f"-u{DB_USER}", f"-p{db_password()}", "-N", "-B", "-e", sql, DB_NAME],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    if out.returncode != 0:
        print("SQL ERROR:", out.stderr)
        sys.exit(1)
    return [line.split("\t") for line in out.stdout.strip().splitlines() if line]


def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=")


def make_token(uid, tv, hours=12):
    header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = b64(json.dumps({"sub": str(uid), "tokenVersion": tv,
                              "iat": int(time.time()), "exp": int(time.time()) + hours * 3600},
                             separators=(",", ":")).encode())
    signing = header + b"." + payload
    sig = b64(hmac.new(SECRET, signing, hashlib.sha256).digest())
    return (signing + b"." + sig).decode()


def main():
    rows = mysql("SELECT id, token_version FROM user WHERE id IN (1,9) ORDER BY id")
    tv = {int(r[0]): int(r[1]) for r in rows}
    if 1 not in tv or 9 not in tv:
        sys.exit("缺少测试账号：需要 user id=1（admin）和 id=9（member）")

    data = {
        "admin": make_token(1, tv[1]),
        "member": make_token(9, tv[9]),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    # 只输出长度，不要把 token 打到终端
    print("已刷新 tokens.json  admin=%d字符  member=%d字符" % (len(data["admin"]), len(data["member"])))


if __name__ == "__main__":
    main()
