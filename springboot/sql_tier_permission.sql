-- =============================================================
-- 等级制权限：游客 / 普通用户 / 会员
--
-- 规则（站长定的）：
--   guest    游客      刚注册 —— 能登录、能浏览、能点赞，**不能发帖、不能评论**
--   member   普通用户  绑定邮箱验证通过后自动升级 —— **能评论**，不能发帖
--   vip      会员      管理员授权 —— **能发帖**、能评论
--   editor / moderator / admin 视同会员（它们本来就要能发内容）
--
-- 权限码只新增一个，另一个沿用已有的：
--   发帖 / 编辑自己的帖  → post:create（老早就存在，之前只是个摆设，没人校验）
--   评论 / 举报          → comment:create（本次新增）
--
-- 校验都在 Service 层（PostServiceImpl / CommentServiceImpl / ReportServiceImpl），
-- 不用 @RequirePermission 拦截器：那层只能给整条路由设闸，
-- 而这里要区分「发帖要 VIP」和「评论要绑邮箱」两种不同的拒绝理由。
--
-- 可重复执行。
-- 执行：mysql -uroot -p --default-character-set=utf8mb4 kokomi < sql_tier_permission.sql
-- =============================================================

SET NAMES utf8mb4;

-- -------------------------------------------------------------
-- 1. 新增「发表评论」权限码
--    post:create 已经存在（sql_role_seed.sql 里就有），这里不重复插
-- -------------------------------------------------------------
INSERT IGNORE INTO `permission` (`perm_code`, `perm_name`, `perm_group`, `sort`)
VALUES ('comment:create', '发表评论', '互动', 10);

-- -------------------------------------------------------------
-- 2. 游客角色（role 表里通常已经有了，这里兜一下新库）
-- -------------------------------------------------------------
INSERT IGNORE INTO `role` (`role_code`, `role_name`, `is_system`, `sort`)
VALUES ('guest', '游客', 1, 6);

-- -------------------------------------------------------------
-- 3. 角色 → 权限 矩阵（只补缺，不会重复插）
--
--    role_permission 没有唯一索引，用 NOT EXISTS 防重；
--    列间比较一律 BINARY，否则两张表排序规则不一致会报
--    「Illegal mix of collations」并中止整份脚本（终端看着像跑完了）。
-- -------------------------------------------------------------
INSERT INTO `role_permission` (`role_code`, `perm_code`)
SELECT x.role_code, x.perm_code FROM (
            SELECT 'admin'     AS role_code, 'post:create'    AS perm_code
  UNION ALL SELECT 'admin',     'comment:create'
  UNION ALL SELECT 'moderator', 'post:create'
  UNION ALL SELECT 'moderator', 'comment:create'
  UNION ALL SELECT 'editor',    'post:create'
  UNION ALL SELECT 'editor',    'comment:create'
  UNION ALL SELECT 'vip',       'post:create'
  UNION ALL SELECT 'vip',       'comment:create'
  UNION ALL SELECT 'member',    'comment:create'
) x
WHERE NOT EXISTS (
  SELECT 1 FROM `role_permission` rp
  WHERE BINARY rp.`role_code` = BINARY x.`role_code`
    AND BINARY rp.`perm_code` = BINARY x.`perm_code`
);

-- -------------------------------------------------------------
-- 4. 收回不该有的权限
--    member 之前挂过 post:create（老版本发帖只看登录），必须收掉，
--    否则「普通用户不能发帖」这条规则根本不生效。
--    guest 一条都不该有。
-- -------------------------------------------------------------
DELETE FROM `role_permission`
WHERE BINARY `role_code` = 'member' AND BINARY `perm_code` = 'post:create';

DELETE FROM `role_permission`
WHERE BINARY `role_code` = 'guest';

-- -------------------------------------------------------------
-- 5. 存量用户怎么办？——默认**不动**
--
--    现有账号原本都是 member，升级后他们就发不了帖了。
--    想让老朋友保持原来的能力，把下面两行的注释去掉再执行（只跑一次，别放进常规迁移）：
--
--    UPDATE `user_role` SET `role_code` = 'vip' WHERE BINARY `role_code` = 'member';
--    UPDATE `user`      SET `primary_role` = 'vip' WHERE BINARY `primary_role` = 'member';
--
--    不想批量升，就在 后台 → 用户管理 → 点身份标签 逐个改成「会员」。
-- -------------------------------------------------------------

-- -------------------------------------------------------------
-- 6. 复验
-- -------------------------------------------------------------
SELECT '--- 权限矩阵 ---' AS info;
SELECT `role_code`, GROUP_CONCAT(`perm_code` ORDER BY `perm_code`) AS perms
FROM `role_permission`
GROUP BY `role_code`
ORDER BY `role_code`;

SELECT '--- 能发帖的角色 ---' AS info;
SELECT GROUP_CONCAT(DISTINCT `role_code` ORDER BY `role_code`) AS can_post
FROM `role_permission` WHERE BINARY `perm_code` = 'post:create';
