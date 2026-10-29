# kokomi 备份拉取 —— 把服务器 /kokomi/backup 下的 .7z（加密包）拉到本地
#
# 用途：服务器上的备份和网站在同一块盘，盘挂了两个一起没。这份本地副本才是
#      真正能救命的那个。
#
# ⚠️ 拉下来的是 7z 加密包（AES-256），没有密码解不开。密码不在这个仓库里，也不在
#    服务器备份目录里 —— 它另存在密码管理器 + 纸质备份中。
#    解密：装个 7-Zip，右键 → 7-Zip → 提取到当前文件夹，输密码即可（Windows 自带解压不支持加密包）。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File tools\pull.ps1
#   或先改下面的 $Server 再挂到「任务计划程序」里定期跑。
#
# 前提：SSH 免密钥。否则 scp 会卡在密码提示上，计划任务里表现为"永远不结束"。
#   配法（在 PowerShell 里）：
#     ssh-keygen -t ed25519
#     type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@<服务器IP> "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
#   验证：ssh -o BatchMode=yes root@<服务器IP> "echo ok"  必须直接打印 ok，不弹密码
#
param(
    [string]$Server    = "root@CHANGE_ME",          # ← 改成你的服务器 IP
    [string]$RemoteDir = "/kokomi/backup",
    [string]$LocalDir  = "D:\kokomi-backup",        # ← 改成你想存的位置
    [int]   $KeepDays  = 60                          # 本地保留天数（服务器只留 7 天）
)

$ErrorActionPreference = "Stop"

# 输出被重定向（进日志、进管道）时切成 UTF-8，否则 Windows PowerShell 5.1
# 会按系统代码页（GBK）写出去，日志里中文全是乱码。控制台交互时不动它，
# 免得反过来跟控制台的 936 打架。
if ([Console]::IsOutputRedirected) { [Console]::OutputEncoding = [Text.Encoding]::UTF8 }

# --- 1. 免密自检：不通过就直接退出，别让计划任务卡死 ---
# 用 BatchMode=yes 让它"连不上就立刻失败"而不是等密码输入；
# 用 ConnectTimeout 兜住网络不通的情况。
ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new $Server "echo ok" | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[失败] SSH 免密登录不可用，scp 会卡在密码提示上。" -ForegroundColor Red
    Write-Host "      先配免密钥，或检查 $Server 这个地址对不对。" -ForegroundColor Red
    exit 1
}

# --- 2. 准备本地目录 ---
if (-not (Test-Path $LocalDir)) {
    New-Item -ItemType Directory -Path $LocalDir -Force | Out-Null
}

# --- 3. 拉取 ---
# 只拉 .7z（加密包）；服务器上的 .part（写到一半的残留）不带下来，避免本地混入不完整文件。
scp -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new `
    "${Server}:${RemoteDir}/*.7z" $LocalDir
if ($LASTEXITCODE -ne 0) {
    Write-Host "[失败] scp 拉取失败（远端没有 .7z，或权限/网络问题）。" -ForegroundColor Red
    exit 1
}

# --- 4. 清理本地过期文件 ---
# 保留期比服务器长得多：服务器 7 天只管"昨天误删"，本地 60 天才能覆盖
# "某次没注意的脏数据一路写到今天"这种慢性问题。
# ⚠️ 只清 *.7z：加密上线前手动拉的 *.gz / *.gpg 不在这里管，要删自己动手 ——
#    留着无害，但别以为它们也被 60 天规则覆盖了。
$expired = Get-ChildItem $LocalDir -Filter *.7z |
           Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) }
if ($expired) {
    $expired | Remove-Item -Force
    Write-Host "清理过期备份 $($expired.Count) 个（超过 $KeepDays 天）"
}

# --- 5. 汇报：打印最新的两个文件，确认大小对得上 ---
Write-Host ""
Write-Host "本地共 $((Get-ChildItem $LocalDir -Filter *.7z).Count) 个备份，最新：" -ForegroundColor Green
Get-ChildItem $LocalDir -Filter *.7z |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 2 |
    Format-Table Name, @{n='大小KB';e={[math]::Round($_.Length/1KB,1)}}, LastWriteTime -AutoSize
