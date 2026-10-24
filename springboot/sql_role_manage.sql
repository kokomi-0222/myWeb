-- =============================================================
-- 角色权限管理（后台可自建角色 + 给角色勾权限）
--
-- 原来 role / permission 只有编码一个字段，后台页面上没法显示中文名，
-- 也没法区分「系统内置角色」和「自建角色」。这里补展示字段。
--
-- 幂等：可重复执行。
-- 执行：mysql -uroot -p --default-character-set=utf8mb4 kokomi < sql_role_manage.sql
-- ⚠️ Windows 下 mysql 客户端默认按 GBK 连，必须带 --default-character-set=utf8mb4，
--    否则中文会被二次编码成乱码且不报错。
-- =============================================================

SET NAMES utf8mb4;

-- -------------------------------------------------------------
-- 1. role 补字段
--    role_name   显示名（中文）
--    description 说明，展示在后台角色卡片上
--    is_system   1 = 内置角色，不可删除、编码不可改
--    sort        显示排序，同时决定 primary_role 的优先级（越小越高）
-- -------------------------------------------------------------
SET @sql := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `role` ADD COLUMN `role_name` VARCHAR(30) NULL',
    'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'role' AND COLUMN_NAME = 'role_name');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `role` ADD COLUMN `description` VARCHAR(200) NULL',
    'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'role' AND COLUMN_NAME = 'description');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `role` ADD COLUMN `is_system` TINYINT NOT NULL DEFAULT 0',
    'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'role' AND COLUMN_NAME = 'is_system');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `role` ADD COLUMN `sort` INT NOT NULL DEFAULT 100',
    'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'role' AND COLUMN_NAME = 'sort');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -------------------------------------------------------------
-- 2. permission 补字段
--    perm_name  显示名（中文）
--    perm_group 分组，后台按组展示勾选框
--    sort       组内排序
-- -------------------------------------------------------------
SET @sql := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `permission` ADD COLUMN `perm_name` VARCHAR(50) NULL',
    'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'permission' AND COLUMN_NAME = 'perm_name');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `permission` ADD COLUMN `perm_group` VARCHAR(30) NULL',
    'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'permission' AND COLUMN_NAME = 'perm_group');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `permission` ADD COLUMN `sort` INT NOT NULL DEFAULT 100',
    'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'permission' AND COLUMN_NAME = 'sort');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -------------------------------------------------------------
-- 3. 内置角色的显示信息
--    只用 UPDATE 补空值，站长自己改过的名字不会被覆盖。
--    sort 决定「一个人有多个角色时，帖子上显示哪个身份」：
--    admin 最小（最高），自建角色默认 100 排后面。
-- -------------------------------------------------------------
INSERT IGNORE INTO `role` (`role_code`, `role_name`, `description`, `is_system`, `sort`) VALUES
  ('admin',     '管理员',   '站点最高权限，可进入管理后台',        1, 1),
  ('moderator', '版主',     '可以删除帖子和评论、处理举报、封禁用户', 1, 2),
  ('editor',    '编辑',     '可以修改他人帖子内容',                1, 3),
  ('vip',       '会员',     '认证会员，身份标签会显示出来',        1, 4),
  ('member',    '普通用户', '注册后的默认角色',                    1, 5),
  ('guest',     '游客',     '未登记用户，兜底身份',                1, 6);

UPDATE `role` SET `role_name` = '管理员'   WHERE `role_code` = 'admin'     AND (`role_name` IS NULL OR `role_name` = '');
UPDATE `role` SET `role_name` = '版主'     WHERE `role_code` = 'moderator' AND (`role_name` IS NULL OR `role_name` = '');
UPDATE `role` SET `role_name` = '编辑'     WHERE `role_code` = 'editor'    AND (`role_name` IS NULL OR `role_name` = '');
UPDATE `role` SET `role_name` = '会员'     WHERE `role_code` = 'vip'       AND (`role_name` IS NULL OR `role_name` = '');
UPDATE `role` SET `role_name` = '普通用户' WHERE `role_code` = 'member'    AND (`role_name` IS NULL OR `role_name` = '');
UPDATE `role` SET `role_name` = '游客'     WHERE `role_code` = 'guest'     AND (`role_name` IS NULL OR `role_name` = '');

