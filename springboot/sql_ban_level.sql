-- ============================================================
-- 处罚分两级：禁言 / 封号（2026-10-24）
--
-- 之前 user.status 只有「封禁」一个含义（1 = 不能登录）。
-- 现在拆成两档，因为「垃圾广告号」和「嘴臭但还想看帖的人」不该同样处理：
--
--   status = 0  正常
--   status = 1  禁言：能登录、能看帖、能点赞，但发不出帖子 / 评论 / 回复
--   status = 2  封号：连登录都不给
--
-- ban_until 语义不变：NULL 表示永久，否则到点后「登录」和「发帖」两个入口
-- 会顺带把它解掉（不需要定时任务）。
--
-- 用法（可重复执行）：
--   mysql -uroot -p --default-character-set=utf8mb4 kokomi < sql_ban_level.sql
--
-- ⚠️ 只在「已经执行过 sql_report.sql 的老库」上需要跑。
--    全新的库直接跑 sql_report.sql 就行，那边的 status 注释已经是新语义。
-- ============================================================

SET NAMES utf8mb4;

SET @db := DATABASE();

-- ------------------------------------------------------------
-- 1) 老数据语义迁移：原来的 1（封号）要变成 2，否则解禁后会「意外能登录」
--
--    幂等做法：靠列注释判断有没有迁移过。
--    注释里还没有「禁言」两个字 = 还是老语义，需要迁；
--    已经含「禁言」= 迁过了，跳过（否则管理员后来正常设的「禁言」会被改成封号）。
-- ------------------------------------------------------------
SET @old_comment := (
  SELECT COLUMN_COMMENT FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'user' AND COLUMN_NAME = 'status');

SET @sql := IF(
  @old_comment IS NOT NULL AND LOCATE('禁言', @old_comment) = 0,
  'UPDATE `user` SET `status` = 2 WHERE `status` = 1',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- 2) 更新列注释（MODIFY 本身幂等，重复执行结果一致）
-- ------------------------------------------------------------
ALTER TABLE `user`
  MODIFY COLUMN `status` tinyint NOT NULL DEFAULT 0
    COMMENT '0 正常 / 1 禁言（能登录不能发帖评论）/ 2 封号（不能登录）',
  MODIFY COLUMN `ban_until` datetime DEFAULT NULL
    COMMENT '解除时间，NULL 且 status != 0 表示永久',
  MODIFY COLUMN `ban_reason` varchar(200) DEFAULT NULL
    COMMENT '处罚理由（本人登录/发言被拦时能看到）';

-- ------------------------------------------------------------
-- 3) 自检
-- ------------------------------------------------------------
SELECT 'user.status 注释' AS item, COLUMN_COMMENT AS `value`
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'user' AND COLUMN_NAME = 'status'
UNION ALL
SELECT CONCAT('status=', status), COUNT(*)
  FROM `user`
 GROUP BY status;
