-- =============================================================
-- 修复：站长的权限数组为空（/user/info 返回 permissions: []）
--
-- 症状：登录后 primaryRole 显示 admin，但发布框没有「+ 新建话题」；
--       接口 POST /topic 也会返回无权限。
-- 原因：permission 体系靠 user_role → role_permission 两张表串联，
--       而线上库 user_id=1 在 user_role 里没有记录，
--       于是 roles / permissions 两条查询都返回空集合。
--       user.primary_role 那列只用来显示身份标签，不参与鉴权。
--
-- 可重复执行；先打印诊断信息，再补齐缺失数据，最后复验。
-- 执行：mysql -uroot -p --default-character-set=utf8mb4 kokomi < sql_fix_admin_role.sql
-- =============================================================

SET NAMES utf8mb4;

-- ---------- 1. 诊断：看看线上到底缺了哪一环 ----------
SELECT '--- [1] user_role: 用户 1 的角色 ---' AS info;
SELECT `user_id`, `role_code` FROM `user_role` WHERE `user_id` = 1;

SELECT '--- [2] role: 全部角色 ---' AS info;
SELECT `role_code` FROM `role`;

SELECT '--- [3] permission: topic:create 是否存在 ---' AS info;
SELECT `perm_code` FROM `permission` WHERE `perm_code` = 'topic:create';

SELECT '--- [4] role_permission: admin 的授权 ---' AS info;
SELECT `role_code`, `perm_code` FROM `role_permission` WHERE `role_code` = 'admin';

-- ---------- 2. 修复：缺哪补哪，都有就什么都不做 ----------

-- 2.0 【通用回填】user 表上有 primary_role（身份标签），但 user_role 是空的。
--     以 primary_role 为准，把「有身份但没挂角色」的用户补进 user_role。
--     这一步是幂等的，也不会删除任何已有角色。
--     ⚠️ 比较一律用 BINARY：user.primary_role 与 user_role.role_code 的
--     排序规则可能不同（general_ci vs 0900_ai_ci），直接 = 会报
--     「Illegal mix of collations」并让整份脚本中止。BINARY 走字节比较，绕开这个问题。
INSERT INTO `role` (`role_code`)
SELECT DISTINCT u.`primary_role` FROM `user` u
WHERE u.`primary_role` IS NOT NULL
  AND u.`primary_role` <> ''
  AND NOT EXISTS (
    SELECT 1 FROM `role` r WHERE BINARY r.`role_code` = BINARY u.`primary_role`
  );

INSERT INTO `user_role` (`user_id`, `role_code`)
SELECT u.`id`, u.`primary_role` FROM `user` u
WHERE u.`primary_role` IS NOT NULL
  AND u.`primary_role` <> ''
  AND NOT EXISTS (
    SELECT 1 FROM `user_role` ur
    WHERE ur.`user_id` = u.`id`
      AND BINARY ur.`role_code` = BINARY u.`primary_role`
  );

-- 2.1 角色表里要有 admin
INSERT INTO `role` (`role_code`)
SELECT 'admin' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `role` WHERE `role_code` = 'admin');

-- 2.2 把 admin 角色挂到用户 1 身上（这一步是本次问题的关键）
INSERT INTO `user_role` (`user_id`, `role_code`)
SELECT 1, 'admin' FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `user_role` WHERE `user_id` = 1 AND `role_code` = 'admin'
);

-- 2.3 权限码 topic:create
INSERT INTO `permission` (`perm_code`)
SELECT 'topic:create' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `permission` WHERE `perm_code` = 'topic:create');

-- 2.4 授予 admin
INSERT INTO `role_permission` (`role_code`, `perm_code`)
SELECT 'admin', 'topic:create' FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `role_permission`
  WHERE `role_code` = 'admin' AND `perm_code` = 'topic:create'
);

-- ---------- 3. 复验：这三条查询应该和接口一致 ----------
SELECT '--- [复验] 用户 1 的角色 ---' AS info;
SELECT `role_code` FROM `user_role` WHERE `user_id` = 1;

SELECT '--- [复验] 用户 1 的权限（应包含 topic:create） ---' AS info;
SELECT DISTINCT `perm_code` FROM `role_permission`
WHERE `role_code` IN (SELECT `role_code` FROM `user_role` WHERE `user_id` = 1);
