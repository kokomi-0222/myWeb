# 心海的小窝（Kokomi）— 项目现状交接

> 换电脑 / 隔一段时间回来 / 换人接手，先读这一份。
> 最后更新：2026-10-24（举报功能 + 处罚分级上线前）

---

## 1. 这是什么

个人博客 + 动态社区站。线上 `https://kokomi.net.cn`（无 www）。

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + Vite + Pinia + Vue Router，Element Plus（按需注入） |
| 后端 | Spring Boot 3 + MyBatis（注解 + XML 混用）+ MySQL 8 |
| 鉴权 | 自签 JWT（HS256）+ `token_version` 版本校验 |
| 部署 | 单机 systemd `kokomi.service` + Nginx 反代 |

## 2. 目录结构

```
myWeb/                      ← 仓库根（.git 在这一层）
├── vue/                    ← 前端源码（src/）+ 构建产物（dist/，不入库）
├── springboot/
│   ├── kokomi/             ← 后端 Maven 工程
│   │   ├── src/main/java/com/example/kokomi/
│   │   │   ├── controller/  dto/  vo/  entity/  mapper/  service/impl/
│   │   │   ├── interceptor/ interceptor 里做 JWT 校验 + 权限码校验
│   │   │   └── util/        PermissionCache / UserTokenVersionCache / LoginUserHolder
│   │   ├── src/main/resources/mapper/*.xml
│   │   └── config/         ← ⚠️ 不入库，见 §3
│   └── *.sql               ← 所有数据库迁移脚本（幂等，可重复执行）
├── tools/                  ← 测试脚本（接口 .py / 界面 .js，走 CDP 真浏览器）
└── docs/                   ← 本文档
```

## 3. 本地跑起来

### 3.1 必须自己补的文件（被 .gitignore 忽略，clone 后没有）

`springboot/kokomi/config/application-local.yaml`，至少要包含：

```yaml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/kokomi?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai
    username: root
    password: <你的本机 MySQL 密码>
jwt:
  secret: <随便一串足够长的字符串，自己定>
  expire: 604800
```

`default` profile 就是 `local`，所以直接跑就行。线上用 `--spring.profiles.active=prod` + 环境变量。

**仓库里没有任何明文密码 / 密钥**，这一条是刻意保持的，别为了图省事把 secret 写进仓库。

### 3.2 建库 + 跑迁移

```bash
mysql -uroot -p --default-character-set=utf8mb4 -e "CREATE DATABASE IF NOT EXISTS kokomi DEFAULT CHARSET utf8mb4"
cd springboot
mysql -uroot -p --default-character-set=utf8mb4 kokomi < sql_role_manage.sql
mysql ... < sql_topic.sql
mysql ... < sql_report.sql        # 含 user 封禁字段
mysql ... < sql_ban_level.sql     # 已跑过 report 的库再跑这个即可
```

所有脚本都幂等（`information_schema` 查存在性 + `PREPARE`，或写 `DO 0` 空操作），安心重复执行。
⚠️ **每个 .sql 首行都要有 `SET NAMES utf8mb4;`**，Windows 下 MySQL 客户端默认按 GBK 连，中文会静默变乱码。

### 3.3 启动

```bash
# 后端（18080 是本地约定端口）
cd springboot/kokomi && java -jar target/kokomi-0.0.1-SNAPSHOT.jar --server.port=18080

# 前端
cd vue && npm install && npm run dev
```

沙箱环境会注入 `SERVER__PORT` 把端口绑错，所以本地起后端**显式指定 `--server.port=18080`**。

## 4. 功能盘点

### 已完成

