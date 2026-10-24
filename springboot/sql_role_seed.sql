-- =============================================================
-- 角色与权限种子数据
--
-- 用途：用户管理页要能选角色，前提是 role / permission / role_permission
--       三张表有数据。线上这三张表此前是空的（只有 role_permission 里
--       一条 topic:create），所以先把该有的补齐。
--
-- 可重复执行，不会产生重复数据。
-- 执行：mysql -uroot -p --default-character-set=utf8mb4 kokomi < sql_role_seed.sql
-- =============================================================

SET NAMES utf8mb4;

-- -------------------------------------------------------------
-- 1. 角色字典（沿用原有 5 个，不新增概念）
-- -------------------------------------------------------------
INSERT IGNORE INTO `role` (`role_code`) VALUES
  ('admin'),
  ('moderator'),
  ('editor'),
  ('vip'),
  ('member');

-- -------------------------------------------------------------
-- 2. 权限码
--    user:manage 是本次新增的，专门用来把「用户管理页」的入口锁给管理员
-- -------------------------------------------------------------
INSERT IGNORE INTO `permission` (`perm_code`) VALUES
  ('post:create'),
  ('post:edit'),
  ('post:delete'),
  ('user:block'),
  ('comment:report'),
  ('topic:create'),
  ('user:manage');

-- -------------------------------------------------------------
-- 3. 角色 → 权限 矩阵
--    admin      全权（含建话题、管用户）
--    moderator  版主：能删任意帖子和评论、能封禁
--    editor     编辑：能改帖子
--    vip/member 无额外权限（发帖、评论是登录就能做的，不经过权限码）
--
--    role_permission 没有唯一索引，所以用 NOT EXISTS 防重复插入；
--    列间比较加 BINARY，避免两表排序规则不一致导致
--    「Illegal mix of collations」把整份脚本中止。
-- -------------------------------------------------------------
INSERT INTO `role_permission` (`role_code`, `perm_code`)
SELECT x.role_code, x.perm_code FROM (
            SELECT 'admin'     AS role_code, 'post:create'    AS perm_code
  UNION ALL SELECT 'admin',     'post:edit'
  UNION ALL SELECT 'admin',     'post:delete'
  UNION ALL SELECT 'admin',     'user:block'
  UNION ALL SELECT 'admin',     'comment:report'
  UNION ALL SELECT 'admin',     'topic:create'
  UNION ALL SELECT 'admin',     'user:manage'
  UNION ALL SELECT 'moderator', 'post:delete'
  UNION ALL SELECT 'moderator', 'comment:report'
  UNION ALL SELECT 'moderator', 'user:block'
  UNION ALL SELECT 'editor',    'post:edit'
) x
WHERE NOT EXISTS (
  SELECT 1 FROM `role_permission` rp
  WHERE BINARY rp.`role_code` = BINARY x.`role_code`
    AND BINARY rp.`perm_code` = BINARY x.`perm_code`
);

-- -------------------------------------------------------------
-- 4. 复验
-- -------------------------------------------------------------
SELECT '--- 角色 ---' AS info;
SELECT `role_code` FROM `role` ORDER BY `id`;

SELECT '--- 权限矩阵 ---' AS info;
SELECT `role_code`, GROUP_CONCAT(`perm_code` ORDER BY `perm_code`) AS perms
FROM `role_permission`
GROUP BY `role_code`
ORDER BY `role_code`;
