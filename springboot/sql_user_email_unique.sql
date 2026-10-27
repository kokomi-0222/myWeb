SET NAMES utf8mb4;

-- ============================================================
-- user.email 加唯一索引
-- ------------------------------------------------------------
-- 为什么需要：注册现在必须填邮箱并当场验证，邮箱成了账号的登录凭据之一
-- （找回密码全靠它）。两个账号挂同一个邮箱会造成「重置密码时不知道该改谁」，
-- 应用层的 selectByEmail 只能挡住 99%，并发下仍可能两个请求同时通过。
-- 唯一索引是最后一道硬约束。
--
-- 为什么可以安全加：
--   1. MySQL 的唯一索引允许多个 NULL，存量「没有邮箱」的账号（email IS NULL）
--      不会互相冲突，不需要先补数据；
--   2. 真出现重复时下面的预检查会先报出来，脚本会停下来让你人工处理，
--      不会删任何数据。
--
-- 幂等：索引已存在时执行 DO 0，重复跑没有副作用。
-- ============================================================

-- ---------- 0. 预检查：有重复就先停手 ----------
-- 如果这一步查出行，先人工确认这些账号该保留哪个邮箱，
-- 处理掉重复再往下跑（脚本不会替你删数据）。
SELECT email, COUNT(*) AS dup_count, GROUP_CONCAT(id) AS user_ids
FROM `user`
WHERE email IS NOT NULL AND email <> ''
GROUP BY email
HAVING COUNT(*) > 1;

-- ---------- 1. 加唯一索引 ----------
SET @has_uk := (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'user'
      AND index_name = 'uk_user_email'
);

SET @stmt := IF(@has_uk = 0,
    'ALTER TABLE `user` ADD UNIQUE KEY `uk_user_email` (`email`)',
    'DO 0');

PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- ---------- 2. 自查 ----------
-- 期望看到 key_name = uk_user_email、non_unique = 0
SHOW INDEX FROM `user` WHERE Key_name = 'uk_user_email';

-- 期望 0 行：还有多少账号没邮箱（这些是升级前注册的存量游客，
-- 登录后仍可在「个人中心 → 账号管理」补绑，补绑后自动升普通用户）
SELECT COUNT(*) AS users_without_email
FROM `user`
WHERE email IS NULL OR email = '';
