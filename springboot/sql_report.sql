-- ============================================================
-- 举报功能 + 用户封禁（2026-10-24）
--
-- 解决的问题：
--   站点没有任何「让用户提醒管理员」的通道，垃圾广告、辱骂只能靠管理员
--   自己逛到。举报表把这件事变成待办队列。
--
-- 涉及两块：
--   1) 新建 report 表：记录谁举报了哪个对象（帖子 / 评论 / 用户）、理由、
--      补充说明、处理状态与处理人。
--   2) user 表加处罚字段：status / ban_until / ban_reason。
--      status 分两档：1 禁言（能登录、不能发帖评论）/ 2 封号（不能登录），
--      详见 sql_ban_level.sql 的说明。
--      处罚在代码层面同时把 tokenVersion +1，让已登录的旧 token 立刻失效，
--      不需要额外的拦截器查库。
--
-- 用法（可重复执行）：
--   mysql -uroot -p --default-character-set=utf8mb4 kokomi < sql_report.sql
--
-- 说明：
--   · 待处理去重靠生成列 pending_uniq + 唯一索引：
--     同一 (举报人, 对象类型, 对象 id) 同时只能有一条 status=0 的举报。
--     处理完（status 变 1 或 2）生成列变 NULL，唯一索引允许多个 NULL，
--     所以「被驳回后再次举报」不会被拦。
--   · 理由码（reason_code）由后端 ReportReason 白名单校验，这里只做注释。
-- ============================================================

SET NAMES utf8mb4;

-- ------------------------------------------------------------
-- 1) 举报表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `report` (
  `id`            bigint       NOT NULL AUTO_INCREMENT,
  `target_type`   varchar(16)  NOT NULL                COMMENT '对象类型：post / comment / user',
  `target_id`     bigint       NOT NULL                COMMENT '对象 id',
  `reporter_id`   bigint       NOT NULL                COMMENT '举报人',
  `reason_code`   varchar(32)  NOT NULL                COMMENT 'spam 垃圾广告 / porn 色情低俗 / abuse 辱骂攻击 / illegal 违法违规 / plagiarism 抄袭侵权 / other 其他',
  `detail`        varchar(500) DEFAULT NULL            COMMENT '补充说明',
  `status`        tinyint      NOT NULL DEFAULT 0      COMMENT '0 待处理 / 1 已受理 / 2 已驳回',
  `handler_id`    bigint       DEFAULT NULL            COMMENT '处理人',
  `handle_action` varchar(16)  DEFAULT NULL            COMMENT 'accept / reject',
  `handle_note`   varchar(500) DEFAULT NULL            COMMENT '处理备注（会展示给举报人）',
  `handle_time`   datetime     DEFAULT NULL            COMMENT '处理时间',
  `created_at`    datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `pending_uniq`  varchar(64)  GENERATED ALWAYS AS (
                    CASE WHEN `status` = 0
                         THEN concat(`reporter_id`, ':', `target_type`, ':', `target_id`)
                         ELSE NULL END
                  ) STORED                             COMMENT '待处理去重键，处理完变 NULL',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_report_pending` (`pending_uniq`),
  KEY `idx_report_status` (`status`, `created_at`),
  KEY `idx_report_target` (`target_type`, `target_id`),
  KEY `idx_report_reporter` (`reporter_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='举报';

-- ------------------------------------------------------------
-- 2) 冗余记录「被举报内容的作者」
--    受理时往往会把内容删掉，删完就查不到作者是谁了；
--    提交举报时把作者记下来，后台事后仍能追溯「谁被举报过、有没有被封」。
-- ------------------------------------------------------------
SET @db := DATABASE();

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'report' AND COLUMN_NAME = 'target_author_id') = 0,
  'ALTER TABLE `report` ADD COLUMN `target_author_id` bigint DEFAULT NULL COMMENT ''被举报内容的作者，内容删除后仍可追溯'' AFTER `target_id`',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- 3) user 表加封禁字段（幂等：已存在就跳过）
-- ------------------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'user' AND COLUMN_NAME = 'status') = 0,
  'ALTER TABLE `user` ADD COLUMN `status` tinyint NOT NULL DEFAULT 0 COMMENT ''0 正常 / 1 禁言（能登录不能发帖评论）/ 2 封号（不能登录）''',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'user' AND COLUMN_NAME = 'ban_until') = 0,
  'ALTER TABLE `user` ADD COLUMN `ban_until` datetime DEFAULT NULL COMMENT ''解除时间，NULL 且 status != 0 表示永久''',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'user' AND COLUMN_NAME = 'ban_reason') = 0,
  'ALTER TABLE `user` ADD COLUMN `ban_reason` varchar(200) DEFAULT NULL COMMENT ''处罚理由（本人登录/发言被拦时能看到）''',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- 4) 自检
-- ------------------------------------------------------------
SELECT 'report 表字段数' AS item, COUNT(*) AS `value`
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'report'
UNION ALL
SELECT 'user 封禁字段数', COUNT(*)
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'user'
   AND COLUMN_NAME IN ('status', 'ban_until', 'ban_reason');
