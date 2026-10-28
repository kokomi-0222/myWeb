# 心海的小窝（Kokomi）— 项目现状交接

> 换电脑 / 隔一段时间回来 / 换人接手，先读这一份。
> 最后更新：2026-10-27（注册改两步：先验邮箱出 ticket，再设密码；用户名由系统生成 kokomi_00128；邮箱可解绑；发信走阿里云 DirectMail）

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
- **注册两步**：第 1 步填邮箱收 6 位码（换一张 30 分钟的 ticket），第 2 步只设密码建号（**用户名由系统生成 `kokomi_00128`，用户不填**）；**发验证码那一步要过图形验证码**（验码、建号不再重复要图），**建号就是普通用户**并顺手返回 token（前端直接登录）；注册接口本身不发信，发码走独立的公开入口，人机 + 三层限流
- **邮箱中心（个人中心 → 账号安全）**：已绑定可在弹窗里**更换**或**解绑**（两者都必须先验当前密码）；解绑只丢「用邮箱找回密码」，会员身份和发帖评论照旧；老账号可在账号页补绑（6 位码）从而升级；**绑过的邮箱能找回密码**（登录弹窗「忘记密码」）；管理端对「有邮箱但未验证」的账号可手动激活兜底
- **等级制（游客 / 普通用户 / 会员）**：注册即验邮箱，新号落地就是普通用户，发帖评论都通；「游客」只剩历史存量账号（没绑过邮箱的老号）这一种来源，补绑后自动升普通用户。会员由管理员授予，目前与普通用户等价。判定全靠权限码，改规则只改 `role_permission` 表
- **外观**：深色模式（持久化）、名字颜色 / 身份标签颜色、角色标签
- **合规三件套**：首页页脚展示网站备案号（`赣ICP备2025059521号-1`，可点回工信部）、独立的 `/privacy` 隐私政策页（免登录可读）、注册第 1 步的「我已阅读并同意《隐私政策》」勾选框（默认不勾）

### 没做（有 `user:block` / `comment:report` 这种空壳权限码，别被误导）

拉黑、收藏、私信、草稿箱、@提及、Only 搜帖、编辑历史、二级评论分页。

## 5. 关键设计（改之前必须知道）

### 5.1 鉴权只看角色，不看 `user.primary_role`

- 真正的权限来自 `user_role` → `role_permission`；`user.primary_role` **只用来显示标签**，不参与鉴权。
- 「给某人加权限」= 挂角色，没有单人开权限这回事。
- 排查先看 `/user/info` 返回的 `permissions` 数组，别只看 `primaryRole`。
- `PermissionCache` 是静态 Map，登录时预热；拦截器未命中会回表重建（能自愈）。但**改角色 / 改角色权限后必须 `PermissionCache.remove(userId)`，改权限矩阵要 `clear()`**，否则对方不重启不生效。

### 5.2 真正被校验的权限码（6 个）

`post:create`（发帖 + 编辑自己的帖）、`comment:create`（评论 / 回复 / 举报）、`post:delete`（Service 层，删帖 + 删评论）、`post:edit`（改别人的帖）、`topic:create`、`user:manage`。

其余都是空壳，后台页面标了「未启用」。新增校验时同步改 `views/admin/Roles.vue` 的 `ENFORCED_PERMS`，并更新 5.8 的矩阵。

⚠️ 判断用 `service/PermissionService.has(userId, code)`，别在 Service 里再写一份私有 `hasPermission` —— 这个坑犯过三次（帖子、评论、举报各有一份）。

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

### 5.7 注册两步：先验邮箱，再设密码（用户名系统生成）

**为什么这么做**：最早是「邮箱验证码激活」，后来改成等级制（注册只收用户名 + 密码，邮箱登录后自己绑）。那版有个绕不过去的坑 —— 注册完是个什么都干不了的游客，得先登录、再翻到个人中心、再收码，中途放弃率极高；管理员手滑点「激活」还会造出「`email` 为空但 `email_verified = 1`」的死状态（用户在个人中心看到"未绑定"，去绑却一直提示"已验证"）。

现在固定成两步：

1. **第 1 步只验邮箱**：填邮箱 → 收 6 位码 → `POST /user/register/verify-email` 校验通过，服务端发一张 **ticket**（30 分钟）；
2. **第 2 步只设密码**：凭 ticket 建号，邮箱当场落成已验证。
   UI 上只有「标题 + 密码 + 确认密码 + 按钮」这四样：**不显示步骤进度**（不写「第 1 / 2 步 / 第 2 / 2 步」，两步本来很短，标出来只显得流程冗长）、**不重复显示刚验过的邮箱**（用户刚填完记得住，摆一遍纯占位）、**不提供「换一个邮箱」**（要换就关掉弹窗重来，`closeModal → resetRegisterState` 会清掉 ticket，必须重新验码）、**不显示任何用户名说明文案**（用户名是系统生成的，正文里解释它只会让人以为要自己填）。

为什么中间要 ticket、而不是第 2 步再交一次验证码：第 2 步要是因为密码类错误（两次不一致、太短）失败一次，用户就得重新收一封邮件。ticket 只绑定邮箱、**30 分钟**内可反复重试，建号成功才作废（`util/RegisterTicketCache`，内存 Map，重启失效）。

> **第 1 步的码只验不消费**（`EmailCodeCache.verify`，2026-10-27 起）：早先这里是 `check`（命中即把整条记录删掉），于是出现一个很难解释的场景 —— 用户验过之后没继续（关掉弹窗、先去看看别的），过几分钟重新打开注册框、输入同一封邮件里那个码，被告知「验证码已失效」，而邮件上明明写着 10 分钟内有效。现在同一个码在自己的有效期内可以反复验，每次发一张新 ticket；**建号成功后**由 `UserServiceImpl#register` 调 `EmailCodeCache.clear(email)` 清掉。安全性没变差：码本来就只发给这个邮箱，「证明我是主人」验一次和验三次是同一件事，真正的边界是 `uk_user_email`（一个邮箱只能建一个号）+ 错 5 次作废。
> 同理，找回密码 `/user/password/forgot/reset`、绑邮箱 `/user/verify/confirm`、换绑 `/user/email/change/confirm` 也都改成「先 verify、动作成功后再 clear」：中间任何一步失败（密码不一致、邮箱已被别的账号绑定）都不该把用户刚收到的码烧掉。`check`（一次一用）保留给将来确实需要一次性语义的地方。

> ticket 为什么是 30 分钟而不是和验证码一样 10 分钟：验证码要「赶紧复制过来」，10 分钟合理；ticket 之后用户要做的是**想一个密码**，还可能被别的窗口打断。之前两者都 10 分钟，用户在第 2 步停久一点就看到「邮箱验证已过期，请重新验证邮箱」，等于前面白验一次。ticket 绑邮箱、一次性、建号即废，放宽到 30 分钟不削弱安全性。

**能不能跳过第一步直接建号？—— 不能**（2026-10-27 用 `tools/check-register-bypass.py` 打接口实测 16/16）：

| 尝试 | 结果 |
|---|---|
| 不带 ticket | 400「请先验证邮箱」 |
| 伪造 ticket（32 位十六进制 / 短串 / 怪串） | 400「邮箱验证已过期，请重新验证邮箱」 |
| 拿 A 的 ticket，body 里塞 B 的 email | 建号成功但**落库是 A**，B 没被注册（`email` 只从 ticket 取） |
| 同一张 ticket 再建第二个号 | 拒绝（建号成功时已 `remove`），账号数不变 |
| 已注册邮箱再走第一步 | 502「该邮箱已被注册」 |

安全边界：ticket 是 `SecureRandom` 16 字节（32 位十六进制）**只存内存**、绑邮箱、30 分钟过期，猜不出来；验证码 6 位但 `MAX_FAIL=5` 命中即作废 + 同邮箱 60 秒 / 每小时 5 封 → 每小时最多试 25 次 / 100 万，暴力破解不可行。
⚠️ 例外要说清：**同一收件箱的别名邮箱能各自注册**（Gmail 的 `a+1@`、`a.1@` 都进同一个信箱），那不是绕过验证，而是「一个真实邮箱能开多个号」，只能靠 `RegisterRateLimit`（同 IP 20 个/小时）压。
⚠️ `userMapper.insert` 现在**接住 `DuplicateKeyException`**：`selectByEmail` 挡不住并发（双击注册、两台设备同时提交），第二个 insert 由 `uk_user_email` 拦下。不接住就是「服务器繁忙」，而用户其实第一次已经注册成功了，那句话只会让他以为全失败。

**为什么用户名不让用户填**（2026-10-28 再改）：用户名统一由后端生成 `kokomi_` + **主键序号**（`kokomi_00128`，`UserServiceImpl.usernameOf`）。理由：

