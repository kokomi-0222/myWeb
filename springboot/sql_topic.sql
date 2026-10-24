-- =============================================================
-- 话题（topic）动态化 —— 建表 + 预置 + 权限
-- 可重复执行，不会产生重复数据
-- 上线顺序：先跑这个脚本，再换 jar
-- =============================================================

-- ⚠️ 必须放在最前面：Windows 下 mysql 客户端默认用 GBK 连接字符集，
-- 如果脚本是 UTF-8 存的、连接又按 GBK 解释，中文会被二次编码成乱码
-- （「技术」变「鎶?湳」），而且看起来「执行成功」，很难发现。
SET NAMES utf8mb4;

-- -------------------------------------------------------------
-- 1. 话题表
--    value 是真正写进 post.type 的值。历史数据里 type 存的是
--    英文标识（tech/life/...），所以初始化时保持原值不变，
--    老帖子不用改数据就能对上。
--    value 加了唯一索引：新建话题不能重名，也方便 upsert。
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `topic` (
  `id`         bigint       NOT NULL AUTO_INCREMENT,
  `name`       varchar(32)  NOT NULL COMMENT '显示名，如「技术」',
  `value`      varchar(32)  NOT NULL COMMENT '存储值，写入 post.type',
  `color`      varchar(16)  NOT NULL DEFAULT '#8a8a8a' COMMENT '话题圆点颜色',
  `sort`       int          NOT NULL DEFAULT 0 COMMENT '话题栏排序，小的在前',
  `created_at` datetime     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_topic_value` (`value`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='话题字典';

-- -------------------------------------------------------------
-- 2. 预置原有 7 个话题
--    颜色和排序跟改造前前端硬编码的完全一致，避免视觉上跳变
-- -------------------------------------------------------------
INSERT IGNORE INTO `topic` (`name`, `value`, `color`, `sort`) VALUES
  ('技术', 'tech',    '#00aeec', 1),
  ('生活', 'life',    '#fb7299', 2),
  ('游戏', 'game',    '#6b7cff', 3),
  ('音乐', 'music',   '#f5a623', 4),
  ('影视', 'movie',   '#23c343', 5),
  ('文章', 'article', '#8b5cf6', 6),
  ('其他', 'other',   '#8a8a8a', 7);

-- -------------------------------------------------------------
-- 3. 新增权限码 topic:create
-- -------------------------------------------------------------
INSERT IGNORE INTO `permission` (`perm_code`) VALUES ('topic:create');

-- -------------------------------------------------------------
-- 4. 只授予 admin——即「只有站长能新建话题」
--    role_permission 没有唯一索引，所以用 NOT EXISTS 防重复，
--    不能靠 INSERT IGNORE。
--    想放开给版主，把 'admin' 再加一行 'moderator' 即可。
-- -------------------------------------------------------------
INSERT INTO `role_permission` (`role_code`, `perm_code`)
SELECT 'admin', 'topic:create' FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `role_permission`
  WHERE `role_code` = 'admin' AND `perm_code` = 'topic:create'
);

-- -------------------------------------------------------------
-- 自检：打印当前话题和 topic:create 的授权情况
-- -------------------------------------------------------------
SELECT '--- 话题列表 ---' AS info;
SELECT `sort`, `name`, `value`, `color` FROM `topic` ORDER BY `sort`;
SELECT '--- topic:create 授权 ---' AS info;
SELECT `role_code`, `perm_code` FROM `role_permission` WHERE `perm_code` = 'topic:create';
