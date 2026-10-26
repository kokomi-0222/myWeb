# 心海的小窝（Kokomi）— 项目现状交接

> 换电脑 / 隔一段时间回来 / 换人接手，先读这一份。
> 最后更新：2026-10-26（邮箱验证 + 注册防刷上线前）

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
mysql ... < sql_email_verify.sql  # user.email_verified（老用户会被回填成已验证）
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
- **邮箱验证 + 注册防刷**：只允许邮箱注册，同 IP / 全站限速；登录后发 6 位码验证邮箱，未验证不能发帖评论举报；管理端可手动激活兜底
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

### 5.7 邮箱验证（`user.email_verified`）

**为什么这么做**：注册原本完全免费，一个人能刷出无数「幽灵账号」。选了「邮箱验证码激活」而不是限流 / 邀请码 —— 既挡住批量注册，又顺带给以后「找回密码」留了路。

| `email_verified` | 能登录 | 浏览 / 点赞 | 发帖 / 评论 / 举报 |
|---|---|---|---|
| 0 未验证 | ✅ | ✅ | ❌ 返回 `507` |
| 1 已验证 | ✅ | ✅ | ✅ |

- **注册接口不发信**（`UserServiceImpl.register` 只做限速 + 图形验证码）。要是注册就发信，注册接口等于一台免费发信机，被人拿来轰炸别人邮箱。
- 发信与校验分开，且都要求**已登录**：
  - `POST /user/verify/send` → 给当前账号的邮箱发 6 位数字码
  - `POST /user/verify/confirm` → 校验码，通过后 `email_verified = 1`
- **只允许邮箱注册**：`register` 里 `Validator.isEmail` 不过就报「目前只支持邮箱注册」，账号不再写 `user.phone`。历史上用手机号注册的账号没有邮箱，验证接口返回 400「该账号没有绑定邮箱，请联系管理员激活」，走管理端兜底。
- 拦在 **Service 层**（`PostServiceImpl.createPost` / `updatePost` 仅作者本人 / `CommentServiceImpl.createComment` / `ReportServiceImpl.create`），和禁言是同一层：`userVerifyService.requireVerified(userId)`。点赞、转发、浏览不拦。
- 业务码：`ResultCode.EMAIL_UNVERIFIED = 507`、`VERIFY_CODE_ERROR = 508`。前端 `request.js` 收到 507 时 `dispatchEvent('kokomi:unverified')` → `App.vue` 调 `ui.openVerifyModal()`，`stores/user.js` 同时 `refreshUser()`。用事件而不是直接 import，是为了避免 `request.js ←→ store` 循环依赖。
- 幂等：已验证的账号再调 send 返回「邮箱已验证，无需重复验证」，再调 confirm 直接成功（拿到 old 的验证码也不会报错）。

**限流的三层**

| 层 | 实现 | 规则 |
|---|---|---|
| 注册（IP） | `util/RegisterRateLimit` | 同 IP 20 个/小时，全站 100 个/小时 |
| 发码（邮箱） | `util/EmailCodeCache.issue` | 同邮箱 60 秒重发间隔，5 封/小时 |
| 发码（全站） | `EmailCodeCache` | 8 封/分钟、60 封/小时 |

- ⚠️ **全站配额必须在「其它检查都通过之后」才扣**。放在频控之前的话，狂点「重发」会把正常用户的名额吃光，等于自己 DoS 自己。
- 验证码本身：6 位数字，10 分钟有效，同码最多错 5 次即作废，重新获取会覆盖旧码。
- `EmailCodeCache` 是静态 `ConcurrentHashMap`（仿 `CaptchaCache`），**重启即全部失效 / 限流清零**。单机部署够用，要上多实例得换 Redis。
- 取 IP 走 `util/IpUtils`，优先 `X-Forwarded-For`（线上走 nginx 反代，`getRemoteAddr()` 只会拿到 127.0.0.1，限速会变成全站共用）。

**发信**
- `spring-boot-starter-mail` + `service/MailServiceImpl`，默认 `smtp.qq.com:465` + SSL。**QQ 邮箱的 `password` 是授权码不是登录密码**，在 QQ 邮箱设置 → 账户里开 SMTP 后生成。
- `helper.setFrom(new InternetAddress(username, fromName, "UTF-8"))` —— QQ 强制 From 必须等于登录账号，否则 501。
- 三个超时都要设（`connectiontimeout/timeout/writetimeout` = 6/8/8 秒），否则 SMTP 挂住会把整个请求线程拖死。
- `app.mail.dev-echo=true` 时接口把明文验证码放在响应 `devCode` 里，前端弹窗也直接显示 —— **只给本地用，prod 不要配这个键**。SMTP 没配又没开 dev-echo 时验证码只打日志。
- 兜底：`POST /admin/user/{id}/verify`（`user:manage`），用户管理页每行的「激活」按钮。SMTP 挂了、用户邮箱收不到，都靠它。