- 「用户名已被占用」是注册流程里最容易让人卡住重填的一步，而它本来就不该由用户操心 —— 站内展示的是 `name`（昵称），`username` 只是登录/归属标识；
- 顺带消灭「用户名抢注别人邮箱」「用户名写成 `@abc`/`a@@b` 这种怪格式」两类问题；
- **为什么用序号而不是随机串**：最初版本是 `kokomi_` + 8 位随机串（`36^8 ≈ 2.8e12`），理由是「不暴露注册顺序、防遍历」。但本站没有任何按用户名访问的路由（没有 `/u/{username}`），别人拿不到用户名列表，防遍历无从谈起；`id` 本来就在接口返回里，也不差这一份。而序号在 `journalctl` 里一眼能认（`kokomi_00128` vs `kokomi_7f3a9c2d`），也省掉了「先查一次 + 撞名重试 5 次」那套逻辑；
- 唯一性不需要额外保证：`id` 是自增主键，天然唯一 ⇒ 用户名必唯一。`username` 的 UNIQUE 索引仍然留着兜底（手工改库 / 外部导入的同名数据会在这里炸），撞上时**不能把 `DuplicateKeyException` 抛给用户**，他根本没填过用户名，看到「已被使用」只会一头雾水；
- 用户在哪看自己的用户名：**个人中心 → 账号管理**里有一行「用户名」（附「系统生成，不可修改」）。
- ⚠️ 空间页顶部的用户信息栏**只显示昵称 + 角色标签**，不挂 `@username`（曾经挂过，用户要求换回原来的样式：那一栏是「我是谁」的身份条，塞一个永远不用输入的长串 ID 只是噪音）。账号管理页是唯一展示它的地方。
- 老账号不动：`admin` 这类自定义 username 保持原样。
- ⚠️ 前端第 2 步已经没有用户名输入框，`?{ticket, account, encryptedData}` 里的 `account` 后端**直接忽略**（老前端可能还带着它）。

**图形验证码只出现在「发验证码」那一步**（2026-10-28 改）：四个发信接口——注册发码、补绑发码、换绑发码、找回密码发码——都要带 `captchaKey + captchaCode`，否则 505「请先完成人机验证」。

- **为什么只卡发信**：发一封邮件是全站唯一有「外部副作用」的动作，也是最值钱的东西（SMTP 有日配额、还有全站 120 封/小时的硬限）。验码、建号这些步骤要么已经有邮件/ticket 证明过身份，要么干脆不发信，再要一道图灵测试只是给真人添麻烦。
- **为什么放 Controller 不放 Service**：四个入口的前置条件完全一样，`UserController#requireCaptcha` 一处挡住，Service 里的频控/配额/邮箱占用逻辑一行没动。登录的图形码仍在 `UserServiceImpl#login`（历史写法，保持原样）。
- 🔴 **只验不删，成功才消费**：`CaptchaCache.verify()` 不删条目，等 Service 正常返回后调用方再 `remove()`。原因是发码后面还有一堆会失败的业务校验（邮箱已被注册 / 没有绑定账号 / 密码不对 / 60 秒冷却）——一上来就把图烧掉，用户只是把邮箱打错一位就得重看一张图。代价是同一个 key 能被反复试，所以加了**累计错 3 次即作废**（`MAX_FAIL`）。
- 前端组件 `components/modules/CaptchaPrompt.vue`：点「发送验证码」才在按钮下方展开一行（输入框 + 图 + 确定 + 换一张），不是弹窗——弹窗套弹窗在手机上会叠两层蒙层。它只管「拿到 key + 用户输入」，发信由各自的父组件调；失败时 `fail(msg)` 就地换一张图。
  - **输入框必须是下划线式**（透明底 + 底部 2px 渐显线，复用 `--input-line-*` 变量），跟登录弹窗里的 `InputLine` 同一套语言；写成四边描边的卡片会和上面的邮箱框打架。整行 36px 高（`InputLine` 本体是 32px），输入框 / 图 / 确定按钮一律 `align-items: flex-end` 对齐底边，否则下划线会"悬"在图片下面错位（`shot-captcha-prompt.js` 里有一条几何断言在守这个）。
  - 图按后端的 200×80 等比放：90×36。⚠️ **不要用 `object-fit: cover` 配不匹配的比例**（曾用 108×40，按宽铺满把字符上下裁掉一截）。
  - 「确定」是描边按钮（跟同行的「发送验证码」同款），不是实心主色——实心会抢「下一步」的视觉重量。
  - 提示与错误**共用一行**（`.cp-note`，错误时加 `.cp-err` 只换颜色），右边常驻「取消」。写成 `v-if/v-else` 二选一会让报错时「取消」消失、整块还上下跳一下。
- 前端判定：后端 505 的两句文案（「请先完成人机验证」/「图形验证码不对，换一张再试」）用正则 `/人机|图形验证码/` 识别，命中就留在原地换图；其它错误（邮箱已被注册等）落到原来的红字位置。

| 账号状态 | 能登录 | 浏览 / 点赞 | 评论 / 回复 / 举报 / 发帖 |
|---|---|---|---|
| 注册完成（邮箱已验） | ✅ | ✅ | ✅（`member` 两个权限码都有，见 5.8） |
| 老账号没绑邮箱 | ✅ | ✅ | ❌ 返回 `507`，去个人中心补绑即可 |
| 解绑过邮箱 | ✅ | ✅ | ✅（角色不回收，只是不能再靠邮箱找回密码） |

- **第 1 步发码** `POST /user/register/email-code`（**免登录**，body `{email, captchaKey, captchaCode}`，全站唯一一个公开的发信入口，人机 + 三层限流都堆在这儿）。邮箱已被注册时**直接报 502「该邮箱已被注册」** —— 不说实话用户会一直试；找回密码现在也是同一口径（没有绑定账号就直接报 400）。
- **第 1 步验码** `POST /user/register/verify-email`，body `{email, code}` → 返回 `{ticket}`。验证码错 508（带剩余次数），邮箱已被注册 502（先查占用再消费验证码，失败不烧码）。
- **第 2 步建号** `POST /user/register`，body `{ticket, encryptedData}`。邮箱**只从 ticket 里取**，不看请求体 —— 否则能「验 A 的邮箱、注册成 B 的邮箱」。
- 用户名格式：`^kokomi_\d{5,}$`（`kokomi_00128`），由 `usernameOf(id)` 生成 —— 序号补零到 5 位，`id` 超过 5 位自然变长（`kokomi_100128`），远小于 `username` 列 varchar(50)。
- ⚠️ **昵称（`name`）由用户名派生**，不能直接抄：昵称规则是「≤12 字符、只允许中文/英文/数字/下划线」（`updateProfile` 里校验）。`defaultNickname()` 对序号型用户名去掉补零拼成「用户128」—— 既合规又好认（别显示成「用户000128」）；老路径（邮箱形式）仍走「取 @ 前段 + 剔特殊字符 + 截 12」。不改的话新用户一进账号页点「保存」就被后端拒掉（"昵称不能包含特殊字符"），而他什么都没改。
- ⚠️ **只有密码走 RSA**（`RegisterFormDTO.encryptedData` 里是 `{password, confirmPassword}`）。原因：RSA-1024 用 PKCS#1 v1.5 一块最多 117 字节，前端 JSEncrypt 按字节加密，塞多了直接失败；中文还会被截成乱码。登录那套「整个表单塞进 encryptedData」只有两个字段，不受影响。
- **注册即登录**：`register` 返回 `Result<LoginVO>`（和 login 一样带 token + user）；`stores/user.js` 的 `register` 落地 token，前端不用再输一遍密码。
- **换绑**（`mode="change"`）：换绑 = 换掉「找回密码」的凭据，所以必须验当前密码。两步走：
  - `POST /user/email/change/send`，body `{email, encryptedData}`，`encryptedData` 解密后是 `{oldPassword}` → 后端 `BCrypt.checkpw` 通过才给新邮箱发码
  - `POST /user/email/change/confirm`，body `{email, code}` → 只换 `email`，**角色和验证位都不动**
  - 不验密码的那版等于「拿到登录态就能把邮箱换成自己的再重置密码」，是账号接管。
- **解绑**（`mode="unbind"`）：`POST /user/email/unbind`，body `{encryptedData}`（`{oldPassword}`），同样 BCrypt 验密码（错密码 504）。
  - 一条 UPDATE：`email = null, email_verified = 0`；**角色一个都不动**（`primary_role` 仍是 member，`user_role` 也不删）。
  - 所以解绑只是「放弃用邮箱找回密码」，发帖 / 评论 / 举报全都不受影响 —— 发言闸门看的是权限码（`PostServiceImpl#checkCanPost`），和 `email_verified` 无关。
  - 幂等：本来没绑邮箱时直接当成功，连密码都不验（前端连点两下不该报错）。
  - 解绑后 `selectByVerifiedEmail` 找不到人，所以旧邮箱既不能登录找回，也不会因为「这个邮箱注册过」而拦住别人再注册（`user.email` 已置空）。
  - 想再绑回来：走普通补绑流程即可（`promoteIfGuest` 只对纯游客生效，member 不动）。
