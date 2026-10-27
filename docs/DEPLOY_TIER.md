# 上线清单：邮箱绑定 + 等级制（游客 / 普通用户 / 会员）

> 线上现在跑的版本**没有**这两套东西：注册还是老逻辑、`user` 表没有 `email_verified` 列、
> 发帖只要求登录。照这份清单从上到下做一遍就上线了，顺序不要打乱。
>
> **后续增量 1（同一份 jar / 前端包已包含，不需要额外 SQL）**：
> 邮箱绑定从弹窗搬进「个人中心 → 账号管理」、绑过的邮箱可以找回密码。
> 白名单 `/user/password/forgot/**` 写在 jar 的 `application.yaml` 里，不用改服务器配置。
>
> **后续增量 3 —— 注册改两步 + 邮箱可解绑**：
> 注册拆成「①邮箱+验证码 → 换 ticket」「②用户名（默认用邮箱）+ 密码 → 建号」，
> **不再要图形验证码**；`POST /user/register` 的 body 从 `{account,email,emailCode,...}`
> 变成 `{ticket, account, encryptedData}`，另加免登录的 `POST /user/register/verify-email`。
> 邮箱恢复**解绑**（`POST /user/email/unbind`，必须验当前密码，角色不回收）。
> **不需要新 SQL**，只换 jar + 前端包；白名单新增 `/user/register/verify-email`（写在 jar 的 `application.yaml`）。
> ⚠️ 前后端必须一起上：旧前端带 `email/emailCode` 调新后端会一直报「请先验证邮箱」，反之亦然。
> ⚠️ 线上不要出现 `app.mail.dev-echo` / `app.captcha.dev-echo` / `app.register.rate-limit-per-ip`
> 这三个键（只属于本地配置）。
>
> **后续增量 4 —— 用户名由系统生成（本次）**：
> 用户名不再让用户填，后端统一生成 `kokomi_` + 8 位小写字母数字（`kokomi_a3f9c2d1`），
> 昵称派生为「用户+尾 6 位」。第 2 步只剩「密码 + 确认密码」；
> **`POST /user/register` 的 body 精简成 `{ticket, encryptedData}`**，请求里带 `account` 也会被忽略。
> **不需要新 SQL**（`username` 列本来就有 UNIQUE 索引），只换 jar + 前端包。
> ⚠️ 前后端要一起上：旧前端第 2 步还有用户名输入框，虽然能注册成功（后端忽略），
> 但用户会以为自己设的名字生效了，实际上被丢弃。
> ⚠️ 存量账号的 username（`admin` 之类）不动；它们含 `@` 的话空间页不会显示 `@用户名`。
> **发信通道同期换成阿里云 DirectMail**：`MAIL_HOST=smtpdm.aliyun.com`、`MAIL_PORT=465`、
> `MAIL_USERNAME` 填控制台「发信地址」、`MAIL_PASSWORD` 填该地址的 SMTP 密码；
> ⚠️ 如果旧 `override.conf` 里还留着 `MAIL_HOST=smtp.qq.com`，**必须改掉** —— 环境变量优先级高于 jar 内默认值。

> **后续增量 5 —— 验证码有效期修复（本次）**：
> **只换 jar，前端不用动，也不需要 SQL。**
> ① `EmailCodeCache`：验证码**验过不消费** —— 用户验完不注册、回头再输同一个码仍然能过（之前一命中就删记录，他会被告知「已失效」，而邮件写着 10 分钟有效）。
> ② `EmailCodeCache`：**重发即废旧码** —— 只认最近一次发送的码，之前几封邮件里的立刻作废；用户输旧码时回「验证码已更新，请使用最新收到的那封邮件里的验证码」（不算猜错，不扣试错次数）。
> ③ `RegisterTicketCache`：ticket 有效期 10 → **30 分钟**（第 2 步想密码/被打断不至于白验一次邮箱）。
> ⚠️ 两个缓存都在**进程内存**里，`systemctl restart` 会让所有未用的验证码和 ticket 立刻失效。
> 如果用户刚收到码、你正好在发版，让他重新点一次「发送验证码」即可。

