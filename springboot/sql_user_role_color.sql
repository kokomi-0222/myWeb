-- =============================================================
-- 新增 user.role_color：身份标签（名字旁那个小方块）的底色
--
-- 背景：这个方块原来的底色直接借用 name_color，
--       想单独给标签配色就必须拆出独立字段。
--
-- 规则：role_color 为空 → 前端回退用 name_color（老数据视觉完全不变）；
--       为空串则视为未设置，后端写入时会转成 NULL。
--
-- 可重复执行（列已存在则跳过）。
-- 执行：mysql -uroot -p --default-character-set=utf8mb4 kokomi < sql_user_role_color.sql
-- =============================================================

SET NAMES utf8mb4;

-- -------------------------------------------------------------
-- 1. 加列（MySQL 8 不支持 ADD COLUMN IF NOT EXISTS，用预处理语句自己判断）
-- -------------------------------------------------------------
SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'user'
        AND COLUMN_NAME = 'role_color'
    ),
    'SELECT ''role_color 已存在，跳过'' AS step',
    'ALTER TABLE `user` ADD COLUMN `role_color` varchar(20) NULL DEFAULT NULL COMMENT ''身份标签底色 #RRGGBB，空则回退 name_color'' AFTER `name_color`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -------------------------------------------------------------
-- 2. 复验
-- -------------------------------------------------------------
SELECT '--- [复验] user 表的颜色相关列（应能看到 role_color） ---' AS info;
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'user'
  AND COLUMN_NAME IN ('name_color', 'role_color');

SELECT '--- [复验] 现有用户的颜色设置（role_color 全为 NULL 是正常的） ---' AS info;
SELECT id, name, name_color, role_color FROM `user` ORDER BY id;