## 6. 已知的坑（都是真踩过的）

**构建 / 部署**
- `mvn compile` 报 SUCCESS ≠ 真编译过（IDE 留的 `Unresolved compilation problem` 存根）→ 改完 Java 一律 `mvn -B clean compile`。中文错误：`2>&1 | tr -d '\000' | iconv -f GBK -t UTF-8`。
- 打包前停掉在跑的 `java -jar`，Windows 文件锁会产出 192KB 的坏 jar。
- 前端 build **不能 `rm -rf dist`**（safe-delete 失败）→ 先 `mv dist /tmp/xxx`。`dist_old_*` 不能堆，会写满 C 盘。
- 「换包看不到新功能」先查 `index.html` 缓存：`curl -s 站点/ | grep -o 'assets/index-[^"]*\.js'` 比对 hash。

**Element Plus**
- 按需注入只管模板组件，`ElMessageBox` 是 JS API，`.el-overlay` 基础样式不会注入 → 弹框掉到视口下（表现为「点删除没反应」）。`main.js` 里显式引入 `el-overlay / el-message-box / el-button / el-input / el-icon` 的 css，且排在 `assets/css/message-box.css` **之前**。
- `<style scoped>` 覆盖暗色的正确写法是 `:global(:root.dark .xxx)`；写成 `:global(:root.dark) .xxx` 整条会被丢弃。
- ⚠️ **z-index**：EP 的遮罩是「从 2000 起逐个 +1」动态分配的，而后台详情弹窗 `.detail-overlay` 是 3000、处罚面板 `.style-mask` 是 2000。在后台弹窗里再弹确认框会被压在下面（看起来像「点了没反应」）。`message-box.css` 里统一 `.el-overlay.is-message-box { z-index: 4000 !important }`。
- **业务代码里不要再出现 `window.confirm`**：原生确认框在暗色主题下是白底黑字的小方块，和站内圆角卡片完全不搭。统一用 `ElMessageBox.confirm(内容, 标题, { type, confirmButtonText, customClass: 'danger-confirm' })`，取消走 `catch`。

**组件**
- `Button.vue` 的 `.my-button` **只有配色，没有任何尺寸**（无 height/padding/radius/font-size）→ 用到处必须喂 class，否则是浏览器默认的贴字小色块。
- 后台纯 `<button class="admin-btn">` 也只有尺寸没有配色 → 次要操作用 `admin-btn admin-btn--ghost`（1px 描边 + hover 变主题色）。
- 后台下拉框统一用 **`components/inputs/SelectBox.vue`**（自绘浮层，尺寸对齐 `.admin-btn`）：
  `<SelectBox v-model="x" :options="[{value,label}]" size="md|sm" align="end|start" @change="..." />`。
  **别再写原生 `<select>`** —— 它的展开列表由系统绘制（白底方角 + 系统灰高亮条），CSS 完全管不到，暗色下尤其突兀；旧的 `.admin-select*` 样式已删除。
  放在后台详情弹窗（z-index 3000）里时要传 `:panel-z="3100"`，否则面板被弹窗盖住。
- `Dropdown.vue` 的浮层默认 `z-index: 1010`（内联样式，可用 `:z-index` 抬高）；弹层本身由 floating-ui 定位 + Teleport 到 body，不受父级 `overflow` 裁切。
- ⚠️ `IconArrow` 画的是**向左**的 chevron（`PostImage.vue` 里用 `rotate(180)` 才表示向右）。要向下必须 `rotate(-90deg)`，写成 `90deg` 会变成朝上的 ∧。
- 发布框的 textarea 是**原生元素，class 直接就是 `.input-content`**（不是容器）→ 选择器写 `.publishing textarea.input-content`。
- 被禁言时空间页的 `.muted-notice` 是 **grid 三列**（图标 / 文字 / 按钮），手机上收成两列、按钮换到第二行；文案只放「恢复时间 · 原因」，后果那句 `.muted-notice__hint` 只在 ≥768px 显示。