- 补绑（老账号、没邮箱）仍走 `POST /user/verify/send` + `/verify/confirm`，验过 `promoteIfGuest` 把游客升成 member。
- **入口只有「个人中心 → 账号安全」一处**（`views/space/Security.vue` 的邮箱行 + `components/modules/EmailBindPanel.vue`，`mode="bind" | "change" | "unbind"`）。全局弹窗 `VerifyEmailModal` 已删除。
- 邮箱行的样子：**标题「邮箱」→ 邮箱地址（未验证时跟一个「待验证」小标）→ 说明文字**，地址在标题**正下方**、与标题左对齐（试过放进标题右侧同一行，用户看过觉得挤，又退回来了）；右侧动作 **「更换」「解绑」用 `.sec-btn`**（32px 高、8px 圆角、1px `--border-color` 描边，和「修改密码」「注销账号」同一套语言；解绑叠 `.sec-btn--danger` 红字红描边）。hover **只把描边点亮、不铺底色**（曾叠一层 `--bg-hover` 灰底，两个按钮并排时像被同时选中，用户要求去掉）。⚠️ 旧的胶囊小按钮 `.email-link`（26px / 13px 圆角）已删除 —— 同一页出现两种按钮形状会让人猜哪个更重；测试选择器统一用 `.sec-row--email .sec-btn` 定位。
- `EmailBindPanel` 是**弹窗**（`Teleport to body`，`.bind-overlay` z-index **2000**，同登录弹窗）：标题随动作变（绑定 / 更换 / 解绑邮箱），底部 `.bind-tip` 小字说明对应后果（解绑：**不能再用这个邮箱登录**、也不能再找回密码，会员身份/发帖评论/已发布内容不受影响、之后可重绑；更换：换完旧邮箱不能找回密码）。弹窗顶部 `.bind-panel__desc` 也同步写「解绑后不能再用它登录或找回密码」。⚠️ **点蒙层不关闭**（同登录弹窗，防误触丢输入），只能点右上 × 或「取消」。
- ⚠️ 弹窗由 `v-if="bindOpen"` 挂载，挂载瞬间 `active` 就是 `true`，`watch(active)` 永远等不到变化 → 聚焦/自动发码必须同时写在 `onMounted` 里（`applyOpen()` 两处共用）。
- 发布框提示卡、评论区/回复框的「去绑定」都调 `utils/bindEmail.js` 的 `goBindEmail()` → 跳 `/space/security?bind=1`；已在账号安全页时改发 `kokomi:open-bind` 事件（事件监听也搬到了 `Security.vue`）。
- **507 不再直接弹窗**：`request.js` 广播 `kokomi:unverified`，`App.vue` 收到后调 `askBindEmail()` 先弹站内确认框。为什么不直接跳 —— 507 多半发生在「写完评论点发布」的瞬间，换页会把内容一起丢掉。
- 邮箱可用性在发码前查：`Validator.isEmail` + 长度 ≤50 + 查占用。文案分场景：**注册**说「该邮箱已被注册」（要不要换账号由他决定），**绑定/换绑**说「该邮箱已被其他账号绑定」。`user.email` 有 UNIQUE 索引（脚本 `springboot/sql_user_email_unique.sql`，幂等）。
- 拦在 **Service 层**（`createPost` / `updatePost` 仅作者本人 / `createComment`），和禁言同层。点赞、转发、浏览不拦。
- 业务码：`EMAIL_UNVERIFIED = 507`、`VERIFY_CODE_ERROR = 508`、`REGISTER_ERROR = 502`、`CAPTCHA_ERROR = 505`、`UPDATE_PASSWORD_ERROR = 504`（换绑 / 解绑时密码不对）。
- ⚠️ **验码仍要放在其它校验之后**（`/user/register/verify-email` 先查邮箱占用、再验码），虽然现在用的是「只验不消费」的 `EmailCodeCache.verify`，但「邮箱已被注册」这种话应该先说清楚，不该让用户输完码才知道；注册第 2 步不再碰验证码，所以「密码两次不一致 / 太短」失败一次也不会让用户重收邮件 —— 这正是 ticket 存在的理由。
- ⚠️ `verify` 命中的同时会把试错计数清零（`fails = 0`），否则前面输错几次后，每次正常验证都顶着「还剩 1 次」，迟早被莫名作废。
- 后台「激活」兜底（`POST /admin/user/{id}/verify`）**只在 `email` 非空时可用**，没邮箱的账号不给这个按钮 —— 否则又是那个死状态。
- 幂等：已验证的账号再调 send 返回「这个账号已经绑过邮箱了，要更换请用「换绑」」。

**限流的三层**

| 层 | 实现 | 规则 |
|---|---|---|
| 注册（IP） | `util/RegisterRateLimit` | 同 IP 20 个/小时，全站 100 个/小时（可用 `app.register.rate-limit-per-ip` 覆盖，本地联调调大） |
| 发码（邮箱） | `util/EmailCodeCache.issue` | 同邮箱 60 秒重发间隔，5 封/小时 |
| 发码（全站） | `EmailCodeCache` | 20 封/分钟、120 封/小时（配额最后扣，见下条） |

- ⚠️ **全站配额必须在「其它检查都通过之后」才扣**。放在频控之前的话，狂点「重发」会把正常用户的名额吃光，等于自己 DoS 自己。
- 验证码本身：6 位数字，10 分钟有效（从**发信那一刻**起算，不是收到邮件那一刻），同码最多错 5 次即作废。
- **重发即废旧码**（2026-10-27 用户定的规则）：只有「最近一次发送」的码能通过，之前几封邮件里的码立刻作废。原因是让码和邮件一一对应 —— 用户点了重发就该用最新那封，在两个码之间来回猜只会更乱。
  - 但输旧码**不报「验证码不正确」**：`EmailCodeCache` 还给最近 `MAX_RETIRED=2` 个旧码留着做识别，命中就返回 `CheckResult.SUPERSEDED` → 文案「验证码已更新，请使用最新收到的那封邮件里的验证码」，而且**不计入试错次数**（他不是在猜，是拿了上一封邮件）。前端在重发成功后会把验证码输入框清空，正常路径下碰不到这句。
  - 同一封邮件里的码在有效期内仍然可以**反复验证**（`verify` 只验不消费），这两条不冲突：不重发就一直有效，一重发旧的立刻作废。
- `EmailCodeCache` 是静态 `ConcurrentHashMap`（仿 `CaptchaCache`），**重启即全部失效 / 限流清零**。单机部署够用，要上多实例得换 Redis。
- 取 IP 走 `util/IpUtils`，优先 `X-Forwarded-For`（线上走 nginx 反代，`getRemoteAddr()` 只会拿到 127.0.0.1，限速会变成全站共用）。

**两个内存缓存会不会满（`MAX_SIZE = 5000`）**

结论：**正常运营填不满，差两个数量级**。算一遍就知道：

| 缓存 | 一条记录代表 | 存活多久 | 稳态条数 |
|---|---|---|---|
| `EmailCodeCache` | 一个发过码的邮箱 | 码过期（10 分钟）即被 `cleanExpired` 回收 | ≈ 最近 10 分钟发码的邮箱数 ≤ 20~40 |
| `RegisterTicketCache` | 一个验过邮箱的**人** | 30 分钟 | ≈ 30 分钟内验过邮箱的人数 ≤ 60 |

两个都受「全站 120 封/小时」的发码配额约束 —— 没有新码，就没有新记录。5000 是 100 倍余量。

- `EmailCodeCache` 满了会**拒绝所有发码**（包括老用户点重发），返回「请求人数较多，请稍后再试」+ `retryAfter=30` 让前端倒计时。所以「满了」的表现是全站注册停摆，不是部分失败 —— 真遇到要立刻查是不是配额被调大了。
- ⚠️ **`RegisterTicketCache` 同一邮箱只保留一张票**（`TICKET_OF_EMAIL` 反查索引）。必须这样：第一步的码是「只验不消费」，同一个码能无限次换票，没有这个索引的话一个人刷 `/user/register/verify-email` 就能把票缓存灌到 OOM（每条约 100 字节，30 分钟有效期，几百万条几百 MB）。现在无论验多少次都是同一张票，缓存条数 ≈ 人**数**而不是请求**数**。回归：`python tools/check-ticket-dedup.py`（连验 40 次 → 只 1 张票）。
- 票缓存满且清完过期项仍满时，`issue()` 返回 `null`，上层回 502「当前注册人数较多，请稍后再试」—— **宁可拒绝，也不无界增长**。
- 两个缓存的清理都是**惰性**的：`EmailCodeCache` 在每次 `issue` 时扫一遍，`RegisterTicketCache` 只在过期校验或撞上限时扫。没有定时任务，重启即空。

**发信（阿里云邮件推送 DirectMail）**
- `spring-boot-starter-mail` + `service/MailServiceImpl`，通道 `smtpdm.aliyun.com:465` + SSL（`MAIL_HOST` / `MAIL_PORT` / `MAIL_SSL` 可覆盖）。
- **阿里云没有「Java SDK」这回事**：官方那篇《SMTP 之 Java 调用示例》给的就是标准 JavaMail（`Session` + `Transport.send`）。所以不要按文档引 `com.sun.mail:javax.mail:1.6.2` —— 那是 `javax.mail` 包名，Spring Boot 4 用的是 `jakarta.mail`，引进来只会冲突。现有 `JavaMailSender` 就是同一套协议。
- 阿里云比 QQ 多两条硬要求，已在代码里处理：
  - **信封发件人（MAIL FROM）必须等于控制台创建的发信地址** → 配置 `mail.smtp.from`，缺省跟随 `spring.mail.username`（要单独指定就设 `MAIL_FROM`）。
  - **Message-ID 要用自家发信域**：JavaMail 默认是 `<uuid.JavaMail.user@hostname>`，ECS 的 hostname 是 `iZbp1xxxZ` 这种没有点的机器名，QQ/163 容易判垃圾 → `MailServiceImpl.DomainMimeMessage` 覆盖 `updateMessageID()` 生成 `<uuid@发信域>`。⚠️ 必须在 `saveChanges()` 之前由子类覆盖，**事后 `message.setHeader("Message-ID", ...)` 会被父类盖掉**。
