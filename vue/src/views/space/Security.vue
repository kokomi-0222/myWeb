<template>
  <div class="security-page">
    <div class="sec-card">
      <!-- ---------- 登录密码 ---------- -->
      <section class="sec-row">
        <div class="sec-row__main">
          <div class="sec-row__title">登录密码</div>
          <p class="sec-row__desc">
            用于登录本账号。建议定期更换，别和其他网站用同一个。
          </p>
        </div>
        <button type="button" class="sec-btn" @click="pwdOpen = true">修改密码</button>
      </section>

      <!-- ---------- 邮箱 ---------- -->
      <!--
        邮箱：全站唯一的绑定 / 解绑入口。
        发布框和评论区的「去绑定」都跳到这里（/space/security?bind=1），
        行内是「标题 / 邮箱地址（带待验证小标）/ 说明」加右侧动作按钮，具体操作走弹窗（见 EmailBindPanel）。
      -->
      <section class="sec-row sec-row--email">
        <div class="sec-row__main">
          <div class="sec-row__title">邮箱</div>
          <!-- 邮箱地址紧接在标题下面：它是这一行的「值」，说明文字退到它后面 -->
          <div class="email-value">
            <span v-if="boundEmail" class="email-text">{{ boundEmail }}</span>
            <span v-else class="email-text email-text--empty">未绑定</span>
            <span v-if="boundEmail && !emailVerified" class="email-badge">待验证</span>
          </div>
          <p class="sec-row__desc">
            用于找回密码、接收站内通知。解绑后，这个邮箱不能再用来登录或找回密码。
          </p>
        </div>
        <!--
          动作按钮和上面「修改密码」「注销账号」同款（.sec-btn），只是多了红色描边的解绑。
          三个按钮都不再是胶囊小标 —— 同一页里两种按钮形状会让人猜哪个更「重」。
        -->
        <div class="sec-actions">
          <template v-if="boundEmail">
            <button
              v-if="!emailVerified"
              type="button"
              class="sec-btn"
              @click="openBind('bind')"
            >
              去验证
            </button>
            <template v-else>
              <button type="button" class="sec-btn" @click="openBind('change')">
                更换
              </button>
              <button
                type="button"
                class="sec-btn sec-btn--danger"
                @click="openBind('unbind')"
              >
                解绑
              </button>
            </template>
          </template>
          <button v-else type="button" class="sec-btn" @click="openBind('bind')">
            去绑定
          </button>
        </div>
      </section>

      <!-- ---------- 注销 ---------- -->
      <!-- 和上面两段用红色标题 + 红色描边按钮区分：这一条点了不能撤销 -->
      <section class="sec-row sec-row--danger">
        <div class="sec-row__main">
          <div class="sec-row__title">注销账号</div>
          <p class="sec-row__desc">
            清空昵称、头像、邮箱等资料并永久关闭账号，无法恢复。你发过的帖子会保留，作者显示为「已注销用户」。
          </p>
          <p v-if="isManager" class="sec-row__note">
            管理员账号不能自助注销 —— 否则站点可能失去全部管理入口。
          </p>
        </div>
        <button
          type="button"
          class="sec-btn sec-btn--danger"
          :disabled="isManager"
          @click="deactivateOpen = true"
        >
          注销账号
        </button>
      </section>
    </div>

    <!-- 三个弹窗都是 Teleport 到 body，DOM 位置不影响渲染 -->
    <PasswordPanel v-if="pwdOpen" @done="pwdOpen = false" @cancel="pwdOpen = false" />
    <EmailBindPanel
      v-if="bindOpen"
      :active="bindOpen"
      :mode="bindMode"
      @done="bindOpen = false"
      @cancel="bindOpen = false"
    />
    <DeactivatePanel
      v-if="deactivateOpen"
      @done="handleDeactivated"
      @cancel="deactivateOpen = false"
    />
  </div>
</template>

<script setup>
/**
 * 账号安全：密码、邮箱、注销集中在一处。
 *
 * 为什么从「账号管理」搬出来 —— 那一页是资料编辑（头像、昵称、签名），
 * 保存键一按就是普通表单；而这里三件事都会改动登录凭据或删除账号，
 * 混在一起时用户很容易顺手点掉。分成独立入口后，每个动作都带自己的确认弹窗。
 *
 * 三个动作的共同点：都要再验一次当前密码（密码修改、换绑 / 解绑、注销），
 * token 只能证明「这台设备登录过」，不能证明坐在屏幕前的是本人。
 */
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUserStore } from "@/stores/user";
import { message } from "@/utils/message";
import { usePermission } from "@/utils/usePermission";
import PasswordPanel from "@/components/modules/PasswordPanel.vue";
import EmailBindPanel from "@/components/modules/EmailBindPanel.vue";
import DeactivatePanel from "@/components/modules/DeactivatePanel.vue";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const { hasPermission } = usePermission();

const pwdOpen = ref(false);
const bindOpen = ref(false);
const bindMode = ref("bind");
const deactivateOpen = ref(false);

const boundEmail = computed(() => userStore.user?.email || "");
/** 后端没给这个字段的老接口一律当已验证，避免已绑定的人被要求再验一次 */
const emailVerified = computed(() => userStore.user?.emailVerified !== false);

