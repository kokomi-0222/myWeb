"""
验证「反复点赞只产生一条通知」。

前置：本地后端已启动（localhost:8080），且已执行 sql_notification_dedup.sql。

用法：
  python tools/test-like-dedup.py
配合 SQL 计数：
  mysql ... -e "SELECT COUNT(*) FROM notification WHERE recipient_id=10 AND sender_id=1 AND type='like_post' AND post_id=3"
"""
import base64
import hashlib
import hmac
import json
import time
import urllib.error
import urllib.request

BASE = "http://localhost:8080"
POST_ID = 3
UID, VER = 1, 3
from _local import jwt_secret

SECRET = jwt_secret()
ROUNDS = 5


def b64(raw: bytes) -> bytes:
    return base64.urlsafe_b64encode(raw).rstrip(b"=")


def make_token(uid: int, ver: int) -> str:
    """手工签发 HS256 token，和后端 JwtUtil 的 claim 结构保持一致"""
    header = b64(json.dumps({"alg": "HS256"}, separators=(",", ":")).encode())
    payload = b64(
        json.dumps(
            {"sub": str(uid), "tokenVersion": ver, "exp": int(time.time()) + 3600},
            separators=(",", ":"),
        ).encode()
    )
    sign = b64(hmac.new(SECRET, header + b"." + payload, hashlib.sha256).digest())
    return (header + b"." + payload + b"." + sign).decode()


def call(method: str, path: str, token: str):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, resp.read().decode("utf-8", "ignore")[:100]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "ignore")[:100]
    except Exception as e:  # noqa: BLE001
        return None, str(e)[:100]


def main() -> None:
    token = make_token(UID, VER)

    print(f"帖子 {POST_ID}：用 uid={UID} 反复点赞/取消 {ROUNDS} 轮")
    for i in range(1, ROUNDS + 1):
        like_code, like_body = call("POST", f"/post/{POST_ID}/like", token)
        unlike_code, unlike_body = call("DELETE", f"/post/{POST_ID}/like", token)
        print(f"  第 {i} 轮  点赞={like_code}  取消={unlike_code}  {like_body}")

    code, body = call("POST", f"/post/{POST_ID}/like", token)
    print(f"最后一次点赞（停在已赞状态）: {code} {body}")


if __name__ == "__main__":
    main()