- 控制台三步缺一不可（少一步就是 535/554）：① 发信域名 + DNS 验证（SPF/MX/DKIM）；② 该域名下建发信地址；③ 给发信地址设 **SMTP 密码**（不是登录密码、也不是 AccessKey）。`MAIL_USERNAME` 填发信地址本身。
- ⚠️ **阿里云 ECS 出方向 25 端口默认封禁**，别用 25；465(SSL) 最稳，80(明文) 需把 `MAIL_SSL=false`。
- `helper.setFrom(new InternetAddress(username, fromName, "UTF-8"))` —— 昵称随便写，但地址必须是那个发信地址。
- 三个超时都要设（`connectiontimeout/timeout/writetimeout` = 6/8/8 秒），否则 SMTP 挂住会把整个请求线程拖死。
- `app.mail.dev-echo=true` 时接口把明文验证码放在响应 `devCode` 里，前端也直接显示 —— **只给本地用，prod 不要配这个键**。SMTP 没配又没开 dev-echo 时验证码只打日志。
- `app.captcha.dev-echo=true` 时 `/captcha` 多返回一个 `captchaCode`（明文），前端 `CaptchaPrompt` 会把它渲染成「本地调试码」，脚本照着填就能过发码前的人机校验。开着等于图形验证码形同虚设，**只允许出现在本地配置里**（prod 无此键）。
- 兜底：`POST /admin/user/{id}/verify`（`user:manage`），用户管理页每行的「激活」按钮。SMTP 挂了、用户邮箱收不到，都靠它（但账号必须有邮箱）。

### 5.8 等级制：游客 / 普通用户 / 会员

需求演变过两次，**当前规则**是：

| 等级 | 角色码 | 谁给的 | 发帖 | 评论 / 回复 / 举报 |
|---|---|---|---|---|
| 游客 | `guest` | 注册默认 | ❌ `507` | ❌ `507` |
| 普通用户 | `member` | 绑邮箱 + 验证码通过后自动升 | ✅ | ✅ |
| 会员 | `vip` | 管理员在后台授予 | ✅ | ✅ |

- **不在代码里写死角色名**，三档全靠权限码表达：`post:create` 和 `comment:create` 都挂在 admin / moderator / editor / vip / member 上，`guest` 一个都没有。改规则只改 `role_permission` 表，不用改代码、不用发版。
- `vip` 目前和 `member` 等价，留着是给以后的特权（置顶、专属标识、只读档位之类）占位。第一版规则里 `member` 是不能发帖的，`post:create` 只在 vip 及以上；后来按需求改成「普通用户也能发帖」，所以 `sql_tier_permission.sql` 现在**给 member 也补 `post:create`**，并且不再有那段 `DELETE member/post:create`。
- 迁移脚本 `sql_tier_permission.sql`（幂等）：插 `comment:create` 权限码、插 `guest` 角色（`is_system=1, sort=6`）、补矩阵、清空 `guest` 的所有权限。它同时能**自愈**——老库里如果之前跑过「收回 member 发帖权」的版本，再跑一次就把码补回来。
- **两个业务码别混**：`507`（`EMAIL_UNVERIFIED`）= 还是游客，用户自己点「去绑定」就能解决；`509`（`NEED_VIP`）= 能评论但不能发帖（后台造出来的只读角色），用户自己解决不了。判定逻辑在 `PostServiceImpl.checkCanPost`：缺 `post:create` 时先看有没有 `comment:create`，没有就是游客 → 507，有就是只读角色 → 509。
  - 前端对 507 弹绑定弹窗（`VerifyEmailModal`），对 509 只给一句 toast + 空间页金色提示卡（不给按钮，因为点了也没用）。
  - 默认矩阵下 509 基本不会出现，但**别删那条分支和金色卡**——只要站长造一个「能评论不能发帖」的角色，它们就是正确的。
- **`promoteIfGuest`**（`UserVerifyServiceImpl`）：只有用户角色**全部是 guest**（或压根没角色）时才升 member；已挂任何其它角色一律不动 —— 防的是「管理员手动把某人降成游客，他再绑一次邮箱又爬回 member」。升级后 `PermissionCache.remove(userId)`。
- `updatePost` 里作者本人分支也要过 `checkCanPost`，否则「编辑旧帖」就是绕过发帖限制的后门。
- 前端等级判定全在 `stores/user.js`，都用权限码：`canPost = hasPermission('post:create')`、`canComment = hasPermission('comment:create')`、`needsBindEmail = !canComment`。空间页三张卡按顺序出现：禁言卡 → 待绑邮箱卡（蓝，带「去绑定」）→ 待开通发帖卡（金，无按钮）。
- ✅ **存量账号零影响**：老用户都是 `member`，`member` 两个码都有，跑完脚本发帖评论和以前一样；老用户的 `email_verified` 被回填成 1，不算待绑定。只有新注册的账号才落到 `guest`。

### 5.9 身份牌配色（`roleColor` / `nameColor` 各管什么）

三个字段别混：

| 字段 | 管什么 | NULL 时 |
|---|---|---|
| `user.name_color` | **只有名字** | 走 DDL 默认 `#636161` |
| `user.role_color` | **只有身份牌**（方块 + 帖子胶囊 + 主页胶囊） | 按角色取 `ROLE_DEFAULT_COLORS` |
| `user.primary_role` | 显示哪个等级的牌子 | 就不显示牌子 |

角色默认色（`vue/src/utils/roleTag.js` 的 `ROLE_DEFAULT_COLORS`）：

| 角色 | 颜色 | 理由 |
|---|---|---|
| `admin` / `moderator` / `editor` | `#e966b2` 品牌粉 | 管理团队同色系 |
| `vip` 会员 | `#e6a23c` 金 | 和空间页「会员」提示卡、`IconCrown` 呼应 |
| `member` 普通用户 | `#00aeec` 主题蓝 | 绝大多数人，用最中性的品牌色 |
| `guest` 游客 | `#4e5969` 深灰 | 「还没验证」的状态，越不抢眼越好 |

- **优先级**：后台单独设的 `role_color` → 角色默认色 → `name_color`（只给自建角色兜底）→ 空。
- ⚠️ **别把 `name_color` 当身份牌底色**。第一版就是这么写的，而 `name_color` 默认近黑，结果是**游客、普通用户、会员全是同一个黑块**，等级完全看不出来。用户的原话：「普通用户的牌子不要用黑色，黑色给游客用」。
- ⚠️ **`name_color` 是固定色、不随主题变**：默认 `#636161` 在暗色下亮度只有 98、对比度 3.4:1，名字几乎糊在背景里。所以空间页和他人主页都过一层 `readableNameColor(hex, isDark)` —— 暗色下亮度 < 110 提亮成 `#e5e6eb`，亮色下 > 220 压成 `#18191c`，其它情况**原样保留**（尊重用户选的颜色）。
- **`SILENT_ROLES` 只静默 `member`**：普通用户占绝大多数，每帖挂个「普通用户」是噪音；游客要显示，「还没验证」是需要让看帖人知道的状态（而且游客现在发不了帖，只有历史帖会出现）。
- 后台「外观」弹窗的预览也走同一套（`roleBlockColor` 传 `styleTarget.primaryRole`），清空标签底色时预览显示角色默认色，不是名字色。

### 5.10 找回密码（邮箱验证码，免登录）

入口在**登录弹窗的脚注**（「还没有账号? 立即注册 · 忘记密码」）和**账号安全页「修改密码」弹窗的底部**（「忘记密码? 用绑定邮箱重置」，`uiStore.openLoginModal('forgot')` 直接落在那一屏）。

| 接口 | 授权 | 说明 |
|---|---|---|
| `POST /user/password/forgot/send` | 免登录 | body `{email}`，给**已验证的邮箱**发重置码 |
| `POST /user/password/forgot/verify` | 免登录 | body `{email, code}`，**只验码**（界面第 1 步的「下一步」）：不查账号、不消费，第 2 步还要用同一个码 |
| `POST /user/password/forgot/reset` | 免登录 | body `{email, code, encryptedData}`，`encryptedData` 解密后是 `{newPassword, confirmPassword}`（和 `/user/password` 同一套 RSA） |

- 三个路径都要进 `auth.excludePaths`（`/user/password/forgot/**`）和前端 `setting.routesWhiteList` —— 登录不了才来这儿，带上过期 token 反而更乱。
- **界面分两步，和注册一个节奏**（2026-10-28 改）：第 1 步「找回密码」只有邮箱 + 验证码两格，点「下一步」调 `/forgot/verify`；通过了才进第 2 步「设置新密码」，只剩密码 + 确认密码两格，**不回显邮箱**。
  - 一屏四格（邮箱/码/新密码/确认）的问题是两次提交的报错混在一起：码填错了也要等点「重置密码」才知道，而那时密码框已经填了一半。
  - `verifyResetCode` **只验不消费、也不查账号**：不消费是为了第 2 步 `resetPassword` 能用同一个码再验一次（那里失败还能原地重试）；不查账号是为了不让第 1 步变成「这个邮箱有没有人用」的查询器 —— 未绑定的邮箱在第 1 步只会得到「验证码已失效」，账号不存在这件事到第 2 步才亮。
  - 两处校验共用 `UserVerifyServiceImpl#checkResetCode`，文案/剩余次数/旧码作废的语义保证一致。
  - 第 2 步若仍收到「验证码」类报错（码在两步之间过期、或被人重发覆盖），前端退回第 1 步并清空码框。