- **帖子**：发布 / 编辑（复用空间页发布框，`/space/home?edit={id}`）/ 删除、多图、长文折叠（8 行 + 蒙层）、Markdown 风格的代码块高亮（` ```lang `）
- **评论**：一级评论 + 楼中楼回复 + 单图
- **话题（动态分类）**：`/topic/list` 免登录，四处消费，加话题不用改代码
- **点赞 / 转发 / 分享**：转发只计数；分享 = 直接复制链接
- **通知**：点赞去重（生成列 + 唯一索引），评论 / 回复 / 转发 / 举报结果不去重
- **权限体系**：角色 → 权限码，后台可配置角色权限矩阵
- **后台 `/admin`**：Dashboard / 用户管理 / 话题管理 / 角色权限 / 举报处理
- **举报**：帖子 / 评论 / 用户三类，后台受理可删内容 + 处罚作者，同目标合并结案
- **处罚分级**：禁言（能登录不能发言）/ 封号（不能登录），支持临时与永久，可手动解除
- **外观**：深色模式（持久化）、名字颜色 / 身份标签颜色、角色标签

### 没做（有 `user:block` / `comment:report` 这种空壳权限码，别被误导）

拉黑、收藏、私信、草稿箱、@提及、Only 搜帖、编辑历史、二级评论分页。

## 5. 关键设计（改之前必须知道）

### 5.1 鉴权只看角色，不看 `user.primary_role`

- 真正的权限来自 `user_role` → `role_permission`；`user.primary_role` **只用来显示标签**，不参与鉴权。
- 「给某人加权限」= 挂角色，没有单人开权限这回事。
- 排查先看 `/user/info` 返回的 `permissions` 数组，别只看 `primaryRole`。
- `PermissionCache` 是静态 Map，登录时预热；拦截器未命中会回表重建（能自愈）。但**改角色 / 改角色权限后必须 `PermissionCache.remove(userId)`，改权限矩阵要 `clear()`**，否则对方不重启不生效。

### 5.2 只有 4 个权限码真正被校验

`post:delete`（Service 层，删帖 + 删评论）、`post:edit`、`topic:create`、`user:manage`。
其余都是空壳，后台页面标了「未启用」。新增校验时同步改 `views/admin/Roles.vue` 的 `ENFORCED_PERMS`。

### 5.3 `token_version` 是全局「踢下线」开关

JWT payload 里带 `tokenVersion`，`LoginInterceptor` 每次比对库里的值，不一致 → 401。
改密码、封号时会 `+1`，历史 token 立刻作废。**禁言故意不 `+1`**（见 5.4）。

### 5.4 处罚分级（`user.status`）

| status | 含义 | 能登录 | 能发帖评论编辑 |
|---|---|---|---|
| 0 | 正常 | ✅ | ✅ |
| 1 | 禁言 | ✅ | ❌ |
| 2 | 封号 | ❌ | ❌ |

- 拦截在 **Service 层**（`createPost` / `updatePost` / `createComment`），不是拦截器 —— 拦截器命中版本缓存时不查库，判不出禁言。
- **只有封号才 `token_version + 1`**；禁言不掉线。
- 禁言被拦时返回业务码 **`506`（`ResultCode.MUTED`）**，前端拦截器收到后 `dispatchEvent('kokomi:muted')` → user store 调 `refreshUser()` 重新拉状态 → 发布框换成提示卡。用事件是为了避免 `request.js ←→ store` 循环依赖。
- 到期解除是**懒执行**：登录时、发言时、`/user/info` 时调 `autoReleaseIfExpired()`，**没有定时任务**。
- `ban_until` 为 NULL + status≠0 = 永久处罚。
- 保护：不能处罚自己；不能处罚拥有 `user:manage` 的人；失败时整事务回滚。

### 5.5 举报

- **不占权限码** —— 任何登录用户都能举报。原代码写的是 `requiredPermission: 'post:report'`，而权限表里根本没这个码，导致举报菜单从来没显示过。
- 去重靠 `report.pending_uniq` 生成列（`reporter:type:id`，仅 `status=0` 时非空）+ 唯一索引。驳回后可以再举报（NULL 不参与唯一约束）。
- `target_author_id` 是提交时记下的冗余字段：受理会把内容删掉，删完就查不到作者了，靠它事后追溯与处罚。
- 受理一条 → 同目标其他待处理举报一并结案，并分别通知各举报人。
- 后台接口全挂 `user:manage`。

### 5.6 内容入库不能 `.trim()`

正文 / 评论只清尾部空白 + 开头空行，**保留首行缩进**。
规则有两份，改一份必须同步另一份：前端 `vue/src/utils/contentText.js`、后端 `util/TextUtils.normalizeContent`。
否则第一行的空格会在保存时被吞掉，用户下次点编辑才发现。

## 6. 已知的坑（都是真踩过的）

**构建 / 部署**
- `mvn compile` 报 SUCCESS ≠ 真编译过（IDE 留的 `Unresolved compilation problem` 存根）→ 改完 Java 一律 `mvn -B clean compile`。中文错误：`2>&1 | tr -d '\000' | iconv -f GBK -t UTF-8`。
- 打包前停掉在跑的 `java -jar`，Windows 文件锁会产出 192KB 的坏 jar。
- 前端 build **不能 `rm -rf dist`**（safe-delete 失败）→ 先 `mv dist /tmp/xxx`。`dist_old_*` 不能堆，会写满 C 盘。
- 「换包看不到新功能」先查 `index.html` 缓存：`curl -s 站点/ | grep -o 'assets/index-[^"]*\.js'` 比对 hash。

**Element Plus**
- 按需注入只管模板组件，`ElMessageBox` 是 JS API，`.el-overlay` 基础样式不会注入 → 弹框掉到视口下（表现为「点删除没反应」）。`main.js` 里显式引入 `el-overlay / el-message-box / el-button / el-input / el-icon` 的 css，且排在 `assets/css/message-box.css` **之前**。
- `<style scoped>` 覆盖暗色的正确写法是 `:global(:root.dark .xxx)`；写成 `:global(:root.dark) .xxx` 整条会被丢弃。

**组件**
- `Button.vue` 的 `.my-button` **只有配色，没有任何尺寸**（无 height/padding/radius/font-size）→ 用到处必须喂 class，否则是浏览器默认的贴字小色块。
- 发布框的 textarea 是**原生元素，class 直接就是 `.input-content`**（不是容器）→ 选择器写 `.publishing textarea.input-content`。

**数据库**
- `user.create_time`，`post` / `comment` 是 `created_at`，列名不统一。
- `user.primary_role`(general_ci) 与 `user_role.role_code`(0900_ai_ci) 排序规则不同，列对列比较会 `Illegal mix of collations` 并**中止整份脚本**（终端看着像跑完了）→ 一律 `BINARY a = BINARY b`。
- `PostMapper.xml` 注释里禁止连续 `--`，MyBatis 启动即崩。
- 列表 SQL 里别加 `SUBSTRING(content,1,1200)` 省带宽，长文会被截断；折叠交给 CSS。

**前端交互**
- `<768px` 时 `TopNavbar` 整块 `display:none !important`，任何新功能都要在 `MobileNavbar` 里放一份。
- URL 是搜索/分页的唯一数据源，筛选条件必须同步进 query。
- 控制台被 esbuild `pure:['console.log']` 干掉了，要上线也打印就走 `utils/logger.js` 的 `log()`。

## 7. 部署（顺序不能换）

```bash
# 1. SQL（新库全跑；老库按需补）
mysql -uroot -p --default-character-set=utf8mb4 kokomi < springboot/sql_xxx.sql