## 0. 一句话看完

| 要动的东西 | 数量 | 说明 |
|---|---|---|
| SQL 脚本 | **3 个** | 前两个先跑、必须在新 jar 启动之前；第三个是数据纠正，随时能跑 |
| 后端 jar | **1 个** | 重新 `mvn package` 打出来的那个 |
| 前端构建包 | **1 个** | `vue/dist_1027_username.zip`（增量 4 起用这个），解压覆盖站点目录 |
| 环境变量 | **2 个必填** | `MAIL_USERNAME` / `MAIL_PASSWORD`，不配没人能绑邮箱 |

`pom.xml`（多了 `spring-boot-starter-mail`）和 `application.yaml`（多了 `app.mail.*`、`spring.mail.*`）
都已经在代码里，跟着 jar 一起走，**不需要手工改服务器上的配置文件**，只要补环境变量。

---

## 1. 数据库（先跑）

### 1.1 三个脚本分别干什么

| 脚本 | 干什么 | 为什么要它 |
|---|---|---|
| `springboot/sql_email_verify.sql` | 给 `user` 加 `email_verified TINYINT`（默认 0），并把**存量用户回填成 1** | 没有这列，后端启动就报字段不存在；老用户不回填会被当成游客锁死 |
| `springboot/sql_tier_permission.sql` | 新增 `comment:create` 权限码、新增 `guest` 角色、写死「角色 → 权限」矩阵、清空 `guest` 的权限 | 等级制的地基。代码里一句角色名都没写死，全靠这张表 |
| `springboot/sql_fix_primary_role.sql` | 把「`user_role` 是 `guest`、但 `user.primary_role` 写着 `member`」的账号纠正成 `guest` | 修一个显示 bug：注册的 insert 漏写了 `primary_role`，落成 DDL 默认的 `member`。**权限一直是对的**（判定看 `user_role`），只是个人中心显示成「普通用户」 |

⚠️ 三个脚本都**幂等**，重复跑不会出事。前两个顺序不能反（`sql_email_verify` 在前），第三个跟 jar 无关、随时能跑。

### 1.2 执行

```bash
cd /path/to/myWeb
mysql -uroot -p --default-character-set=utf8mb4 kokomi < springboot/sql_email_verify.sql
mysql -uroot -p --default-character-set=utf8mb4 kokomi < springboot/sql_tier_permission.sql
mysql -uroot -p --default-character-set=utf8mb4 kokomi < springboot/sql_fix_primary_role.sql
```

两个必须带：
- `--default-character-set=utf8mb4` —— Windows 下 mysql 客户端默认按 GBK 连，脚本里的中文会**静默变乱码**（不报错，只是数据错了）。
- 脚本首行的 `SET NAMES utf8mb4` 已经在文件里，别删。

### 1.3 跑完自己看一眼（期望输出）

`sql_tier_permission.sql` 末尾自带三段查询，正常长这样：

```
--- 权限矩阵 ---
admin      comment:create,comment:report,post:create,post:delete,post:edit,topic:create,user:block,user:manage
editor     comment:create,post:create,post:edit
member     comment:create,comment:report,post:create
moderator  comment:create,comment:report,post:create,post:delete,post:edit,user:block
vip        comment:create,comment:report,post:create

--- 能发帖的角色 ---   admin,editor,member,moderator,vip
--- 能评论的角色 ---   admin,editor,member,moderator,vip
```

`guest` **不在**上面任何一行里，这就是对的（游客一个权限都没有）。

再手工确认两件事：

```sql
-- 1. 列加上了、老用户回填了（应该是 0 个未验证）
SELECT COUNT(*) AS unverified FROM `user` WHERE `email_verified` = 0;

-- 2. 游客角色确实没挂任何权限（应该是 0 行）
SELECT * FROM `role_permission` WHERE BINARY `role_code` = 'guest';
```