- **口径：没有绑定账号就直接说**（2026-10-28 改）。查不到「已验证的邮箱」时 `send` 报 `400「该邮箱没有绑定账号」`，不再假装「已发送」。文案只留这一句 —— 拦截器会把 `msg` 原样弹成顶部 toast，括注长了会占三行，表单里还有一行红字，同一句话看两遍很吵。
  - 曾经是防枚举的：不管有没有账号都回同一句条件文案「如果该邮箱绑定过账号…」，只给真账号发信，没匹配到还照样 `EmailCodeCache.issue` 占一次配额。改掉的理由：① 注册接口（`/register/email-code`）对「该邮箱已被注册」本来就是明说的，探号走注册框一步就够，这里沉默没有任何保密收益；② 真实代价全落在「解绑过邮箱又忘了密码」的人身上 —— 对着收件箱干等，还不知道这条路已经断了；③ 那个静默分支会给不存在的邮箱写一条码缓存，被刷时白占 `MAX_SIZE=5000`。
  - 文案不区分「从没注册」和「注册过又解绑」：解绑时 `email` 已置空，这两种在库里本来就是同一个样子，所以也不泄露「这个邮箱曾经注册过」。
  - 前端 `handleSendReset` 拿到 `400` 时走 `catch`，把后端 msg 显示在邮箱框下的红字里，**不进 60 秒倒计时**（用户可以立刻换个邮箱试）。
- **顺序很重要**：`resetPassword` 里先解密码、校验长度/一致性，**再** `EmailCodeCache.check`。反过来的话「两次密码不一致」这种纯前端问题也会把验证码烧掉，用户得重发一封邮件（第一版就是这么写的，测试当场抓到）。
- 成功后 `updatePasswordAndVersion` → 密码换新哈希 + `token_version + 1`（其它设备立即掉线）+ `UserTokenVersionCache.removeVersion`。找回密码的典型场景就是「号被别人登着」，不踢下线等于没找回。
- 邮件标题/正文和绑定邮箱分开（`MailService.sendResetCode`）：用户同时收到两封时靠标题才知道该填哪个码。
- ⚠️ **换绑后旧邮箱不能再找回密码**：`selectByVerifiedEmail` 带 `email_verified = 1` 条件且按当前 `email` 匹配，换完旧邮箱就不属于任何账号了（对它发码直接报 400「该邮箱没有绑定账号」，和「从没注册过」的文案完全一致）。

### 5.11 合规三件套（备案号 / 隐私政策 / 同意勾选）

- **常量集中在一处**：`vue/src/config/site.js` —— 站点名、**网站备案号**、工信部链接、联系邮箱、政策更新日期。首页页脚和隐私政策页都从它取，改一处两边同步。
- 🔴 **页脚要写「网站备案号」（带 `-1` 后缀），不是主体号**。主体是 `赣ICP备2025059521号`（个人主体），本站的服务编号是 `赣ICP备2025059521号-1`；两个都能在工信部系统查到，但页脚只认后者。
- **页面上不写真名**：备案只要求号和链接，「联系我们」写「（主办单位：个人开发者）」，`site.js` 注释同样不写姓名。工信部系统里能查到自然人姓名，但博客页脚没必要挂。
- **`/privacy` 不能加 `meta.requiresAuth`**：注册弹窗里勾「同意」之前就得能读，未登录的人也该能先看。守卫只看 `to.meta.requiresAuth`，不写就是公开页。
- ⚠️ **`setting.routesWhiteList` 不是路由白名单**，它是 `utils/request.js` 里的**接口路径**白名单（命中就不带 token、401 不弹登录框）。新增静态页不需要动它 —— 别像我一开始那样把它当路由表。
- **勾选框在「发送验证码」这一关就要拦**：邮箱从点发送那一刻就在收集，拖到「下一步」再问等于未经同意先收集。`handleSendRegCode` 与 `validateRegisterStep1` 都查 `agreePolicy`；`.agree-row { gap: 0 }`（中文里「同意」和「《隐私政策》」之间不能有缝，勾选框到文字的距离交给 `.agree-label` 的 gap）。
- **同意不跨会话**：`resetRegisterState()` 里把 `agreePolicy` 置 false，关掉弹窗再打开必须重勾。
- 弹窗里的政策链接用 `target="_blank"`，否则跳走会把填了一半的表单和 ticket 一起丢掉；勾选框和链接要拆成两个元素 —— 套在同一个 `label` 里点链接会连带勾上/取消勾。
- **页脚分两组**（`.kokomi-footer__meta` / `.kokomi-footer__links`）：手机上两组各占一行、中间的分隔点隐藏。不分组的写法会把「联系我们」挤到第三行孤零零挂着（390 宽实测：分组前 104px 带孤行，分组后 2 行 88px）。
- 隐私政策正文**必须与实现一致**：第三方只写阿里云 ECS + 邮件推送（DirectMail）和 Google Fonts（`index.html` 里的字体，会暴露 IP，正文如实披露了）；注销已经是**用户自助、即时生效**（见 §5.12），所以第七节写的是「个人中心 → 账号安全 → 注销账号」，只在结尾保留「已无法登录时可来信协助」。
- ⚠️ **改了注销方式就得回来改政策**：第七节、第六节（保存多久）是两处，别只改一处 —— 政策里写「人工处理」而实际能自助注销，属于「告知不一致」，比没写更糟。

### 5.12 注销账号（软删除 + PII 清空）

- **不是物理删除**。`post.user_id` / `comment.user_id` 是 `NOT NULL` 且**没有外键级联**，`DELETE FROM user` 之后 `PostServiceImpl:558` 回查作者会得到 null，首页会出现「空头像、空名字」的帖子，且归属永久丢失。所以注销 = 抹掉身份、保留骨架行。
- **`deleted_at datetime NULL` 是唯一的新列**（`sql_user_deactivate.sql`）。⚠️ **不加 `status = 3`**：`status` 被 `BanLevel` / `UserBanService` 当成 0正常/1禁言/2封号 用着，塞第三态要逐个检查 `status = ?`，漏一处就是「注销了还能发帖」。`deleted_at` 与处罚正交。
- 一条 SQL 干完（`UserMapper#deactivate`）：`username → deleted_{id}`（释放原用户名、防冒名）、`name → 已注销用户`、`email/phone/birthday/gender/signature/avatar/badge/ornament/name_color/role_color/primary_role → NULL`、`email_verified → 0`、`password → 随机 UUID 的 BCrypt`、`token_version + 1`、`deleted_at → now()`。`where deleted_at is null` 保证幂等。
- 🔴 **password 不能置空串**：`BCrypt.checkpw` 遇到非法哈希会抛 `IllegalArgumentException` → 500。给一个没人知道的随机密码哈希，登录表现就是「密码不对」。
- **email 置 null 而不是打标记**：`uk_user_email` 是唯一索引，但 MySQL 允许多个 NULL 并存 → 邮箱立刻释放，本人能马上用同一邮箱重新注册（已测）。
- 🔴 **两个缓存都要清**：`UserTokenVersionCache`（命中时不查库，留着旧版本号等于旧 token 继续有效）和 `PermissionCache`。这是「注销不生效」的唯一根因。
- **`selectByAccount` 加了 `deleted_at is null`**：注销后本来就查不到（email 空、username 已改），这层是兜历史脏数据。`countAll` 也加了 —— 首页用户数不该只涨不跌。
- **管理员护栏（前后端都拦）**：① 不能注销自己；② 不能注销任何持 `user:manage` 的账号。否则最后一个管理员把自己删掉，站点再也没人能进后台。自助侧在 `UserServiceImpl#deactivate`（403），后台侧在 `AdminUserServiceImpl#deactivateUser`（400/403）。
- **后台代注销必须手打用户名**：`ElMessageBox.prompt` + `inputValidator`，输不一致就提交不了。封号点错了能解，注销点错了回不来 —— 别做成一点就生效。
- **后台列表默认隐藏已注销**（`includeDeleted` 参数，`<if test="!includeDeleted">deleted_at is null</if>`）。⚠️ keyword 那个三路 `or` **必须加括号**，否则会变成 `deleted_at is null or username like ...`，已注销的人照样被搜出来。
- 前端：`views/space/Security.vue` 的注销段（红色描边按钮、非实心）+ `components/modules/DeactivatePanel.vue`（列后果 → 输密码 → 勾「我已知晓」，三者齐全红键才可点）。管理员账号按钮直接 disabled 并附说明。
- 验收：`tools/test-deactivate-api.py` **33/33**、`tools/test-deactivate-ui.js` **37/37**（DBG 9476）。

**入口归属（2026-10 调整）**：密码、邮箱、注销三件事全部收进 **个人中心 → 账号安全**（`/space/security` → `views/space/Security.vue`）。理由：这三件都在改登录凭据或删账号，跟「头像/昵称/签名」那种随手保存的资料表单不是一类东西，混在一起时容易被顺手点掉。
- 页面是**一行一个设置项**（`.sec-row`，细线分隔，不分三张卡）：登录密码 → `PasswordPanel` 弹窗；邮箱 → `EmailBindPanel` 弹窗；注销 → `DeactivatePanel` 弹窗。注销那行标题红色、按钮红色描边。
- 🔴 改密码从**独立页面改成了弹窗**（`components/modules/PasswordPanel.vue`），`views/space/Password.vue` 已删，`/space/password` 留重定向。
- 账号管理（`/space/account`）只剩资料编辑：头像、昵称、用户名（只读）、签名、性别、生日。
- 侧栏第四项文案「修改密码」→「账号安全」（图标 `IconShield`），移动端抽屉同步。
- 去掉了「危险区域」这个说法：用户觉得它出现在资料页里很怪，改成独立入口后不需要再靠警示标题区隔。
- 按钮统一 `.sec-btn`（32px / 8px 圆角 / 描边），邮箱行两个按钮也是它 —— 所以 **`.sec-btn--danger` 在页面上有两处**（邮箱「解绑」+「注销账号」）。UI 测试点注销必须写 `.sec-row--danger .sec-btn--danger`，`document.querySelector('.sec-btn--danger')` 会先命中「解绑」，弹出的是解绑邮箱弹窗（已踩）。**手机上按钮不铺满整行，一律收在各自内容的右下角**（用户明确要求：铺满一整条像横幅，也不像设置页）：
- 单按钮的行（修改密码 / 注销账号）：`.sec-row > .sec-btn{align-self:flex-end; width:auto}`；
- 邮箱行两个按钮：`.sec-actions{justify-content:flex-end}` + `.sec-btn{flex:none; width:auto}` → 两个按文字宽度并排贴右下；
- 账号管理页的「保存」同理：`.btn-row{flex-direction:row; justify-content:flex-end}` + `.save-btn{width:auto; min-width:96px}`（`@media` 里覆盖掉 `.form-item` 的竖排）。

