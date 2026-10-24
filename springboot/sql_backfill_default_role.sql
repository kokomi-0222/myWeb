-- =============================================================
-- 补历史数据：给「没有任何角色」的用户挂上默认角色
--
-- 背景：注册接口以前只写 user.primary_role（身份标签），
--       没有写 user_role（鉴权链路的起点）。
--       结果 /user/info 的 permissions 是空数组，
--       后台用户管理页上这些人显示黄色的「无角色」。
--
--       代码已修（register 会写 user_role），这份脚本补历史用户。
--
-- 可重复执行，不会重复插入，也不会删任何已有角色。
-- 执行：mysql -uroot -p --default-character-set=utf8mb4 kokomi < sql_backfill_default_role.sql
-- =============================================================

SET NAMES utf8mb4;

-- -------------------------------------------------------------
-- 1. 兜底：role 表里要有 member
--    （用户管理页的角色标签是读 role 表来的，缺了就没有「普通用户」这一项）
-- -------------------------------------------------------------
INSERT INTO `role` (`role_code`)
SELECT 'member' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `role` WHERE `role_code` = 'member');

-- -------------------------------------------------------------
-- 2. 回填 user_role
--    只处理「一条角色都没有」的用户，已有角色的原样不动。
--
--    ⚠️ 分两条写是有原因的：user.primary_role 与 user_role.role_code
--    的排序规则不同（general_ci vs 0900_ai_ci），把列和字面量放进
--    同一个 COALESCE 里会报「Illegal mix of collations」，
--    让整份脚本静默中止。拆开就各自只跟自己的字面量比较，不会撞。
-- -------------------------------------------------------------

-- 2.1 primary_role 有值的：按 primary_role 回填（admin / moderator 等身份不丢）
INSERT INTO `user_role` (`user_id`, `role_code`)
SELECT u.`id`, u.`primary_role` FROM `user` u
WHERE u.`primary_role` IS NOT NULL
  AND u.`primary_role` <> ''
  AND NOT EXISTS (
    SELECT 1 FROM `user_role` ur WHERE ur.`user_id` = u.`id`
  );

-- 2.2 primary_role 为空的：补 member
INSERT INTO `user_role` (`user_id`, `role_code`)
SELECT u.`id`, 'member' FROM `user` u
WHERE (u.`primary_role` IS NULL OR u.`primary_role` = '')
  AND NOT EXISTS (
    SELECT 1 FROM `user_role` ur WHERE ur.`user_id` = u.`id`
  );

-- -------------------------------------------------------------
-- 3. 复验
-- -------------------------------------------------------------
SELECT '--- [复验] 仍然没有任何角色的用户（应为 0 行） ---' AS info;
SELECT u.`id`, u.`username`, u.`primary_role`
FROM `user` u
WHERE NOT EXISTS (SELECT 1 FROM `user_role` ur WHERE ur.`user_id` = u.`id`);

SELECT '--- [复验] 各角色人数 ---' AS info;
SELECT `role_code`, COUNT(*) AS users
FROM `user_role`
GROUP BY `role_code`
ORDER BY users DESC;
