"""本机开发凭据读取工具（供 tools/ 下的测试脚本共用）。

故意不在代码里写任何明文：
  1. 优先读环境变量 DB_PASSWORD / JWT_SECRET（线上/CI 用这个）；
  2. 否则读 springboot/kokomi/config/application-local.yaml —— 该文件已 gitignore，
     不会进仓库、不会被打进 jar。

为什么值得这么做：JWT secret 泄露等于任何人都能签出一个 admin 的 token，
数据库 root 密码泄露更不用说。测试脚本是最容易被随手提交的一类文件。
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL_YAML = os.path.join(ROOT, "springboot", "kokomi", "config", "application-local.yaml")

DB_USER = os.environ.get("DB_USER", "root")
DB_NAME = os.environ.get("DB_NAME", "kokomi")


def _read_local():
    if not os.path.exists(LOCAL_YAML):
        return ""
    with open(LOCAL_YAML, encoding="utf-8") as f:
        return f.read()


_LOCAL = None


def _local():
    global _LOCAL
    if _LOCAL is None:
        _LOCAL = _read_local()
    return _LOCAL


def _pick(key):
    m = re.search(r"^\s*%s:\s*(\S+)\s*$" % key, _local(), re.M)
    return m.group(1).strip().strip('"').strip("'") if m else ""


def db_password():
    return os.environ.get("DB_PASSWORD") or _pick("password")


def jwt_secret():
    """返回 bytes，直接给 hmac 用。拿不到就返回空 bytes，由调用方报错。"""
    return (os.environ.get("JWT_SECRET") or _pick("secret")).encode()


def missing_hint(what):
    return (
        "缺少 %s：请设置环境变量，或确认 springboot/kokomi/config/application-local.yaml 存在"
        "（该文件不入库）" % what
    )