---

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
- **后台窄屏（≤900px）= 侧栏横排 + 内容区自己滚**（`views/admin/Index.vue`）：
  - `.admin-app` 高度用 `height: 100dvh`（`100vh` 在手机浏览器比可视区高，底部会被地址栏挡住）。
  - 🔴 `.admin-body` 必须写 `min-height: 0`。窄屏下 `.admin-app` 变 column，它是主轴上的 `flex: 1`，而 flex item 默认 `min-height: auto` = 内容高度 —— 一屏放不下的长列表会把它撑到 3000+px，`.admin-content` 于是永远和内容一样高（没有滚动余量），多出来的部分又被 `.admin-app` 的 `overflow: hidden` 裁掉，**表现就是「手机上后台滑不动、下面的内容根本看不到」**（2026-10-28 修，修前 `.admin-content` 686/3655、scrollTop 恒 0）。
  - 用户卡片 `.user-row` 在 `<768px` 要 `flex-wrap: wrap` + `.user-row__main { flex: 1 1 calc(100% - 52px) }`，第一枚动作按钮 `margin-left: auto` 靠右：三个按钮（禁言 / 封号 / 外观）合计约 190px，不换行会把名字区挤到 **69px** —— 昵称显示成「kokom…」、6 个角色标签竖着排一列、单张卡片 290px 高，列表长得离谱（改后 269px / 两行标签 / 154px）。
  - 验收：`node tools/test-admin-mobile-scroll.js`（28 项，见下方清单）。
  - **改角色必须二次确认**（2026-10-28，用户反馈「角色分配容易误触」）：`Users.vue#toggleRole` 先 `ElMessageBox.confirm` 再写库 —— 标题「授予「版主」？」/「移除「版主」？」，正文点明**改的是谁**、**是加还是减**、**立即生效**；`admin` 角色额外说明「可以进入后台管理所有用户和内容」；移除走 `danger-confirm`（确认键变红）。点取消 = 什么都不发生（DOM 和库都不动）。
    之前是「点一下立即写库」，标签 26px 高、间距 6px，手机上很容易点到隔壁：一个方向是给错人权限，另一个方向是把人家的版主/管理员摘了。验收：`node tools/test-admin-role-confirm.js`（28 项，含 390 宽不溢出）。
  - **窄屏导航「还能滑」要做成看得见的**（2026-10-28）：390 宽下 5 个入口共 **518px**、容器只有 **366px**，屏外 152px（「举报处理」只露半截、「话题管理」完全看不见）。手机浏览器会把滚动条自动隐藏，除半截文字外没有任何暗示，用户不会想到去滑。做法：
    - 隐藏滚动条（`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`）—— 真机本来不画，桌面窄窗口留着灰杠只是脏；
    - **两端渐隐**：`.can-left` / `.can-right` / 两者同时，用 `mask-image`（`linear-gradient` 26px）只淡出「还有内容」的那一侧，滑到底自动消失；被 fade 掉的半截就是提示；
    - **当前项自动滚进视口**：路由切换 / `onMounted` 调 `centerActiveNav()` 把 `.is-active` 居中（最后一项居中会被 clamp 到最右，正常），避免深链接进「话题管理」时看到「五项一个都没高亮」；
    - **竖滚轮转横滑**：`@wheel` 里 `preventDefault` + `scrollLeft += deltaY`，否则桌面把窗口拖到 900 以下时没有触摸就没法横滑了。
    - ⚠️ 别在 `.admin-nav__item` 上省 `flex: 0 0 auto`：行内 flex 项默认会收缩，一旦某项宽度被压，渐隐和 scrollWidth 的计算都会跟着漂。验收：`node tools/test-admin-nav.js`（24 项：溢出量 / 滚动条 0 高 / 左中右三种渐隐 / 深链接自动滚入 / 滚轮横滑 / 桌面 1200 不回归）。

**等级制 / 权限码**
- 别在 Java 里写 `if ("vip".equals(role))`。等级只由权限码表达，`guest` 只是「一个权限都不挂的角色」，加/减档位只改 `role_permission`。
- ⚠️ **507 和 509 的区别别搞反**：507 = 还是游客（连评论都没有），绑个邮箱就什么都有了，用户可以自己解决；509 = 能评论但不能发帖（后台造的只读角色），用户自己解决不了，只能找站长。给 509 配个「立即升级」按钮会让人白点。
- `promoteIfGuest` 必须判「**全部**角色都是 guest 才升」，不能判「有 guest 角色就升」—— 后者会让被管理员降档的人绑一次邮箱就爬回来。
- 前端等级判定不要各页面自己拼 `userStore.user.permissions.includes(...)`，走 `stores/user.js` 的 `canPost / canComment / needsBindEmail`，否则改规则要全仓搜。
- ⚠️ **验证码「验完不消费」**（`EmailCodeCache.verify`）：同一封邮件里的码在 10 分钟内可以反复验证，注册第一步 / 找回密码 / 绑邮箱 / 换绑都用它，动作真正成功后才 `clear(email)`。所以「验证码之后还有别的校验」的流程（找回密码要先校验新密码）依然要把验码放在**最后**——不是怕烧掉码，而是「密码不合法」这种话应该先说，别让用户以为码有问题。一次性语义的 `check` 还在（命中即删除整条记录），只是注册链路不用它。
  回归脚本：`python tools/check-code-reuse.py`（11 项：同码连验 6 次、错码后仍可续验、错 5 次作废的防爆破边界）。
- ⚠️ **邮箱绑定不再是弹窗**：`VerifyEmailModal.vue` 已删，`uiStore` 里也没有 `verifyModalOpen/openVerifyModal/closeVerifyModal` 了。新增入口一律走 `utils/bindEmail.js` 的 `goBindEmail()` / `askBindEmail()`，别再手写 `router.push('/space/security')`（少带 `?bind=1` 面板不会展开）。
- `space/Index.vue` 现在也挂了 `<LoginModal />`：之前未登录进 `/space/**` 点「立即登录」没反应（弹窗只挂在首页和详情页）。
- ⚠️ **登录/注册弹窗点蒙层不关闭**（`LoginModal.vue` 的 `.modal-overlay` 上没有 `@click.self`，只有右上角 × 能关）。原因是误触代价太高：注册第二步握着一张 30 分钟的 ticket、登录框里可能已经填了半屏内容，鼠标一抖点漏就全丢。**新加弹窗别顺手加 `@click.self`**；如果确实要「点外面关」，先想清楚里面的未保存内容。
  回归脚本：`node tools/check-modal-outside.js`（不需要后端，只需 5194 预览）。

**数据库**
- ⚠️ **`UserMapper.insert` 只写了 `(password, email, phone)`**（老版本留下的），注册时 `user.setPrimaryRole("guest")` / `setNameColor(...)` 设了也白设 —— Service 层的值根本没进 SQL。后果：新注册账号的 `user.primary_role` 落成 DDL 默认的 `'member'`，而 `user_role` 里挂的是 `guest`。**权限是对的（确实发不了帖），但个人中心显示「普通用户」**，用户看到「我是普通用户却不能发帖」，极难解释。
  - 已修：insert 显式写 `primary_role`；`name_color` 故意不写（见下一条）。
  - 存量脏数据用 `springboot/sql_fix_primary_role.sql` 纠正（以 `user_role` 为准）。
  - 教训：**Java 里 set 了不等于写进去了**，改角色/默认值这类字段时，先去 mapper 里看一眼 insert 有没有这一列。