/** 管理员不给自助注销的入口：后端也会拒，这里先把按钮禁掉，免得白填一遍密码 */
const isManager = computed(() => hasPermission("user:manage"));

const openBind = (mode = "bind") => {
  bindMode.value = mode;
  bindOpen.value = true;
};

/**
 * 注销成功：立刻清本地登录态并回首页。
 * 不清 token 的话，下一个请求带着已作废的 token 会被 401 弹一次登录框，
 * 用户刚注销完又被要求登录，看起来像没成功。
 */
const handleDeactivated = async () => {
  deactivateOpen.value = false;
  await userStore.logout();
  message.success("账号已注销，感谢你来过");
  router.push("/");
};

/** 发布框 / 评论区点「去绑定」时广播的事件（已在本页时路由不变，靠它展开面板） */
function openBindFromEvent() {
  if (emailVerified.value && boundEmail.value) {
    message.info("这个账号已经绑好邮箱了");
    return;
  }
  openBind("bind");
}

onMounted(async () => {
  // 直接刷新本页时 store 可能是空的，先从后端补一次，否则邮箱行显示「未绑定」
  if (!userStore.user) {
    await userStore.refreshUser?.();
  }
  // 从发布框 / 评论区的「去绑定」跳过来会带 ?bind=1，直接弹出绑定弹窗
  if (route.query.bind === "1") {
    if (emailVerified.value && boundEmail.value) {
      message.info("这个账号已经绑好邮箱了");
    } else {
      openBind("bind");
    }
  }
  window.addEventListener("kokomi:open-bind", openBindFromEvent);
});

onUnmounted(() => {
  window.removeEventListener("kokomi:open-bind", openBindFromEvent);
});
</script>

<style scoped>
.security-page {
  padding: 0;
  max-width: 700px;
  margin: 0 auto;
}

.sec-card {
  padding: 4px 24px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

/* 一行一个设置项：左边说明，右边动作。三段之间只用一条细线分隔，
   不分三张卡 —— 分卡会让人以为是三个独立页面，其实是同一件事的三个面。
   顶部对齐（不是居中）：说明可能两三行，按钮跟着标题走才不会上下漂 */
.sec-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 0;
}

.sec-row + .sec-row {
  border-top: 1px solid var(--border-color);
}

.sec-row__main {
  min-width: 0;
  flex: 1 1 auto;
}

.sec-row__title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.sec-row__desc {
  margin: 4px 0 0;
  font-size: 0.78rem;
  line-height: 1.65;
  color: var(--text-secondary);
}

.sec-row__note {
  margin: 6px 0 0;
  font-size: 0.75rem;
  line-height: 1.6;
  color: #ef4444;
}

/* 注销那一段的标题用警示色，但按钮保持描边不实心：
   先劝退一次，真要注销的人自然会点 */
.sec-row--danger .sec-row__title {
  color: #ef4444;
}

.sec-btn {
  flex: none;
  /* 顶部对齐后按钮比标题高一点，往上提 2px 让两者看起来在同一条线上 */
  margin-top: -2px;
  height: 32px;
  padding: 0 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--primary-color);
  font-family: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}

.sec-btn:hover:not(:disabled) {
  border-color: var(--primary-color);
}

.sec-btn--danger {
  border-color: rgba(239, 68, 68, 0.5);
  color: #ef4444;
}

.sec-btn--danger:hover:not(:disabled) {
  border-color: #ef4444;
}

.sec-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ---- 邮箱行 ---- */
/* 邮箱地址跟在标题下面，和标题保持一点呼吸，但不另起一段（说明文字在它之后）。
   地址太长时靠 word-break 在容器内折行，不会顶到右侧按钮 */
.email-value {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.email-text {
  font-size: 0.875rem;
  color: var(--text-primary);
  line-height: 1.5;
  word-break: break-all;
}

.email-text--empty {
  color: var(--text-secondary);
}

/* 「待验证」小标：和后台的胶囊标签同一个形状，不用另造一套 */
.email-badge {
  flex: none;
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--bg-nomarl);
  color: var(--text-secondary);
  font-size: 0.7rem;
  line-height: 18px;
}

/* 右侧动作组：更换 / 解绑（或去绑定）并排。
   按钮本身是 .sec-btn，这里只负责横向排列 —— 纵向的 -2px 上移由 .sec-btn 自带 */
.sec-actions {
  flex: none;
  display: flex;
  gap: 8px;
}

/* 手机上左右排会挤成一团：说明在上、邮箱行和按钮各自占满一行 */
@media (max-width: 768px) {
  .sec-card {
    padding: 4px 16px;
  }

  .sec-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 16px 0;
  }

  /* 按钮不单独占一行：改成跟着内容走、整组靠右下。
     邮箱这种两个按钮的，就两个并排贴在右下角（宽度按文字，不拉伸） */
  .sec-actions {
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .sec-actions .sec-btn {
    flex: none;
    width: auto;
  }

  .sec-row > .sec-btn {
    align-self: flex-end;
    width: auto;
  }

  .sec-btn {
    margin-top: 0;
  }
}
</style>
