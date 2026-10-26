-- 邮箱验证（防批量注册幽灵号）
-- 用法：mysql -uroot -p --default-character-set=utf8mb4 kokomi < sql_email_verify.sql
--
-- 幂等说明：
--   1. 列不存在才 ADD COLUMN；
--   2. 「把老用户标成已验证」这一步只在**本次刚加列**时执行 ——
--      重跑脚本不会把后来新注册（未验证）的人一起放过。
--   ⚠️ 顺序很重要：先跑这个脚本，再换 jar。jar 里发言前会查 email_verified 列，
--      列不存在会直接 SQL 报错（不是静默放行）。

SET NAMES utf8mb4;

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user'
      AND COLUMN_NAME = 'email_verified'
);

SET @ddl := IF(@col_exists = 0,
    'ALTER TABLE `user` ADD COLUMN `email_verified` TINYINT NOT NULL DEFAULT 0 COMMENT ''邮箱是否已验证：1 已验证 / 0 未验证，未验证只能浏览'' AFTER `ban_reason`',
    'DO 0');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 老用户全部视为已验证：否则换包那一刻全站人都发不了帖
SET @backfill := IF(@col_exists = 0, 'UPDATE `user` SET email_verified = 1', 'DO 0');
PREPARE stmt2 FROM @backfill;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 自检：应该是 1 列；老库此时未验证人数 = 0
SELECT COUNT(*) AS email_verified_column_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'email_verified';

SELECT COUNT(*) AS unverified_users FROM `user` WHERE email_verified = 0;
