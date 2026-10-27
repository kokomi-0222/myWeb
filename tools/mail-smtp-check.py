#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
阿里云邮件推送（DirectMail）SMTP 通道自检 —— 不用起后端、不用打包，直接发一封真信。

用法：
    # 1) 凭据放环境变量
    export MAIL_USERNAME=noreply@mail.example.com      # 控制台里的「发信地址」
    export MAIL_PASSWORD='xxxxxx'                      # 该发信地址的 SMTP 密码
    python tools/mail-smtp-check.py you@qq.com

    # 2) 或者写进 springboot/kokomi/config/application-local.yaml 的 spring.mail 段，
    #    脚本会自动读（不读就没法验证，别指望它猜）
    python tools/mail-smtp-check.py you@qq.com

    # 3) 临时指定
    python tools/mail-smtp-check.py you@qq.com --username a@b.com --password xxx

退出码：0 = 发送成功；1 = 参数/配置问题；2 = SMTP 报错（会打印阿里云的错误码对照）。
"""
import argparse
import os
import re
import smtplib
import ssl
import sys
import time
import uuid
from email.header import Header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, formatdate
from pathlib import Path

HOST = os.getenv("MAIL_HOST", "smtpdm.aliyun.com")
PORT = int(os.getenv("MAIL_PORT", "465"))
LOCAL_YAML = Path(__file__).resolve().parent.parent / "springboot/kokomi/config/application-local.yaml"

# 阿里云 SMTP 的常见错误码 → 该去控制台检查什么
ERROR_HINTS = {
    "535": "认证失败：① MAIL_USERNAME 必须是控制台「发信地址」本身（不是阿里云账号/邮箱登录名）；"
           "② MAIL_PASSWORD 是那个发信地址的「SMTP 密码」，不是登录密码、也不是 AccessKey。",
    "553": "发信地址/域名未通过验证：控制台「发信域名」的 SPF、MX、DKIM 是否都显示验证通过？"
           "发信地址是否建在这个域名下？",
    "554": "被拒收：多半是发信域名验证没过、或触发频率限制（免费版 200 封/天、同一收件人有限流）。",
    "502": "命令不支持/被网关拦：确认端口用的是 465(SSL) 或 80，不要用 25 —— "
           "阿里云 ECS 出方向 25 端口默认封禁。",
    "421": "连接被限流或对方临时不可用，稍等再试。",
}


def read_local_yaml():
    """从 gitignored 的 application-local.yaml 里抠 spring.mail.username / password。

    只做最朴素的解析 —— 不引 pyyaml，免得为了发一封信去装依赖。
    """
    if not LOCAL_YAML.exists():
        return None, None
    text = LOCAL_YAML.read_text(encoding="utf-8", errors="ignore")
    user = re.search(r"^\s{2}mail:\s*$.*?^\s{4}username:\s*['\"]?([^'\"\n#]+)", text, re.S | re.M)
    pwd = re.search(r"^\s{2}mail:\s*$.*?^\s{4}password:\s*['\"]?([^'\"\n#]+)", text, re.S | re.M)
    return (user.group(1).strip() if user else None,
            pwd.group(1).strip() if pwd else None)


def main():
    ap = argparse.ArgumentParser(description="阿里云 DirectMail SMTP 自检")
    ap.add_argument("to", help="收件邮箱")
    ap.add_argument("--username", help="发信地址，默认取 MAIL_USERNAME 或本地配置")
    ap.add_argument("--password", help="SMTP 密码，默认取 MAIL_PASSWORD 或本地配置")
    ap.add_argument("--host", default=HOST)
    ap.add_argument("--port", type=int, default=PORT)
    args = ap.parse_args()

    username = args.username or os.getenv("MAIL_USERNAME")
    password = args.password or os.getenv("MAIL_PASSWORD")
    if not username or not password:
        y_user, y_pwd = read_local_yaml()
        username = username or y_user
        password = password or y_pwd
    if not username or not password:
        print("[FAIL] 没有发信凭据：设 MAIL_USERNAME / MAIL_PASSWORD，或用 --username/--password，\n"
              f"       或写进 {LOCAL_YAML} 的 spring.mail 段。", file=sys.stderr)
        return 1

    domain = username.split("@")[-1] if "@" in username else "localhost"
    code = f"{uuid.uuid4().hex[:6].upper()}"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = Header("【心海的小窝】SMTP 通道自检", "utf-8")
    msg["From"] = formataddr((str(Header("心海的小窝", "utf-8")), username))
    msg["To"] = args.to
    msg["Date"] = formatdate(localtime=True)
    # 和 Java 端一致：Message-ID 用发信域，别让收信方看到本机 hostname
    msg["Message-ID"] = f"<{uuid.uuid4()}@{domain}>"

    text = f"SMTP 通道正常。测试码 {code}，收到即说明发信地址、SMTP 密码、域名验证都通过了。"
    html = f"""<div style="padding:20px;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif">
      <p style="font-size:15px;font-weight:600;color:#18191c">心海的小窝 · SMTP 自检</p>
      <p style="font-size:13px;color:#666;line-height:1.7">
        如果你收到了这封信，说明发信通道已经通了：<br/>
        发信地址 <code>{username}</code>、SMTP 密码、域名验证均正常。
      </p>
      <p style="font-size:24px;font-weight:700;letter-spacing:6px;color:#00aeec">{code}</p>
    </div>"""
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    print(f"→ {args.host}:{args.port} (SSL)  from={username}  to={args.to}")
    started = time.time()
    try:
        with smtplib.SMTP_SSL(args.host, args.port,
                              context=ssl.create_default_context(), timeout=15) as smtp:
            smtp.login(username, password)
            smtp.sendmail(username, [args.to], msg.as_string())
    except smtplib.SMTPAuthenticationError as e:
        print(f"[FAIL] 认证失败 {e.smtp_code}: {e.smtp_error!r}", file=sys.stderr)
        print("       " + ERROR_HINTS["535"], file=sys.stderr)
        return 2
    except smtplib.SMTPResponseException as e:
        hint = ERROR_HINTS.get(str(e.smtp_code), "看阿里云控制台「邮件推送 → 发送记录」里的失败原因。")
        print(f"[FAIL] SMTP {e.smtp_code}: {e.smtp_error!r}", file=sys.stderr)
        print("       " + hint, file=sys.stderr)
        return 2
    except (OSError, ssl.SSLError) as e:
        print(f"[FAIL] 连不上 {args.host}:{args.port} —— {e}", file=sys.stderr)
        print("       ① 端口只能 465(SSL) 或 80；② 阿里云 ECS 出方向 25 默认封禁；"
              "③ 本机/服务器安全组是否放行出站。", file=sys.stderr)
        return 2

    print(f"[OK] 已发出（{time.time() - started:.2f}s）。收件箱没看到就翻垃圾箱 —— "
          f"新域名头几封容易被判垃圾，SPF/DKIM 生效后会好转。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