- ⚠️ **`name_color` 是固定色，不随明暗主题变**。往注册流程里写死 `#18191c` 之类的深色，等于把「暗色模式下名字看不见」埋进去。想给默认值就用 DDL 的 `#636161`，显示层用 `readableNameColor()` 兜。
- `user.create_time`，`post` / `comment` 是 `created_at`，列名不统一。
- `user.primary_role`(general_ci) 与 `user_role.role_code`(0900_ai_ci) 排序规则不同，列对列比较会 `Illegal mix of collations` 并**中止整份脚本**（终端看着像跑完了）→ 一律 `BINARY a = BINARY b`。
- `PostMapper.xml` 注释里禁止连续 `--`，MyBatis 启动即崩。
- 列表 SQL 里别加 `SUBSTRING(content,1,1200)` 省带宽，长文会被截断；折叠交给 CSS。
- ⚠️ 迁移脚本里「老用户回填成已验证」这种 **UPDATE 必须写在「刚加列」的分支里**（`IF(@col_exists = 0, 'UPDATE ...', 'DO 0')`）。写成无条件执行的话，重跑一次就把所有新注册的未验证用户全放过，防刷形同虚设。
- `UserVO.fromBO` 里 `emailVerified` 为 `null` 当**已验证**处理 —— 防的是「忘了跑迁移」把全站老用户锁死。别改成 `false`。
- ⚠️ **「服务器繁忙」= 兜底异常，几乎总是缺列 / 缺表**：`GlobalExceptionHandler` 的 `SQLException` 分支只接 `java.sql.SQLException`，而 MyBatis 的 `BadSqlGrammarException`（`Unknown column`、语法错）是 **`RuntimeException`**，接不住 → 落到最后兜底显示「服务器繁忙」，日志里才有真堆栈（`journalctl -u kokomi | grep -A8 Exception`）。
  - 线上真踩过：只跑了 `sql_tier_permission.sql`、漏了 `sql_email_verify.sql`，症状是**后台「用户管理」整页进不去，首页/帖子/后台概览全正常**。
  - 为什么只有那一页挂：`UserMapper.selectById` 是 `select *`，少一列只是字段映射不到、不报错；而 `selectAdminPage`（后台用户列表）和 `selectVerifyState`（绑定邮箱）**写死了列名**，少一列整条语句就废。
  - 排查一条命令：`SHOW COLUMNS FROM \`user\` LIKE 'email_verified';` 空结果 = 没跑脚本。补跑后 **DDL 立即生效，不用重启 jar**（和权限矩阵不同，那个有内存缓存）。
  - 教训：**新增列后，任何写死列名的 `@Select` 都会变成一个「只在那一页炸」的 500**，而 `select *` 的接口看起来一切正常 —— 别用「其它页面正常」推断「SQL 跑过了」。

**邮件 / SMTP（阿里云 DirectMail）**
- `MAIL_USERNAME` = 控制台里的**发信地址**（`noreply@mail.xxx.com`），不是阿里云账号；`MAIL_PASSWORD` = 该发信地址的 **SMTP 密码**（不是登录密码、不是 AccessKey）。
- 报错对照：**535** = 账号/SMTP 密码错（或发信地址没创建）；**553/554** = 发信域名没验证 / From 与发信地址不一致 / 触发频率限制。
- 端口只能 465(SSL) 或 80：**阿里云 ECS 出方向 25 默认封禁**，用 25 会连接超时。
- 三个超时（connect / read / write）都要设，SMTP 卡住会把 Tomcat 线程一起拖死。
- 发信失败统一包成 `CustomerException(SERVER_ERROR, "验证码发送失败，请稍后重试")`，别把 `MailException` 原文透给用户（里面带账号信息）；排查看日志里那四条 hint。
- 本地调试不发真信：`MAIL_DEV_ECHO=true`（或 `app.mail.dev-echo: true`），验证码从响应里拿。**这个开关绝不能出现在 prod 配置里**。

**前端交互**
- `<768px` 时 `TopNavbar` 整块 `display:none !important`，任何新功能都要在 `MobileNavbar` 里放一份。
- URL 是搜索/分页的唯一数据源，筛选条件必须同步进 query。
- 控制台被 esbuild `pure:['console.log']` 干掉了，要上线也打印就走 `utils/logger.js` 的 `log()`。
- ⚠️ 空间页的宽度是**写死的 `--content-with: 700px`**（`.home` 上定义），`.publishing` / `.user-posts` / `.muted-notice` 都用它。新增同类块时**必须同时加进文末 `@media (max-width: 768px)` 的 `width: 100%` 名单**，否则手机上横向溢出 700px（一半内容在屏幕外）。`.muted-notice` 就漏过一次（禁言提示卡，存在了很久没被发现）。
- ⚠️ 空间页头部（`.user-info`）里**昵称必须可收缩可断行**：昵称是用户自定义的，`中文`没断行点、`vfy_guest_9107722065` 这种带下划线的串浏览器也不断，只写 `min-width: 0` 不够 —— 要给 `.user-name` 加 `flex: 1 1 auto`，给昵称那个 `span` 加 `overflow-wrap: anywhere`，并给 `.user-role` 加 `flex: none; white-space: nowrap`。否则窄屏下角色标签被直接顶出视口（390 宽时 `scrollWidth` 变成 434，出现横向滚动条）。这一条是被 `test-verify-email-ui.js` 的「页面没有横向溢出」抓出来的。

**测试（CDP 移动端模拟）**
- ⚠️ `Emulation.setDeviceMetricsOverride({ width: 390, mobile: true })` 下，Chrome 会按内容做 shrink-to-fit：`window.innerWidth` 报的是**内容宽度**（本页溢出时是 712），真正可见的只有 390，`visualViewport.width` 也是 390，`documentElement.clientWidth` 是 390。
  - 拿 `innerWidth` 当视口宽去断言「面板/卡片不溢出」= **假阳性**（`546 <= 712` 天然成立）。
  - 截图同样会骗人：它把 712 宽的布局压进 390 的图里，看起来"刚好放下"，其实真机上卡片有一半在屏幕外。
  - 量手机布局请用 **`mobile: false` + `width: 390`**（真窄窗口），断言取 `documentElement.clientWidth`；mobile 模拟只在必须验 `visualViewport` 时才用。
- 页面存在横向溢出时，`position: fixed` 元素（顶栏、抽屉、遮罩）会一起被拉宽 —— 排查时看到「fixed 元素宽 712」不要以为是组件写死了宽度，先找把 `body.scrollWidth` 撑大的那个块元素。

## 7. 部署（顺序不能换）

> 一次性把「邮箱绑定 + 等级制」搬到线上的逐步清单（含改动文件表、验证方法、回滚）见
> **`docs/DEPLOY_TIER.md`**，下面只是要点。

```bash
# 1. SQL（新库全跑；老库按需补）—— 顺序：先 SQL，再换 jar
mysql -uroot -p --default-character-set=utf8mb4 kokomi < springboot/sql_email_verify.sql
mysql -uroot -p --default-character-set=utf8mb4 kokomi < springboot/sql_tier_permission.sql   # 等级制（必须在上面那个之后）
mysql -uroot -p --default-character-set=utf8mb4 kokomi < springboot/sql_user_deactivate.sql   # user.deleted_at（注销用）

# 2. 换 jar —— 必须 stop → 覆盖 → start，只 restart 等于没更新
systemctl stop kokomi
cp target/kokomi-0.0.1-SNAPSHOT.jar /kokomi/server/
systemctl start kokomi
systemctl status kokomi

# 3. 前端：解压 dist 包覆盖站点目录，然后让用户 Ctrl+Shift+R
```

- ⚠️ **顺序绝不能反**：先换 jar 再跑 SQL，中间那段时间后端按旧矩阵判权限（旧库里 `guest` 角色还不存在、`comment:create` 也没有），用户会看到「能发帖」但点发送报错。存量账号本身**零影响**（见 5.8 最后一条），不用额外升档。

> 「注册两步 + 邮箱可解绑」（5.7）这一版要换 jar + 前端包，外加**一条幂等 SQL**：> - jar 里带 `auth.excludePaths` 的新白名单（`/user/register/email-code`、`/user/register/verify-email`、`/user/password/forgot/**`），**不用动服务器上的配置文件**；
> - `springboot/sql_user_email_unique.sql`：给 `user.email` 加 UNIQUE 索引（脚本先查重，有重复会停下列出来）。加了之后「两个人抢同一个邮箱」在数据库层也拦得住，应用层早一步报错，双保险；
> - ⚠️ 线上**不要**设 `app.mail.dev-echo` / `app.captcha.dev-echo` / `app.register.rate-limit-per-ip`（这三个键 prod 里根本不该出现：前两个等于把验证码明文发出去，最后一个等于取消注册限速）；
> - 找回密码要真能收信，线上必须配 `MAIL_USERNAME` / `MAIL_PASSWORD`（同 5.7 的发信部分），没配时用户点了也「看起来发了」，实际只在日志里 —— **现在注册也强依赖发信**，没配 SMTP 新用户根本注册不了。

> 「用户自助注销」（见 5.12）这一版：**先跑 `sql_user_deactivate.sql`，再换 jar，最后换前端包**。
> jar 里很多查询带 `deleted_at is null`，列不存在会直接 SQL 报错（不是静默放行，首页、登录、后台用户列表会一起挂）。
> 不需要动 nginx 和环境变量；注销是纯应用层动作，没有新的外部依赖。

