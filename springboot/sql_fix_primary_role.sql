-- ============================================================
-- 修复：新注册账号的 user.primary_role 落成了 member（应该只有 guest）
--
-- 背景：
--   注册时 `UserMapper.insert` 只写了 (password, email, phone) 三列，
--   而 user 表的 DDL 里 primary_role 默认值是老版本留下的 'member'。
--   所以 `user.setPrimaryRole("guest")` 被静默丢掉，新账号变成：
--       user_role    → guest   （权限判定看这张表，所以确实发不了帖 ✅）
--       user.primary_role → member（个人中心按这个显示，于是显示「普通用户」❌）
--   用户看到的画面就是「我明明是普通用户，却发不了帖」。
--
--   代码已修（insert 显式写 primary_role / name_color）。
--   这个脚本只处理**已经注册出来的**脏数据：以 user_role 为准纠正显示值。
--
-- 幂等：纠完再跑一次影响 0 行。
-- 顺序：可以在换 jar 之前或之后跑，跟 jar 无关（只动数据）。
-- ============================================================

SET NAMES utf8mb4;

-- ------------------------------------------------------------
-- 1. 只有 guest 角色的账号，primary_role 必须也是 guest
--    （有多个角色的不碰：那种以它们自己的角色列表为准）
-- ------------------------------------------------------------
UPDATE `user` u
SET u.primary_role = 'guest'
WHERE BINARY u.primary_role <> BINARY 'guest'
  AND EXISTS (
      SELECT 1 FROM `user_role` ur
      WHERE ur.user_id = u.id AND BINARY ur.role_code = BINARY 'guest'
  )
  AND NOT EXISTS (
      SELECT 1 FROM `user_role` ur2
      WHERE ur2.user_id = u.id AND BINARY ur2.role_code <> BINARY 'guest'
  );

-- ------------------------------------------------------------
-- 2. 顺带兜一层：user_role 里压根没有 guest、也没有 member，
--    但 primary_role 还写着 member 的（角色被清空过的人）。
--    不改成 guest 也行，但显示会继续撒谎，所以一并纠正。
--    ⚠️ 只想最小化改动的话，这一段可以注释掉。
-- ------------------------------------------------------------
UPDATE `user` u
SET u.primary_role = 'guest'
WHERE BINARY u.primary_role = BINARY 'member'
  AND NOT EXISTS (
      SELECT 1 FROM `user_role` ur
      WHERE ur.user_id = u.id AND BINARY ur.role_code = BINARY 'member'
  )
  AND NOT EXISTS (
      SELECT 1 FROM `user_role` ur3
      WHERE ur3.user_id = u.id AND BINARY ur3.role_code IN (BINARY 'admin', BINARY 'moderator', BINARY 'editor', BINARY 'vip')
  );

-- ------------------------------------------------------------
-- 复验：这三条应该都是 0
-- ------------------------------------------------------------
SELECT COUNT(*) AS `guest角色但显示非guest`
FROM `user` u
WHERE EXISTS (
        SELECT 1 FROM `user_role` ur
        WHERE ur.user_id = u.id AND BINARY ur.role_code = BINARY 'guest'
    )
  AND NOT EXISTS (
        SELECT 1 FROM `user_role` ur2
        WHERE ur2.user_id = u.id AND BINARY ur2.role_code <> BINARY 'guest'
    )
  AND BINARY u.primary_role <> BINARY 'guest';

SELECT IFNULL(primary_role, '<NULL>') AS role, COUNT(*) AS n
FROM `user` GROUP BY primary_role ORDER BY n DESC;
