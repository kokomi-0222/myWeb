-- ============================================================
-- 点赞通知去重（2026-10-22）
--
-- 解决的问题：
--   点赞是「可反复切换」的动作，反复「点赞 → 取消 → 再点赞」时，
--   旧逻辑每次都插一条通知，消息中心会堆出几十条一模一样的「赞了你的帖子」。
--
-- 做法：
--   点赞类通知（like_post / like_comment）按
--   (recipient_id, sender_id, type, post_id, comment_id) 唯一；
--   重复点赞只刷新原通知的时间并重新置为未读，不再新增行。
--   评论 / 回复 / 转发**不受影响**（同一人多次评论是多个独立事件）。
--
-- 用法（可重复执行）：
--   mysql -uroot -p kokomi < sql_notification_dedup.sql
--
-- 注意：第 1 步会删除历史重复数据，只保留每组最新的一条，建议先备份：
--   mysqldump -uroot -p kokomi notification > notification_backup.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1) 清理历史重复：同一 (接收者, 触发者, 类型, 目标) 只保留最新一条
--    <=> 是 MySQL 的 NULL 安全等于，post_id / comment_id 为 NULL 时也能正确分组
-- ------------------------------------------------------------
DELETE n FROM `notification` n
INNER JOIN `notification` x
   ON  n.recipient_id = x.recipient_id
  AND  n.sender_id    = x.sender_id
  AND  n.type         = x.type
  AND  n.post_id   <=> x.post_id
  AND  n.comment_id <=> x.comment_id
  AND  n.type IN ('like_post', 'like_comment')
  AND (n.created_at < x.created_at
       OR (n.created_at = x.created_at AND n.id < x.id));

SELECT ROW_COUNT() AS '已清理的重复通知条数';

-- ------------------------------------------------------------
-- 2) 生成列 like_uniq：只有点赞类有值，其余为 NULL
--    唯一索引允许多个 NULL，所以评论/回复/转发仍然可以有多条相同组合
-- ------------------------------------------------------------
SET @exist := (SELECT COUNT(*) FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE()
                 AND TABLE_NAME = 'notification'
                 AND COLUMN_NAME = 'like_uniq');
SET @sql := IF(@exist = 0,
  'ALTER TABLE `notification` ADD COLUMN `like_uniq` varchar(96)
     GENERATED ALWAYS AS (IF(`type` IN (''like_post'',''like_comment''),
        CONCAT_WS('':'', `recipient_id`, `sender_id`, `type`, IFNULL(`post_id`, 0), IFNULL(`comment_id`, 0)),
        NULL)) VIRTUAL COMMENT ''点赞类通知去重键''',
  'SELECT ''like_uniq 已存在，跳过'' AS result');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- 3) 唯一索引：并发下两个请求同时判断「不存在」也只会有 1 条落库
-- ------------------------------------------------------------
SET @exist := (SELECT COUNT(*) FROM information_schema.STATISTICS
               WHERE TABLE_SCHEMA = DATABASE()
                 AND TABLE_NAME = 'notification'
                 AND INDEX_NAME = 'uk_notification_like');
SET @sql := IF(@exist = 0,
  'ALTER TABLE `notification` ADD UNIQUE KEY `uk_notification_like` (`like_uniq`)',
  'SELECT ''uk_notification_like 已存在，跳过'' AS result');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- 4) 自检：下面这条应该返回 0 行，说明已无重复的点赞通知
-- ------------------------------------------------------------
SELECT recipient_id, sender_id, type, post_id, comment_id, COUNT(*) AS dup_count
FROM `notification`
WHERE type IN ('like_post', 'like_comment')
GROUP BY recipient_id, sender_id, type, post_id, comment_id
HAVING dup_count > 1;