UPDATE `role` SET `description` = '站点最高权限，可进入管理后台'         WHERE `role_code` = 'admin'     AND (`description` IS NULL OR `description` = '');
UPDATE `role` SET `description` = '可以删除帖子和评论、处理举报、封禁用户' WHERE `role_code` = 'moderator' AND (`description` IS NULL OR `description` = '');
UPDATE `role` SET `description` = '可以修改他人帖子内容'                 WHERE `role_code` = 'editor'    AND (`description` IS NULL OR `description` = '');
UPDATE `role` SET `description` = '认证会员，身份标签会显示出来'         WHERE `role_code` = 'vip'       AND (`description` IS NULL OR `description` = '');
UPDATE `role` SET `description` = '注册后的默认角色'                     WHERE `role_code` = 'member'    AND (`description` IS NULL OR `description` = '');
UPDATE `role` SET `description` = '未登记用户，兜底身份'                 WHERE `role_code` = 'guest'     AND (`description` IS NULL OR `description` = '');

UPDATE `role` SET `is_system` = 1
WHERE `role_code` IN ('admin', 'moderator', 'editor', 'vip', 'member', 'guest');

UPDATE `role` SET `sort` = 1 WHERE `role_code` = 'admin';
UPDATE `role` SET `sort` = 2 WHERE `role_code` = 'moderator';
UPDATE `role` SET `sort` = 3 WHERE `role_code` = 'editor';
UPDATE `role` SET `sort` = 4 WHERE `role_code` = 'vip';
UPDATE `role` SET `sort` = 5 WHERE `role_code` = 'member';
UPDATE `role` SET `sort` = 6 WHERE `role_code` = 'guest';

-- 之前手工建过、连 role_name 都没有的角色，用编码兜底当显示名
UPDATE `role` SET `role_name` = `role_code`
WHERE `role_name` IS NULL OR `role_name` = '';

-- -------------------------------------------------------------
-- 4. 权限码的显示信息
--    注意：权限码是后端代码里 @RequirePermission 写死的，
--    新增「权限码」需要改代码才有意义，这里只补展示信息。
-- -------------------------------------------------------------
INSERT IGNORE INTO `permission` (`perm_code`, `perm_name`, `perm_group`, `sort`) VALUES
  ('post:create',    '发布帖子',     '内容', 10),
  ('post:edit',      '编辑他人帖子', '内容', 20),
  ('post:delete',    '删除他人帖子', '内容', 30),
  ('topic:create',   '新建话题',     '内容', 40),
  ('comment:report', '处理举报',     '互动', 50),
  ('user:block',     '封禁用户',     '用户', 60),
  ('user:manage',    '管理后台',     '系统', 70);

UPDATE `permission` SET `perm_name` = '发布帖子',     `perm_group` = '内容', `sort` = 10 WHERE `perm_code` = 'post:create';
UPDATE `permission` SET `perm_name` = '编辑他人帖子', `perm_group` = '内容', `sort` = 20 WHERE `perm_code` = 'post:edit';
UPDATE `permission` SET `perm_name` = '删除他人帖子', `perm_group` = '内容', `sort` = 30 WHERE `perm_code` = 'post:delete';
UPDATE `permission` SET `perm_name` = '新建话题',     `perm_group` = '内容', `sort` = 40 WHERE `perm_code` = 'topic:create';
UPDATE `permission` SET `perm_name` = '处理举报',     `perm_group` = '互动', `sort` = 50 WHERE `perm_code` = 'comment:report';
UPDATE `permission` SET `perm_name` = '封禁用户',     `perm_group` = '用户', `sort` = 60 WHERE `perm_code` = 'user:block';
UPDATE `permission` SET `perm_name` = '管理后台',     `perm_group` = '系统', `sort` = 70 WHERE `perm_code` = 'user:manage';

-- 兜底：没登记过显示名的权限码，直接用编码
UPDATE `permission` SET `perm_name` = `perm_code` WHERE `perm_name` IS NULL OR `perm_name` = '';
UPDATE `permission` SET `perm_group` = '其它' WHERE `perm_group` IS NULL OR `perm_group` = '';

-- -------------------------------------------------------------
-- 5. 安全检查：内置管理员必须留着 user:manage
--    被删掉的话谁都进不了后台，只能改库救回来。
-- -------------------------------------------------------------
INSERT INTO `role_permission` (`role_code`, `perm_code`)
SELECT 'admin', 'user:manage' FROM DUAL
WHERE EXISTS (SELECT 1 FROM `role` WHERE `role_code` = 'admin')
  AND NOT EXISTS (SELECT 1 FROM `role_permission`
                  WHERE BINARY `role_code` = BINARY 'admin'
                    AND BINARY `perm_code` = BINARY 'user:manage');
