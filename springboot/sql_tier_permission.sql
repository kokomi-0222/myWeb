-- =============================================================
-- 等级制权限：游客 / 普通用户 / 会员
--
-- 规则（站长定的）：
--   guest    游客      刚注册 —— 能登录、能浏览、能点赞，**不能发帖、不能评论**
--   member   普通用户  绑定邮箱验证通过后自动升级 —— **能评论、能发帖**
--   vip      会员      管理员在后台授予 —— 权限与 member 相同，留作以后的档位
--   editor / moderator / admin 视同会员（它们本来就要能发内容）
--
-- 权限码只新增一个，另一个沿用已有的：
--   发帖 / 编辑自己的帖  → post:create（老早就存在，之前只是个摆设，没人校验）
--   评论 / 回复 / 举报   → comment:create（本次新增）
--
-- 所有校验都吃「权限码」，代码里没有一句 "vip".equals(role)：
-- 以后想调档位（比如让游客也能评论），只改这张表就行，不用改代码、不用发版。
--
-- 校验都在 Service 层（PostServiceImpl / CommentServiceImpl / ReportServiceImpl），
-- 不用 @RequirePermission 拦截器：那层只能给整条路由设闸，
-- 而这里要区分「等级不够」和「没绑邮箱」两种不同的拒绝理由。
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
-- 3. 角色 → 权限 矩阵（只补缺，不会重复插，也能自愈）
--
--    注意 member 同时挂 post:create 和 comment:create：
--    游客绑完邮箱就直接是「能评论、能发帖」的普通用户。
--    vip 与 member 目前等价，保留这一档是给以后的特权（置顶、专属标识等）占位。
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
  UNION ALL SELECT 'member',    'post:create'
  UNION ALL SELECT 'member',    'comment:create'
) x
WHERE NOT EXISTS (
  SELECT 1 FROM `role_permission` rp
  WHERE BINARY rp.`role_code` = BINARY x.`role_code`
    AND BINARY rp.`perm_code` = BINARY x.`perm_code`
);

-- -------------------------------------------------------------
-- 4. 收回不该有的权限
--    游客一条都不该有 —— 这一条是整套等级制的地基。
--    （member 保留 post:create，别再加删除语句：
--      本脚本的第 3 步会把它补回来，来回打架只是白费功夫。）
-- -------------------------------------------------------------
DELETE FROM `role_permission`
WHERE BINARY `role_code` = 'guest';

-- -------------------------------------------------------------
-- 5. 存量用户怎么办？——**不用处理**
--
--    老账号都是 member，而 member 现在能发帖也能评论，
--    所以跑完这个脚本，老用户的行为和升级前一模一样，无感知。
--    新注册的才落到 guest，绑完邮箱自动升 member。
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

SELECT '--- 能评论的角色 ---' AS info;
SELECT GROUP_CONCAT(DISTINCT `role_code` ORDER BY `role_code`) AS can_comment
FROM `role_permission` WHERE BINARY `perm_code` = 'comment:create';
