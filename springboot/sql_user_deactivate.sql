-- 用户自助注销（软删除 + PII 清空）
-- 用法：mysql -uroot -p --default-character-set=utf8mb4 kokomi < sql_user_deactivate.sql
--
-- 为什么不用 status = 3：
--   status 现在承载 0 正常 / 1 禁言 / 2 封号，由 BanLevel + UserBanService 判断，
--   往里塞第三态要逐个检查所有 `status = ?` 的地方，漏一处就是「注销了还能发帖」。
--   deleted_at 是正交的：非空即已注销，登录、发言、注册查重各自加一个条件就行。
--
-- ⚠️ 顺序：**先跑本脚本，再换 jar**。jar 里的查询会带 `deleted_at is null`，
--    列不存在会直接 SQL 报错（不是静默返回空）。
--
-- 幂等：列 / 索引不存在才建，重跑不会报错。

SET NAMES utf8mb4;

-- ------------------------------------------------------------------
-- 1. deleted_at 列
-- ------------------------------------------------------------------
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user'
      AND COLUMN_NAME = 'deleted_at'
);

SET @ddl := IF(@col_exists = 0,
    'ALTER TABLE `user` ADD COLUMN `deleted_at` DATETIME NULL DEFAULT NULL COMMENT ''注销时间：非空表示已注销，登录被拒；邮箱/手机/生日等个人信息此时已清空'' AFTER `email_verified`',
    'DO 0');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------
-- 2. 索引：后台按「是否已注销」筛选用得到
--    数据量小，但筛选条件总会带上它，顺手建了
-- ------------------------------------------------------------------
SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user'
      AND INDEX_NAME = 'idx_user_deleted_at'
);

SET @ddl2 := IF(@idx_exists = 0,
    'ALTER TABLE `user` ADD INDEX `idx_user_deleted_at` (`deleted_at`)',
    'DO 0');
PREPARE stmt2 FROM @ddl2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 自检
SELECT COUNT(*) AS deleted_at_column_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'deleted_at';

SELECT COUNT(*) AS deactivated_users FROM `user` WHERE deleted_at IS NOT NULL;