- 环境变量在 `/etc/systemd/system/kokomi.service.d/override.conf`（`Environment="DB_PASSWORD=..."`，systemd 里 `$` 要写 `$$`）。
- **发信必须配的变量**（不配就没人能验证邮箱，等于新用户注册不了、也找不回密码）：
  ```
  Environment="MAIL_USERNAME=noreply@mail.example.com"   # 阿里云控制台里的「发信地址」
  Environment="MAIL_PASSWORD=<该发信地址的 SMTP 密码，不是登录密码也不是 AccessKey>"
  Environment="MAIL_HOST=smtpdm.aliyun.com"             # 默认就是它，可不写
  Environment="MAIL_PORT=465"                            # 默认就是它，可不写（ECS 别用 25，被封锁）
  Environment="MAIL_SSL=true"                            # 465 时必须 true；用 80 明文才设 false
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
cd tools && python test-email-center-api.py   # 补绑 / 换绑 / 解绑（都验密码）/ 找回密码：63 项（RSA + 未绑定报错 + 第 1 步只验码 + 旧 token 失效）
cd tools && python test-register-email-api.py  # 两步注册：发码（含人机校验 5 项）/ 换 ticket / ticket 重试与作废 / 注册即登录 / 用户名自动生成 kokomi_00128 / 昵称派生 / 重发即废旧码：46 项（含 61 秒冷却等待）
cd tools && python check-code-ttl.py           # 验证码实际有效多久：1 分 / 9 分仍可用、10 分 40 秒已失效（跑一次 11 分钟）
cd tools && python check-resend-invalidates-old.py  # 重发后旧码立刻失效 + 文案是「已更新」+ 旧码不计试错（约 75 秒）
cd tools && python check-code-reuse.py         # 验过不注册、回头再输同一个码：连验 6 次都通过 + 错 5 次作废的边界：11 项（秒级）
cd tools && python check-ticket-dedup.py       # 同一个码连验 40 次只产生 1 张票（票缓存不会被刷爆）：3 项（秒级）
cd tools && python check-register-bypass.py    # 安全向：不带/伪造/复用 ticket、body 塞别人邮箱、已注册邮箱再发码：16 项
cd tools && python test-tier-permission-api.py   # 等级制主测试：三档 × 发帖/评论/举报 + 绑邮箱升级 + 管理员改档
cd tools && python test-report-api.py
cd tools && python test-ban-level-api.py
cd tools && python test-verify-email-api.py   # 绑定链路本身：发码频控 / 错码 508 / 幂等 / 管理端激活：29 项

# 界面测试（headless Chrome + CDP，真点真截图，截图落 shots/）
node tools/test-email-center-ui.js  # 找回密码两步（发码前人机校验 / 错码停在第 1 步 / 第 2 步不回显邮箱）/ 未绑定邮箱红字（不进倒计时）/ 账号安全页邮箱行（暗色 + 390 宽）/ 邮箱行动作按钮 hover 只描边不铺底 / 改密码弹窗里的「用绑定邮箱重置」：44 项
node tools/test-email-modal-ui.js # 账号安全页「更换 / 解绑」：与 .sec-btn 同款描边按钮、无行内小字、弹窗标题与底部后果小字（含「不能再用邮箱登录」）、点蒙层不关闭、390 宽不溢出：19 项
node tools/shot-space-userinfo.js # 空间页用户信息栏：不显示 @用户名、角色标签紧跟昵称、长昵称不溢出（出 2 张截图）：8 项
node tools/test-register-email-ui.js  # 两步注册（第 1 步只验邮箱 + 必须勾选《隐私政策》才能发码 + 发码前人机校验）→ 自动登录 → 账号安全页解绑（验密码）/ 390 宽：46 项
node tools/test-verify-email-ui.js  # 两步注册首屏 / 游客补绑（含人机校验）→普通用户→解绑→会员 / 暗色 / 手机 390 / 后台激活：77 项
node tools/shot-captcha-prompt.js   # 人机校验外观：展开 / 输入框·图·按钮底边同线 / 输错换图 / 390 宽一行不换行 / 暗色（出 4 张截图）：9 项
node tools/test-report-ui.js
node tools/test-ban-ui.js
node tools/test-ui-polish.js     # 后台确认框 / 下拉框风格 / 移动端禁言提示卡
node tools/test-admin-select.js  # 举报页下拉：自绘面板 / 暗色 / 详情弹窗层级 / 手机宽度
node tools/test-role-tag-color.js # 身份牌配色：游客深灰 / 普通用户蓝 / 会员金 / 管理粉 + 注册落库角色
node tools/test-admin-mobile-scroll.js # 移动端后台（390 宽）：内容区能滚 / 滚到底看得到最后一张卡 / 用户卡片不被动作按钮挤扁 / 五个页面不横向溢出 / 桌面 1200 不回归：28 项
node tools/test-admin-role-confirm.js # 用户管理改角色：点标签先弹确认框 / 取消不写库 / 授予才写库 / 移除用红色确认键 / 管理员提示后台权限 / 390 宽确认框不溢出：28 项
node tools/test-admin-nav.js        # 窄屏导航：五项溢出一行 / 滚动条隐藏 / 左右中三种渐隐 / 深链接当前项自动滚入 / 滚轮转横滑 / 桌面 1200 不回归：24 项
node tools/test-privacy-page.js      # 隐私政策页：/privacy 免登录直达 / 十章齐全 / 备案号与联系方式 / 首页页脚三项链接 / 390 宽不溢出 / 深色反差 / 勾选同意不跨会话保留：33 项
node tools/test-security-page.js     # 账号安全页：侧栏「修改密码」→「账号安全」/ /space/password 重定向 / 三段（密码·邮箱·注销）/ 邮箱地址在标题下方且按钮与「修改密码」同款 / 改密码弹窗三类校验 / 弹窗里「用绑定邮箱重置」/ 注销弹窗 / 390 宽（按钮收右下：单按钮贴右、邮箱两钮并排、保存键贴右）/ 暗色可读 / 账号管理页已无邮箱与注销：35 项
node tools/test-deactivate-ui.js     # 注销：账号安全页的注销段 / 弹窗两个条件缺一不可 / 注销后回首页且 token 清空 / 管理员行无注销键 / 代注销必须手打用户名 / 已注销默认隐藏 + 勾选后带「已注销」标记：37 项
```

```bash
# 接口验收（需要本地后端 18080）
python tools/test-deactivate-api.py  # 注销：未登录 401 / 缺密码 400 / 密码错 504 / 清 PII + 释放邮箱 / 旧 token 失效 / 原密码登不进 / 同邮箱可重注册 / 帖子作者变「已注销用户」/ 管理员不可注销（自己 + 持 user:manage）/ 代注销 / 列表过滤：33 项
```

- ⚠️ 本地测试账号 `id=9` 额外挂着 `vip` 角色（早期规则下 `member` 不能发帖时留下的）。现在 `member` 也能发帖，这条已经不影响结果，但别据此假设「测试环境里 member 发不了帖」—— `test-tier-permission-api.py` 专门验这条规则本身。

- `tools/_local.py` 是凭据读取工具（**不含明文，已入库**）：优先读环境变量 `DB_PASSWORD` / `JWT_SECRET`，否则读 `springboot/kokomi/config/application-local.yaml`。所以只要 §3.1 那个文件在，测试脚本就能跑。
- `tools/refresh_tokens.py` 重新签发 `shots/tmp/tokens.json`。`exp` 会过期、封号会让 `token_version + 1`，UI 测试 401 时先跑它，别急着怀疑代码。
- ⚠️ **看输出用 `tail`，别用 `| head`** —— SIGPIPE 会杀掉 node 进程，测试跑一半留下脏状态（比如「成员还在禁言」）。
- ⚠️ **`--window-size` 在 `--headless=new` 下不一定生效**：视口一旦 <768px，`TopNavbar` 整块 `display:none`，`.login-button` 的 rect 是 0×0，点击落在 (0,0) 的移动端导航上 —— 表现为「点了没反应」，很容易误判成弹窗坏了。CDP 脚本连上后先 `Emulation.setDeviceMetricsOverride({width:1200,height:1000,mobile:false})`。
- ⚠️ **`nav()` 不能只等 `document.readyState === 'complete'`**：`about:blank` 一开始就是 complete，会立刻返回，后面读 `localStorage` 直接 `SecurityError`。要等 `location.origin` 真的换成目标站点。
- 每个 UI 测试用**独立的 `--user-data-dir`**（带上 `process.pid`）：固定目录时上一轮残留的 Edge 进程会占着它，新进程直接退出，CDP 连上的是上一次那个空白页。
- 界面测试轮询等 DOM，不要固定 `sleep`（首页横幅首屏 3.5s）。

## 9. 换台电脑怎么继续

1. `git clone git@github.com:kokomi-0222/myWeb.git`
2. 按 §3.1 补 `springboot/kokomi/config/application-local.yaml`、按 §3.2 建库跑 SQL、`npm install`
3. 不用管 `tools/_local.py`（已入库且不含密钥，会自动读上面那个 yaml）
4. 打开这个仓库，跟 AI 说一句「读 docs/PROJECT_STATE.md，然后我们继续做 XXX」

代码走到哪一步，`git log` 里每个提交都写了改了什么；为什么这么改、坑在哪，就是这份文档。

## 10. 待办（按优先级）

1. ~~自助注销（软注销 / 匿名化）~~ ✅ 已完成，见 §5.12。剩下的尾巴：注销用户超过 N 天后**彻底清掉** `avatar` 文件（现在只清了数据库里的 URL，`uploads/` 下的图片还在），以及 `notification` 里指向他的旧记录要不要一并匿名化
2. nginx 给 `/index.html` 加 `no-cache`（一劳永逸解决换包强刷）
3. 后台「用户管理」只能一格一格点角色，缺批量操作（用户多了会很难受）
4. 存量幽灵账号清理（目前只防新增，没做删除）
5. 评论区渲染身份标签（后端 `CommentAuthorVO` 已返 `roleColor`，前端没用）
6. 收藏 / 草稿箱（表结构都还没有）
7. 拉黑（`user:block` 权限码是空壳，缺黑名单表和 handler）
8. 私信（要会话表 + 未读计数，轮询或 WebSocket）
9. Google Fonts 换成本地字体（现在两套中文字体直连 Google，国内基本加载不到，还多一次第三方请求；自托管后隐私政策里那条披露也能删）