`sql_fix_primary_role.sql` 末尾自带复验，期望输出：

```
guest角色但显示非guest
0
role        n
member      3
moderator   1
vip         1
guest       N     ← 刚注册的游客
```

第一条必须是 0。第二条是各角色的分布，扫一眼确认没有意外的 `NULL`。

### 1.4 会踩的坑

- 脚本跑到一半停了、又没报错？多半是 `Illegal mix of collations`——
  `user.primary_role`(general_ci) 和 `user_role.role_code`(0900_ai_ci) 排序规则不通，
  列对列比较会**中止整份脚本**，终端看着像跑完了。脚本里已经全部写成 `BINARY a = BINARY b`，
  你要是自己加语句，照这个写。
- **在 jar 启动之后才跑权限类 SQL，必须重启服务**——权限矩阵有内存缓存（`PermissionCache`），
  不重启不生效。
- **只跑了 `sql_tier_permission.sql`，漏了 `sql_email_verify.sql`**：这就是「后台用户管理整页
  服务器繁忙、其它页面都正常」的头号原因，因为新 jar 的用户列表 SQL 写死了
  `email_verified` 列。加列本身是 DDL，补跑后**立刻生效、不用重启**。详见 [§5.1](#51-报服务器繁忙怎么查)。
- 两个脚本**互相不依赖**，但都要跑：`sql_email_verify.sql` 管 `user` 表加列，
  `sql_tier_permission.sql` 管权限矩阵和 `guest` 角色。少跑任何一个症状都不一样。

---

## 2. 后端（换 jar）

### 2.1 新增的文件

| 文件 | 作用 |
|---|---|
| `service/PermissionService.java` | 统一入口 `has(userId, permCode)`：先查 `PermissionCache`，未命中回表并回填。三个 Service 共用，不再各写一份 |
| `service/UserVerifyService.java` + `impl/UserVerifyServiceImpl.java` | 绑定邮箱：发码 / 校码 / `promoteIfGuest`（绑完自动升普通用户） |
| `service/MailService.java` + `impl/MailServiceImpl.java` | 发信（QQ SMTP，465 + SSL） |
| `util/EmailCodeCache.java` | 验证码缓存 + 三层限流（10 分钟有效 / 60s 重发 / 同邮箱 5 封每时 / 全站 8 次每分 60 次每时） |
| `util/RegisterRateLimit.java` | 注册限流（同 IP 20 个每小时、全站 100 个每小时） |
| `util/IpUtils.java` | 取真实 IP，优先 `X-Forwarded-For`（线上走 nginx，`getRemoteAddr()` 只会拿到 127.0.0.1） |
| `dto/VerifySendDTO.java`、`dto/VerifyCodeDTO.java` | `{email}` / `{email, code}` |
| `vo/VerifySendVO.java` | 返回打码后的邮箱 + `sent` + （本地才有）`devCode` |

### 2.2 改了的文件

| 文件 | 改了什么 |
|---|---|
| `pom.xml` | 加 `spring-boot-starter-mail` |
| `application.yaml` | 加 `spring.mail.*`（host/port/username/password/三个超时）和 `app.mail.from-name` / `dev-echo` |
| `common/ResultCode.java` | 新增 `EMAIL_UNVERIFIED=507`、`VERIFY_CODE_ERROR=508`、`NEED_VIP=509` |
| `entity/User.java` | 加 `emailVerified` 字段 |
| `bo/UserBO.java`、`vo/UserVO.java`、`vo/AdminUserVO.java` | 透出 `emailVerified`（`UserVO` 里 **null 当已验证**，防「忘了跑迁移」把老用户锁死，别改成 false） |
| `mapper/UserMapper.java` | 加 `bindEmail(userId, email)`：一条 UPDATE 同时写 `email` + `email_verified=1` |
| `controller/UserController.java` | 加 `POST /user/verify/send`、`POST /user/verify/confirm` |
| `controller/AdminUserController.java` | 加 `POST /admin/user/{id}/verify`（管理端手动激活兜底） |
| `service/impl/UserServiceImpl.java` | 注册：只收**用户名 + 密码**（2~20 位，中文/字母/数字/下划线），默认角色 `guest`，不再写 email，注册接口**不发信** |
| `service/impl/PostServiceImpl.java` | 发帖 / 改自己的帖前过 `checkCanPost`：没 `post:create` 时，游客回 507、只读角色回 509 |
| `service/impl/CommentServiceImpl.java` | 评论前判 `comment:create`，游客回 507 |
| `service/impl/ReportServiceImpl.java` | 举报前判 `comment:create`，游客回 507 |
| `service/impl/AdminUserServiceImpl.java` | 用户列表带 `emailVerified`；`updateRoles` 改角色后 `PermissionCache.remove(userId)` |

### 2.3 打包

```bash
cd springboot/kokomi
mvn -B clean package -DskipTests
# 产物：target/kokomi-0.0.1-SNAPSHOT.jar（约 33.8 MB，明显变小说明打坏了）
```

⚠️ 打包前先 `systemctl stop kokomi`（Windows 上还要 `taskkill` 掉在跑的 `java.exe`），
否则文件锁会产出约 192KB 的坏 jar。
⚠️ 别信 `mvn compile` 的 SUCCESS —— IDE 可能在 `target/classes` 留下
`Unresolved compilation problem` 的存根，一律 `clean package`。

### 2.1 换包后必须重启，并用一条命令确认新 jar 真的起来了

**只覆盖 jar 不 restart = 还是旧代码**（`systemctl restart` 才会重新加载）。
更坑的是：**前端已经换新了，后端还是旧 jar**，用户点「发送邮箱验证码」会看到
**「系统繁忙 / 服务器繁忙」** —— 那是 `GlobalExceptionHandler` 的兜底文案，
真实原因多半是「新前端调了旧 jar 里不存在的接口/字段」，堆栈只写进 journalctl。

换完包在服务器上跑这三条，30 秒判断新旧：

```bash
systemctl stop kokomi && cp kokomi-0.0.1-SNAPSHOT.jar /kokomi/server/ && systemctl start kokomi
systemctl is-active kokomi                      # 要 active
curl -s -X POST localhost:8080/user/register/verify-email -H 'Content-Type: application/json' -d '{}'
# 新 jar → {"code":400,"msg":"code: 请输入验证码"}  旧 jar → 404 / 405
curl -s -X POST localhost:8080/user/register/email-code -H 'Content-Type: application/json' -d '{"email":"not-an-email"}'
# 两个版本都回 400「请输入正确的邮箱」，但**它证明接口通到业务层**（不会发信：格式错在发信之前 return）
```

---

## 3. 前端（换包）

前端的改动 **全部在源码里**，你只需要用打好的 `dist` 包覆盖站点目录，不用改任何服务器配置。

### 3.1 新增

| 文件 | 作用 |
|---|---|
| `components/modules/VerifyEmailModal.vue` | 「绑定邮箱」弹窗：没邮箱时先填邮箱 → 发码 → 填码 |
| `components/icons/IconCrown.vue` | 金色提示卡上的王冠图标 |
| `components/icons/IconMail.vue` | 蓝色提示卡上的信封图标 |

### 3.2 改了

| 文件 | 改了什么 |
|---|---|
| `stores/user.js` | 收敛出 `canPost` / `canComment` / `needsBindEmail` / `emailVerified`，全部按**权限码**算；`guest` 的中文名改「游客」 |
| `stores/ui.js` | 加 `openVerifyModal` / `closeVerifyModal` |
| `utils/request.js` | 507 → 广播 `kokomi:unverified`（弹绑定框）；509 → 只 toast 一句，不弹窗 |
| `App.vue` | 监听 `kokomi:unverified` 打开弹窗；登录后第一次发现是游客提示一句 |
| `api/user.js` | `sendVerifyCode(email)` / `confirmVerifyCode(code, email)` |
| `api/admin.js` | 管理端手动激活 |
| `components/modules/LoginModal.vue` | 注册表单回到「用户名 + 密码」，文案改成「绑个邮箱就能评论、发帖」 |
| `components/posts/PostComment.vue` | 游客看到「绑定邮箱后就能评论了」的提示条，点击弹绑定框 |
| `views/space/Home.vue` | 发布区三档：禁言卡 → 待绑邮箱卡（蓝，带「去绑定」）→ 待开通发帖权卡（金，无按钮）；都没有才是发布框 |
| `views/admin/Users.vue` | 用户行加「未验证」标签 + 「激活」按钮 |
| `config/setting.js` | 加 `needVipCode: 509`；`unverifiedCode` 注释改成「游客 / 没绑邮箱」 |
| `components.d.ts` | 新图标注册 |

### 3.3 换包

```bash
# 站点目录一般是 /kokomi/web 或 nginx root，按你实际的来
unzip -o dist_1027_reg2step.zip -d /path/to/site/
```

⚠️ 换完一定让用户 **Ctrl+Shift+R**，并顺手比对一下 hash 对不对：

```bash
curl -s https://kokomi.net.cn/ | grep -o 'assets/index-[^"]*\.js'
# 包里的应该是 assets/index-l_peF5fu.js；不一致 = 还在用缓存
```

---

## 4. 部署顺序（照抄）

```bash
# 1) SQL 先跑（脚本自带复验查询，看输出对不对）
mysql -uroot -p --default-character-set=utf8mb4 kokomi < springboot/sql_email_verify.sql
mysql -uroot -p --default-character-set=utf8mb4 kokomi < springboot/sql_tier_permission.sql
mysql -uroot -p --default-character-set=utf8mb4 kokomi < springboot/sql_fix_primary_role.sql

# 2) 配发信环境变量（一次性）
sudo vi /etc/systemd/system/kokomi.service.d/override.conf
#   Environment="MAIL_USERNAME=xxxx@qq.com"
#   Environment="MAIL_PASSWORD=<QQ 邮箱授权码，不是登录密码>"
sudo systemctl daemon-reload

# 3) 换 jar —— 必须 stop → 覆盖 → start，只 restart 等于没更新
sudo systemctl stop kokomi
sudo cp target/kokomi-0.0.1-SNAPSHOT.jar /kokomi/server/
sudo systemctl start kokomi
sudo systemctl status kokomi

# 4) 换前端包
unzip -o dist_1027_reg2step.zip -d /path/to/site/

# 5) 看日志有没有起错
sudo journalctl -u kokomi -n 60 --no-pager
```

⚠️ **顺序不能反**：先换 jar 再跑 SQL 的话，中间那段时间后端会按旧矩阵判权限
（旧库里 `member` 挂着 `post:create`，游客角色也不存在），用户会看到「能发帖」但点发送报错。

---

## 5. 上线后自检（5 分钟走一遍）

1. **注册一个测试账号** → 空间页应该出现蓝色「绑定邮箱后就能评论」卡，**没有发布框**。
2. 点「去绑定」→ 填自己的邮箱 → 收 6 位码 → 提交。
   - 收到邮件 = SMTP 通了；收不到就看 `journalctl` 有没有 `MailException`。
3. 绑完立刻应该看到**发布框**，身份标签是「普通用户」，蓝色卡消失。
4. 发一条帖 + 评论一句，都能成功 = 普通用户这条线通了。
5. 后台「用户管理」里，刚注册的账号在绑定前应该有「未验证」标签和「激活」按钮。

`MAIL_PASSWORD` 填错时症状很典型：接口回「验证码发送失败，请稍后重试」，
日志里是 `535 Authentication failed`。QQ 邮箱的密码位置要填**授权码**（邮箱设置 → 账户 → 开启 SMTP 后生成）。

### 5.1 报「服务器繁忙」怎么查

「服务器繁忙」= `GlobalExceptionHandler` 的最后兜底分支，**不代表服务器真的忙**，
只代表后端抛了一个它没专门接的异常。注意 `BadSqlGrammarException`（列不存在、语法错）
属于 `RuntimeException`，**不会**被那个 `SQLException` 分支接住，所以永远显示「服务器繁忙」
而不是「数据库操作失败」—— 这点最容易误导人。

**最典型的一种：后台「用户管理」整页进不去，但其它页面（首页、帖子、后台概览）都正常。**

原因：`user` 表缺 `email_verified` 列。后台用户列表的 SQL 是**写死列名**的
（`select id, username, ..., email_verified from user`），少一列整条语句就报
`Unknown column 'email_verified' in 'field list'`。
为什么别的页面没事：登录、看帖走的是 `select *`，少一列只是字段映射不到，不报错；
只有「用户列表」和「绑定邮箱」这两个查询是写死列的。

自查一条命令（空结果 = 没跑脚本）：

```sql
SHOW COLUMNS FROM `user` LIKE 'email_verified';
```

修复：补跑 `sql_email_verify.sql`。**加列是 DDL，立刻生效，不用停服、不用重启 jar。**

症状对照表，省得每次猜：

| 症状 | 缺的东西 | 补跑 |
|---|---|---|
| 后台「用户管理」整页服务器繁忙，其它页面正常 | `user.email_verified` 列 | `sql_email_verify.sql` |
| 后台「角色权限」页打不开 / 角色名显示成英文 code | `role` 的 `role_name` 等展示字段 | `sql_role_manage.sql` |
| 发帖、评论一律服务器繁忙 | `comment:create` 权限码 / `guest` 角色 | `sql_tier_permission.sql` |
| 全站接口都 500 | 换了 jar 但一个 SQL 都没跑 | 按 §1 顺序全部补 |

想看真实错误（兜底异常的真实堆栈只在日志里）：

```bash
journalctl -u kokomi -n 120 --no-pager | grep -A8 -i "exception"
```

---

## 6. 回滚

- **前端**：把上一版 `dist` 包解压回去即可（老的 `dist_*.zip` 建议每版留一个，方便回滚）。
- **后端**：把上一版 jar 覆盖回去 + `stop/start`。
- **数据库**：两个脚本只做「加列 / 加行 / 回填」，没有删表删数据，老代码跑在新库上不会报错
  （老代码不读 `email_verified`，也不看 `comment:create`）。**不需要回滚 SQL**。
  唯一要留意的是：新库把 `member` 的 `post:create` 补上了，老代码本来就只判登录，
  所以发帖行为和以前一致。

---

## 7. 存量账号会怎样

**无感知。**

- 老用户的 `email_verified` 被回填成 1，不算「待绑定」；
- 老用户的角色还是 `member`，而 `member` 现在同时有 `comment:create` 和 `post:create`，
  所以发帖、评论、举报和升级前一模一样；
- 只有**新注册**的账号才会落到 `guest`，需要绑一次邮箱才能评论和发帖。

唯一的变化是：老用户如果被管理员降成 `guest`，会立刻失去评论和发帖能力，且会看到蓝色绑定卡
（他绑一下邮箱就又变回 `member`，这是 `promoteIfGuest` 的设计——只有角色**全部**是 guest 才升级）。

---

## 8. 以后想改规则怎么改

不用改代码、不用发版，后台「角色权限」页勾一下就行（改完记得让人刷新页面）：

| 想要的效果 | 怎么做 |
|---|---|
| 游客也能评论 | 给 `guest` 挂 `comment:create` |
| 普通用户不能发帖 | 把 `member` 的 `post:create` 取消勾选 |
| 新加一个「只能看不能动」的角色 | 后台新建角色，什么权限都不勾，给某人挂上 |
| 全部角色都能发帖 | 给每个角色勾 `post:create` |

⚠️ 改完权限矩阵，后端要 `PermissionCache.clear()` —— 后台的保存接口已经做了，别绕过它直接改库。