**数据库**
- `user.create_time`，`post` / `comment` 是 `created_at`，列名不统一。
- `user.primary_role`(general_ci) 与 `user_role.role_code`(0900_ai_ci) 排序规则不同，列对列比较会 `Illegal mix of collations` 并**中止整份脚本**（终端看着像跑完了）→ 一律 `BINARY a = BINARY b`。
- `PostMapper.xml` 注释里禁止连续 `--`，MyBatis 启动即崩。
- 列表 SQL 里别加 `SUBSTRING(content,1,1200)` 省带宽，长文会被截断；折叠交给 CSS。
- ⚠️ 迁移脚本里「老用户回填成已验证」这种 **UPDATE 必须写在「刚加列」的分支里**（`IF(@col_exists = 0, 'UPDATE ...', 'DO 0')`）。写成无条件执行的话，重跑一次就把所有新注册的未验证用户全放过，防刷形同虚设。
- `UserVO.fromBO` 里 `emailVerified` 为 `null` 当**已验证**处理 —— 防的是「忘了跑迁移」把全站老用户锁死。别改成 `false`。

**邮件 / SMTP**
- QQ 邮箱 `MAIL_PASSWORD` 填的是**授权码**，不是登录密码；`From` 必须等于登录账号，否则 501。
- 三个超时（connect / read / write）都要设，SMTP 卡住会把 Tomcat 线程一起拖死。
- 发信失败统一包成 `CustomerException(SERVER_ERROR, "验证码发送失败，请稍后重试")`，别把 `MailException` 原文透给用户（里面带账号信息）。
- 本地调试不发真信：`MAIL_DEV_ECHO=true`（或 `app.mail.dev-echo: true`），验证码从响应里拿。**这个开关绝不能出现在 prod 配置里**。

**前端交互**
- `<768px` 时 `TopNavbar` 整块 `display:none !important`，任何新功能都要在 `MobileNavbar` 里放一份。
- URL 是搜索/分页的唯一数据源，筛选条件必须同步进 query。
- 控制台被 esbuild `pure:['console.log']` 干掉了，要上线也打印就走 `utils/logger.js` 的 `log()`。

## 7. 部署（顺序不能换）

```bash
# 1. SQL（新库全跑；老库按需补）—— 顺序：先 SQL，再换 jar
mysql -uroot -p --default-character-set=utf8mb4 kokomi < springboot/sql_email_verify.sql

# 2. 换 jar —— 必须 stop → 覆盖 → start，只 restart 等于没更新
systemctl stop kokomi
cp target/kokomi-0.0.1-SNAPSHOT.jar /kokomi/server/
systemctl start kokomi
systemctl status kokomi

# 3. 前端：解压 dist 包覆盖站点目录，然后让用户 Ctrl+Shift+R
```

- 环境变量在 `/etc/systemd/system/kokomi.service.d/override.conf`（`Environment="DB_PASSWORD=..."`，systemd 里 `$` 要写 `$$`）。
- **发信必须配的四个变量**（不配就没人能验证邮箱，等于全站禁言）：
  ```
  Environment="MAIL_USERNAME=xxxx@qq.com"
  Environment="MAIL_PASSWORD=<QQ 邮箱授权码，不是登录密码>"
  Environment="MAIL_HOST=smtp.qq.com"      # 默认就是它，可不写
  Environment="MAIL_PORT=465"              # 默认就是它，可不写
  ```
  改完 `systemctl daemon-reload` 再 `restart`。
- 上线后先自查一遍：随便登一个账号点「发送验证码」，看 `journalctl -u kokomi -n 50` 有没有 SMTP 报错。发不出去时用管理端「激活」按钮临时放行。
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
cd tools && python test-verify-email-api.py   # 507 拦截 / 限流 / 错码 / 幂等 / 管理端激活

# 界面测试（headless Chrome + CDP，真点真截图，截图落 shots/）
node tools/test-report-ui.js
node tools/test-ban-ui.js
node tools/test-verify-email-ui.js  # 未验证提示卡 / 验证弹窗 / 暗色 / 手机 / 后台激活
node tools/test-ui-polish.js     # 后台确认框 / 下拉框风格 / 移动端禁言提示卡
node tools/test-admin-select.js  # 举报页下拉：自绘面板 / 暗色 / 详情弹窗层级 / 手机宽度
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
2. 「忘记密码」—— 邮箱验证已经铺好发信链路，就差重置令牌表 + 两个接口
3. 存量幽灵账号清理（目前只防新增，没做删除）
4. 评论区渲染身份标签（后端 `CommentAuthorVO` 已返 `roleColor`，前端没用）
5. 收藏 / 草稿箱（表结构都还没有）
6. 拉黑（`user:block` 权限码是空壳，缺黑名单表和 handler）
7. 私信（要会话表 + 未读计数，轮询或 WebSocket）
