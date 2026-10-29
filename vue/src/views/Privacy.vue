<template>
  <div class="privacy-page">
    <header class="privacy-bar">
      <RouterLink class="privacy-bar__brand" to="/">{{ site.name }}</RouterLink>
      <RouterLink class="privacy-bar__back" to="/">返回首页</RouterLink>
    </header>

    <article class="privacy-card">
      <h1 class="privacy-title">隐私政策</h1>
      <p class="privacy-meta">
        生效日期：2026 年 10 月 28 日 · 最后更新：{{ site.privacyUpdated }}
      </p>

      <p class="privacy-lead">
        {{ site.name }}（{{ site.icp }}，以下简称「本站」）由个人开发者运营。
        我们只收集为了让这个社区正常运转所必需的信息，不会出售、出租你的个人信息，
        也不会用它做广告投放。下面逐项说明我们收集什么、怎么用、谁能看到、你能怎么处理。
      </p>

      <section class="privacy-sec">
        <h2>一、我们收集哪些信息</h2>

        <h3>1. 你主动提供的</h3>
        <ul>
          <li>
            <b>邮箱地址</b>：注册时用于接收验证码、确认邮箱归属；之后用于找回密码、
            绑定与更换邮箱。邮箱是本站唯一用于身份验证的联系方式。
          </li>
          <li>
            <b>密码</b>：只以单向哈希的形式存储，我们无法还原你的明文密码，
            日志里也不会出现密码。
          </li>
          <li>
            <b>个人资料（均为选填）</b>：昵称、头像、个性签名、生日、性别。
            这些内容会公开展示在你的个人主页和帖子旁，请勿填写你不想被别人看到的信息。
          </li>
          <li>
            <b>你发布的内容</b>：帖子、评论、图片，以及与之相关的点赞、收藏、浏览记录。
          </li>
        </ul>

        <h3>2. 你在使用中产生的</h3>
        <ul>
          <li>登录状态凭证（一个有时效的 token），保存在你浏览器里，用于免登录。</li>
          <li>举报记录与处理结果：你举报他人、或你被举报时产生的记录，用于社区治理和申诉。</li>
          <li>账号状态：正常 / 禁言 / 封号，以及对应的原因与到期时间。</li>
        </ul>

        <h3>3. 服务器自动记录的</h3>
        <ul>
          <li>
            <b>访问日志</b>：IP 地址、浏览器类型（User-Agent）、访问时间与请求路径，
            用于排查故障、防刷限流和安全审计。
          </li>
          <li>
            为防刷和防滥用，发送验证码会按邮箱地址和来源做频率限制，
            限制状态在服务端内存中短暂保留，不写入数据库。
          </li>
        </ul>
      </section>

      <section class="privacy-sec">
        <h2>二、我们怎么使用这些信息</h2>
        <ul>
          <li>创建并维护你的账号，验证「这个邮箱是你的」。</li>
          <li>在你忘记密码时，通过邮箱帮你重置。</li>
          <li>展示你的帖子、评论和个人主页。</li>
          <li>按账号角色（游客 / 普通用户 / 会员 / 管理员）判断你能做什么。</li>
          <li>处理举报、执行禁言或封号，并保留可追溯的处理记录。</li>
          <li>发现异常请求时做限流、封禁 IP 等安全处置。</li>
        </ul>
        <p class="privacy-note">
          我们<b>不会</b>把你的信息用于：广告定向投放、出售或交换给第三方、
          与本站服务无关的用途。
        </p>
      </section>

      <section class="privacy-sec">
        <h2>三、谁会接触到这些信息</h2>
        <ul>
          <li>
            <b>阿里云（Alibaba Cloud）</b>：本站的服务器与数据库运行在阿里云服务器，
            数据存储于其位于中国大陆的机房；邮件验证码通过「阿里云邮件推送」
            发送，因此你的<b>邮箱地址和验证码内容</b>会经过该服务。除此之外不会向它提供
            你的其他资料。
          </li>
          <li>
            <b>Google Fonts</b>：页面标题使用了两套在线字体，浏览器会直接向 Google 请求字体文件。
            这个请求会暴露你的 IP 与浏览器信息（与其他网站加载外部资源同理）。
            若你不想产生这次请求，可通过浏览器插件屏蔽 fonts.googleapis.com —— 页面会退回系统字体，
            功能不受影响。
          </li>
          <li>
            <b>站内管理员</b>：能看到你的用户名、昵称、邮箱、角色、账号状态与举报记录，
            用于日常管理。管理员看不到你的密码。
          </li>
          <li>
            <b>其他访客</b>：只能看到你选择公开的内容（帖子、评论、昵称、头像、签名）。
            你的邮箱、密码、登录凭证<b>不会</b>展示给任何人。
          </li>
          <li>
            除上述情况外，除非得到你的同意或法律法规另有要求，我们不会向任何第三方提供你的个人信息。
          </li>
        </ul>
      </section>

      <section class="privacy-sec">
        <h2>四、Cookie 与本地存储</h2>
        <p>
          本站<b>不使用</b>第三方统计或广告 Cookie。浏览器里只保存两类本地数据：
        </p>
        <ul>
          <li><code>token</code>：登录凭证，退出登录即清除。</li>
          <li><code>kokomi-theme</code>：你选择的浅色 / 深色主题，只是一串偏好记录。</li>
        </ul>
        <p>清空浏览器数据即可删除它们，代价是需要重新登录。</p>
      </section>

      <section class="privacy-sec">
        <h2>五、我们如何保护这些信息</h2>
        <ul>
          <li>全站通过 HTTPS 传输，密码等敏感字段在传输前还会额外做一次加密。</li>
          <li>密码使用 加盐哈希，单向不可逆。</li>
          <li>数据库不对公网开放，仅服务器本机可访问。</li>
          <li>退出登录、修改密码、绑定与解绑邮箱时，旧设备的登录凭证会立即失效。</li>
          <li>发生安全事件时，我们会通过站内公告告知受影响的用户。</li>
        </ul>
        <p class="privacy-note">
          需要提醒的是：没有任何系统能保证绝对安全。请为本站设置与其他网站不同的密码，
          并妥善保管你的邮箱。
        </p>
      </section>

      <section class="privacy-sec">
        <h2>六、保存多久</h2>
        <ul>
          <li>账号信息在你使用本站期间持续保存。</li>
          <li>
            注销账号后，邮箱、密码、头像、签名等可识别你身份的信息会被清除或匿名化；
            你公开发布过的帖子与评论会以「已注销用户」的形式保留，以维持讨论的完整性。
          </li>
          <li>访问日志保留 90 天，到期滚动清理。</li>
          <li>法律法规要求留存的记录，按法定期限保存。</li>
        </ul>
      </section>

      <section class="privacy-sec">
        <h2>七、你的权利</h2>
        <ul>
          <li>
            <b>查询与更正</b>：登录后进入「个人中心 → 账户信息」，
            可以随时修改昵称、头像、签名、生日、性别，也可以更换或解绑邮箱。
          </li>
          <li>
            <b>删除内容</b>：你自己发布的帖子和评论可以随时删除。
          </li>
          <li>
            <b>撤回同意</b>：解绑邮箱后，我们不再通过该邮箱联系你；但这会导致你无法用邮箱找回密码，
            也不能再用它登录。
          </li>
          <li>
            <b>复制与导出</b>：来信索取一份你在本站的个人信息副本，我们会在核实身份后提供。
          </li>
          <li>
            <b>注销账号</b>：登录后进入「个人中心 → 账号安全」，在页面底部的「注销账号」处点一下，
            输入登录密码确认即可，<b>立即生效</b>，不需要提交申请、也不用等待审核。
            注销后该账号无法登录，邮箱、昵称、头像、签名等资料会被清空，
            用户名和邮箱随之释放（可以用同一个邮箱重新注册一个全新账号）。
            <br />
            如果你已经无法登录、需要协助处理，仍可以发信到
            <a :href="`mailto:${site.contactEmail}`">{{ site.contactEmail }}</a>，
            我们会在 7 个工作日内回复。
          </li>
        </ul>
      </section>

      <section class="privacy-sec">
        <h2>八、未成年人</h2>
        <p>
          本站不面向儿童。未满 14 周岁的未成年人不应注册账号；14 至 18 周岁的未成年人
          应在监护人指导下使用本站，并由监护人代为阅读同意本政策。
          若我们发现存在未经监护人同意收集的儿童个人信息，会尽快删除。
        </p>
      </section>

      <section class="privacy-sec">
        <h2>九、政策的更新</h2>
        <p>
          本政策如有修改，会在本页面更新并同步修改顶部的「最后更新」日期；
          涉及你权利的重大变更，会同时在站内公告中说明。
          变更后继续使用本站，即视为你接受更新后的政策。
        </p>
      </section>

      <section class="privacy-sec">
        <h2>十、联系我们</h2>
        <p>
          对本政策有任何疑问、意见或投诉，或需要行使上述权利，请联系：
        </p>
        <ul>
          <li>
            邮箱：<a :href="`mailto:${site.contactEmail}`">{{ site.contactEmail }}</a>
            （一般 3 个工作日内回复）
          </li>
          <li>
            备案信息：<a :href="site.icpUrl" target="_blank" rel="noopener">{{ site.icp }}</a>
            （主办单位：个人开发者）
          </li>
        </ul>
      </section>

      <footer class="privacy-foot">
        <span>© {{ year }} {{ site.name }}</span>
        <span class="privacy-foot__dot">·</span>
        <a :href="site.icpUrl" target="_blank" rel="noopener">{{ site.icp }}</a>
        <span class="privacy-foot__dot">·</span>
        <RouterLink to="/">回到首页</RouterLink>
      </footer>
    </article>
  </div>
