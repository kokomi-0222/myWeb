-- ============================================================
-- 消息中心：通知表 + 几处必要索引
--
-- 用法（整个文件可以重复执行，已存在的表/索引会跳过）：
--   mysql -uroot -p kokomi < sql_notification.sql
-- 或在客户端里粘贴执行。
-- ============================================================

CREATE TABLE IF NOT EXISTS `notification` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `recipient_id` bigint NOT NULL COMMENT '接收通知的用户ID',
  `sender_id` bigint NOT NULL COMMENT '触发通知的用户ID',
  `type` varchar(20) NOT NULL COMMENT 'like_post / like_comment / comment / reply',
  `post_id` bigint DEFAULT NULL COMMENT '相关帖子ID',
  `comment_id` bigint DEFAULT NULL COMMENT '相关评论ID',
  `content` varchar(200) DEFAULT '' COMMENT '摘要文本，列表直接展示',
  `is_read` tinyint NOT NULL DEFAULT '0' COMMENT '0未读 1已读',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_recipient_created` (`recipient_id`, `created_at`),
  KEY `idx_recipient_unread` (`recipient_id`, `is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='消息通知';


-- ------------------------------------------------------------
-- 索引：帖子按时间排序、按作者取帖、评论按帖子取数
-- MySQL 8 不支持 ADD INDEX IF NOT EXISTS，这里用信息表判断后动态执行，
-- 保证脚本可以重复跑。
-- ------------------------------------------------------------

SET @exist := (SELECT COUNT(*) FROM information_schema.STATISTICS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'post' AND INDEX_NAME = 'idx_created_at');
SET @sql := IF(@exist = 0,
  'ALTER TABLE `post` ADD INDEX `idx_created_at` (`created_at`)',
  'SELECT ''idx_created_at 已存在，跳过'' AS result');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (SELECT COUNT(*) FROM information_schema.STATISTICS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'post' AND INDEX_NAME = 'idx_user_id');
SET @sql := IF(@exist = 0,
  'ALTER TABLE `post` ADD INDEX `idx_user_id` (`user_id`)',
  'SELECT ''idx_user_id 已存在，跳过'' AS result');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (SELECT COUNT(*) FROM information_schema.STATISTICS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comment' AND INDEX_NAME = 'idx_post_parent');
SET @sql := IF(@exist = 0,
  'ALTER TABLE `comment` ADD INDEX `idx_post_parent` (`post_id`, `parent_id`)',
  'SELECT ''idx_post_parent 已存在，跳过'' AS result');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (SELECT COUNT(*) FROM information_schema.STATISTICS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comment' AND INDEX_NAME = 'idx_parent_id');
SET @sql := IF(@exist = 0,
  'ALTER TABLE `comment` ADD INDEX `idx_parent_id` (`parent_id`)',
  'SELECT ''idx_parent_id 已存在，跳过'' AS result');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
