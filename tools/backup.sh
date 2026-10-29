#!/bin/bash
#
# kokomi 数据备份 —— 服务器端脚本（数据库 + 图片，7z AES-256 加密）
#
# 仓库里这份是留档，真正跑的是服务器上的 /root/backup.sh。
# 改完这份后要同步过去：scp tools/backup.sh root@<服务器IP>:/root/backup.sh
#
# 部署：chmod +x /root/backup.sh
# 定时：(crontab -l 2>/dev/null; echo '0 4 * * * /root/backup.sh >> /var/log/kokomi-backup.log 2>&1') | crontab -
#
# 依赖三个东西，缺一个都会在第 0 步直接报错退出：
#   /root/.my.cnf       chmod 600，[client] user/password
#   /root/.backup-pass  chmod 600，第一行就是加密密码
#   7z                  apt install p7zip-full
#
# 产物是普通 .7z 包：电脑上双击 → 输密码 → 解出 .sql，不用 gpg 也不用命令行
# （但要装 7-Zip / WinRAR / Bandizip 之一 —— Windows 自带的解压不支持加密包）。
#
# ⚠️ 本文件的换行必须是 LF。从 Windows 拷过去变成 CRLF 的话，bash 会报
#    "$'\r': command not found" 之类莫名其妙的错。
#
# ⚠️ 密码丢了 = 这些包全部报废。密码必须另存两处（密码管理器 + 纸质），
#    不能只存在服务器上 —— 服务器没了密码也跟着没。
#
set -euo pipefail
umask 077   # 备份里有邮箱、密码哈希、帖子内容，只允许 root 读

DIR=/kokomi/backup
PASS_FILE=/root/.backup-pass
D=$(date +%F)
mkdir -p "$DIR"

DB_OUT="$DIR/db-$D.sql.7z"
UP_OUT="$DIR/upload-$D.tar.7z"

# --- 0. 前置检查 -----------------------------------------------------------
[ -r "$PASS_FILE" ] || { echo "错误：$PASS_FILE 不存在或不可读（chmod 600，第一行是密码）" >&2; exit 1; }
PASS_VAL=$(head -1 "$PASS_FILE" | tr -d '\r')   # 只取第一行；顺手去掉 CR，防止密码被 Windows 编辑过
[ -n "$PASS_VAL" ] || { echo "错误：$PASS_FILE 第一行是空的" >&2; exit 1; }
command -v 7z >/dev/null 2>&1 || { echo "错误：找不到 7z，先 apt install p7zip-full" >&2; exit 1; }

rm -f "$DIR"/*.part "$DIR"/.*.part.7z   # 清掉上次中途失败留下的残留

# 7z 只能对真实文件操作（不像 gpg 能直接从 stdin 吃），所以 dump 和 tar 得先
# 落到临时目录。trap 保证无论怎么退出（包括中途报错）都把这个含明文的目录删掉。
TMP=$(mktemp -d /tmp/kokomi-bk.XXXXXX)
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT INT TERM

# --- 1. 数据库 -------------------------------------------------------------
# 这一步写到磁盘的是明文 SQL，只存在于 $TMP 里，打包完立刻由 trap 清掉。
mysqldump --defaults-extra-file=/root/.my.cnf \
  --single-transaction --default-character-set=utf8mb4 \
  kokomi > "$TMP/db-$D.sql"

# 空库的 dump 只有头部注释，几百字节。这里只警告不退出 —— 万一库真被清空，
# 空 dump 好歹还有表结构，比一个包都不留强。真报出来就去查库，别停备份。
DB_SIZE=$(stat -c %s "$TMP/db-$D.sql")
[ "$DB_SIZE" -ge 1024 ] \
  || echo "警告：dump 只有 $DB_SIZE 字节，疑似导出了空库，去查一下" >&2

# 临时名必须以 .7z 结尾，否则 7z 会自动再补一个后缀（变成 xxx.part.7z.7z）。
# 写在同一分区再 mv：mv 是原子的，正式文件名一出现就代表内容完整。
# -mhe=on 连包内文件名一起加密，不输密码连里面有什么都看不到。
7z a -t7z -mhe=on -p"$PASS_VAL" "$DIR/.db-$D.part.7z" "$TMP/db-$D.sql" > /dev/null
mv "$DIR/.db-$D.part.7z" "$DB_OUT"

# --- 2. 图片 ---------------------------------------------------------------
# temp 目录不备份：里面是"传了没提交"的配图残留，本来就该被清理任务删掉。
tar cf "$TMP/upload-$D.tar" -C /kokomi/upload images avatars
7z a -t7z -mhe=on -p"$PASS_VAL" "$DIR/.upload-$D.part.7z" "$TMP/upload-$D.tar" > /dev/null
mv "$DIR/.upload-$D.part.7z" "$UP_OUT"

# --- 3. 自检（这一步就是"我到底能不能恢复"的答案）-------------------------
# 7z t = 用密码完整解一遍并校验 CRC。密码不对、包被截断、磁盘写坏，都会在这一步
# 报错。所以只要脚本跑完是成功的，就说明这些包现在解不开的可能性已经被排除了。
# 不要为了省这一两秒去掉它 —— 没有它，你可能要等到真出事那天才发现包是坏的。
7z t -p"$PASS_VAL" "$DB_OUT"   > /dev/null 2>&1 \
  || { echo "错误：$DB_OUT 自检失败，恢复时会解不开，立刻检查 /root/.backup-pass 和磁盘空间" >&2; exit 1; }
7z t -p"$PASS_VAL" "$UP_OUT" > /dev/null 2>&1 \
  || { echo "错误：$UP_OUT 自检失败，同上" >&2; exit 1; }

# --- 4. 清理旧包 -----------------------------------------------------------
# 服务器本地只留 7 天（够处理"昨天误删"这种近因问题）；长期归档靠拉到本地电脑。
# -mtime +7 实际保留 8 组，不是 7 组。
# ⚠️ 匹配式必须同时认 *.7z 和 *.gz：加密上线前的老包是 .gz 结尾，
#    只写 '*.7z' 会让它们在盘上永远躺着。反过来只写 '*.gz'，
#    加密后的 '*.7z' 一个也删不掉 —— 磁盘会涨爆。
find "$DIR" \( -name '*.7z' -o -name '*.gz' \) -mtime +7 -delete

# --- 5. 成功标记 + 日志 -----------------------------------------------------
# "最近一次备份成没成"就看这个文件的时间，别用目录里文件的 mtime 猜（.part
# 残留会骗人）。万一哪天备份没跑，这个文件的时间就停在昨天 —— 一眼能看出。
touch "$DIR/.last-success"

# 留日志：cron 模式下脚本成功时默认什么也不输出，
# 没有这几行你就分不清"没跑"和"跑了没说话"。
# 把完整路径打出来，省得事后还要 ls 找文件名、或者猜日期格式。
echo "$(date '+%F %T') 备份完成，两个包自检通过（密码能解开）"
echo "  数据库  $(du -h "$DB_OUT" | cut -f1)  $DB_OUT"
echo "  图  片  $(du -h "$UP_OUT" | cut -f1)  $UP_OUT"
echo "  恢复命令  7z x -so -p\"\$(head -1 $PASS_FILE)\" '$DB_OUT' | mysql -u root -p kokomi"