# 2. 换 jar —— 必须 stop → 覆盖 → start，只 restart 等于没更新
systemctl stop kokomi
cp target/kokomi-0.0.1-SNAPSHOT.jar /kokomi/server/
systemctl start kokomi
systemctl status kokomi

# 3. 前端：解压 dist 包覆盖站点目录，然后让用户 Ctrl+Shift+R
```

- 环境变量在 `/etc/systemd/system/kokomi.service.d/override.conf`（`Environment="DB_PASSWORD=..."`，systemd 里 `$` 要写 `$$`）。
- Nginx `client_max_body_size` 是 2m，前端 `setting.imageSize` 必须略小（如 `2MB-8192`），超限会返回 413 且没有 CORS 头 → 前端只显示「网络异常」。
- ⚠️ nginx 目前**没给 `/index.html` 设 `no-cache`**，所以每次换前端包都得让用户强刷。这是已知待办。

## 8. 测试

不用起浏览器手动点。约定是：`18080` 后端 + `5194` 预览服务。

```bash
# 预览服务（静态 + /api 反代到 18080）
PREVIEW_ROOT=vue/dist UPSTREAM=http://127.0.0.1:18080 PORT=5194 node tools/preview.js

# 接口测试（临时数据，跑完自动清理）
cd tools && python test-report-api.py
cd tools && python test-ban-level-api.py

# 界面测试（headless Chrome + CDP，真点真截图，截图落 shots/）
node tools/test-report-ui.js
node tools/test-ban-ui.js
```

- `tools/_local.py` 是凭据读取工具（**不含明文，已入库**）：优先读环境变量 `DB_PASSWORD` / `JWT_SECRET`，否则读 `springboot/kokomi/config/application-local.yaml`。所以只要 §3.1 那个文件在，测试脚本就能跑。
- `tools/refresh_tokens.py` 重新签发 `shots/tmp/tokens.json`。`exp` 会过期、封号会让 `token_version + 1`，UI 测试 401 时先跑它，别急着怀疑代码。
- ⚠️ **看输出用 `tail`，别用 `| head`** —— SIGPIPE 会杀掉 node 进程，测试跑一半留下脏状态（比如「成员还在禁言」）。
- 界面测试轮询等 DOM，不要固定 `sleep`（首页横幅首屏 3.5s）。

## 9. 换台电脑怎么继续

1. `git clone git@github.com:kokomi-0222/myWeb.git`
2. 按 §3.1 补 `springboot/kokomi/config/application-local.yaml`、按 §3.2 建库跑 SQL、`npm install`
3. 不用管 `tools/_local.py`（已入库且不含密钥，会自动读上面那个 yaml）
4. 打开这个仓库，跟 AI 说一句「读 docs/PROJECT_STATE.md，然后我们继续做 XXX」

代码走到哪一步，`git log` 里每个提交都写了改了什么；为什么这么改、坑在哪，就是这份文档。

## 10. 待办（按优先级）

1. nginx 给 `/index.html` 加 `no-cache`（一劳永逸解决换包强刷）
2. 评论区渲染身份标签（后端 `CommentAuthorVO` 已返 `roleColor`，前端没用）
3. 收藏 / 草稿箱（表结构都还没有）
4. 拉黑（`user:block` 权限码是空壳，缺黑名单表和 handler）
5. 私信（要会话表 + 未读计数，轮询或 WebSocket）