</template>

<script setup>
import site from "@/config/site";

const year = new Date().getFullYear();
</script>

<style scoped>
.privacy-page {
  min-height: 100vh;
  background: var(--bg-nomarl);
  padding-bottom: 56px;
}

.privacy-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 780px;
  margin: 0 auto;
  padding: 20px 24px 12px;
}

.privacy-bar__brand {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  text-decoration: none;
}

.privacy-bar__back {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  text-decoration: none;
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 13px;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.privacy-bar__back:hover {
  color: var(--primary-color);
  border-color: var(--primary-color);
}

.privacy-card {
  max-width: 780px;
  margin: 0 auto;
  padding: 40px 44px 32px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  color: var(--text-primary);
}

.privacy-title {
  margin: 0 0 10px;
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.privacy-meta {
  margin: 0 0 22px;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.privacy-lead {
  margin: 0 0 8px;
  padding: 14px 16px;
  font-size: 0.875rem;
  line-height: 1.9;
  color: var(--text-primary);
  background: var(--bg-secondary);
  border-radius: 10px;
}

.privacy-sec {
  margin-top: 30px;
}

.privacy-sec h2 {
  margin: 0 0 12px;
  font-size: 1.0625rem;
  font-weight: 600;
  padding-left: 10px;
  border-left: 3px solid var(--primary-color);
  line-height: 1.4;
}

.privacy-sec h3 {
  margin: 18px 0 8px;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
}

.privacy-sec ul {
  margin: 0;
  padding-left: 20px;
}

.privacy-sec li {
  margin-bottom: 8px;
  font-size: 0.875rem;
  line-height: 1.95;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.privacy-sec li b {
  color: var(--text-primary);
  font-weight: 600;
}

.privacy-sec p {
  margin: 0 0 8px;
  font-size: 0.875rem;
  line-height: 1.95;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.privacy-sec a {
  color: var(--primary-color);
  text-decoration: none;
  overflow-wrap: anywhere;
}

.privacy-sec a:hover {
  text-decoration: underline;
}

.privacy-note {
  margin-top: 10px !important;
  padding: 12px 14px;
  background: var(--bg-secondary);
  border-radius: 10px;
}

.privacy-sec code {
  padding: 1px 6px;
  font-size: 0.8125rem;
  background: var(--bg-secondary);
  border-radius: 4px;
}

.privacy-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 36px;
  padding-top: 20px;
  border-top: 1px solid var(--border-color);
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.privacy-foot a {
  color: var(--text-secondary);
  text-decoration: none;
}

.privacy-foot a:hover {
  color: var(--primary-color);
}

.privacy-foot__dot {
  opacity: 0.5;
}

@media (max-width: 768px) {
  .privacy-page {
    padding-bottom: 32px;
  }

  .privacy-bar {
    padding: 14px 14px 10px;
  }

  .privacy-card {
    margin: 0 12px;
    padding: 24px 18px 20px;
    border-radius: 14px;
  }

  .privacy-title {
    font-size: 1.35rem;
  }

  .privacy-lead {
    padding: 12px 12px;
    font-size: 0.8125rem;
  }

  .privacy-sec {
    margin-top: 24px;
  }

  .privacy-sec li,
  .privacy-sec p {
    font-size: 0.8125rem;
    line-height: 1.9;
  }
}
</style>
