<template>
  <Teleport to="body">
    <!-- 点蒙层**不关闭**（同登录弹窗）：填到一半的邮箱/密码一抖手就全丢了。
         要关只能点右上角 × 或底部「取消」。 -->
    <div class="bind-overlay">
      <div class="bind-dialog" role="dialog" aria-modal="true" :aria-label="dialogTitle">
        <button type="button" class="bind-close" aria-label="关闭" @click="$emit('cancel')">
          <IconClose />
        </button>

        <h3 class="bind-title">{{ dialogTitle }}</h3>

        <p class="bind-panel__desc">
          <template v-if="isUnbind">
            当前绑定 <b>{{ maskedEmail }}</b>，解绑后<b>不能再用它登录或找回密码</b>
          </template>
          <template v-else-if="isChange">
            当前绑定 <b>{{ maskedEmail }}</b>，验证码会发到<b>新邮箱</b>
          </template>
          <template v-else-if="hasEmail">
            验证码会发到 <b>{{ maskedEmail }}</b>
          </template>
          <template v-else>填一个常用邮箱，收 6 位验证码</template>
        </p>

        <!-- 换绑 / 解绑都要先验当前密码：这两个动作都会改写「找回密码」的凭据，
             不验密码的话，拿到登录态的人就能把邮箱换成自己的再重置密码接管账号 -->
        <input
          v-if="isChange || isUnbind"
          ref="pwdInput"
          v-model="passwordModel"
          class="bind-input bind-input--email"
          type="password"
          autocomplete="current-password"
          maxlength="32"
          placeholder="当前登录密码"
          @input="error = ''"
          @keyup.enter="isUnbind ? submit() : send()"
        />

        <input
          v-if="!hasEmail || isChange"
          ref="emailInput"
          v-model="emailModel"
          class="bind-input bind-input--email"
          type="email"
          inputmode="email"
          autocomplete="email"
          maxlength="50"
          :placeholder="isChange ? '新邮箱，例如 xxx@qq.com' : '你的邮箱，例如 xxx@qq.com'"
          @input="error = ''"
          @keyup.enter="send"
        />

        <!-- 解绑既不用收码也不用填邮箱，只验密码 -->
        <div v-if="!isUnbind" class="bind-code-row">
          <input
            v-model="code"
            class="bind-input bind-input--code"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            placeholder="6 位验证码"
            @input="onInput"
            @keyup.enter="submit"
          />
          <button
            type="button"
            class="bind-send"
            :disabled="countdown > 0 || sending"
            @click="send"
          >
            <template v-if="sending">发送中…</template>
            <template v-else-if="countdown > 0">{{ countdown }}s</template>
            <template v-else>{{ hasEmail && !isChange ? "发送验证码" : "获取验证码" }}</template>
          </button>
        </div>

        <!-- 人机校验：点「发送验证码」才展开（发信要有人守着，见后端 UserController#requireCaptcha） -->
        <CaptchaPrompt
          v-if="captchaOpen"
          ref="captchaRef"
          class="bind-captcha"
          @confirm="submitSend"
          @cancel="captchaOpen = false"
        />

        <p v-if="devCode" class="bind-dev">
          本地开发模式（未配 SMTP）：验证码是 <b>{{ devCode }}</b>
        </p>
        <p v-if="error" class="bind-error">{{ error }}</p>

        <div class="bind-actions">
          <button
            type="button"
            class="bind-submit"
            :class="{ 'bind-submit--danger': isUnbind }"
            :disabled="submitting || (!isUnbind && code.length !== 6)"
            @click="submit"
          >
            <template v-if="isUnbind">{{ submitting ? "解绑中…" : "确认解绑" }}</template>
            <template v-else-if="isChange">{{ submitting ? "更换中…" : "确认更换" }}</template>
            <template v-else>{{ submitting ? "绑定中…" : "确认绑定" }}</template>
          </button>
          <button type="button" class="bind-cancel" @click="$emit('cancel')">取消</button>
        </div>

        <!-- 弹窗底部小字：这个动作到底会影响什么，点按钮之前先说清 -->
        <p class="bind-tip">
          <template v-if="isUnbind">
            解绑只影响登录方式：解绑后就<b>不能再用这个邮箱登录</b>，也不能靠它找回密码了。你的会员身份、发帖评论和已发布内容都不受影响，之后也能重新绑定。
          </template>
          <template v-else-if="isChange">
            更换只更换联系方式，你的发帖评论权限和已发布内容都不受影响；换完旧邮箱就不能再用来找回密码了。
          </template>
          <template v-else>
            绑完就是普通用户，评论和发帖都开了；以后也能用这个邮箱找回密码。
          </template>
        </p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
/**
 * 邮箱弹窗（绑定 / 更换 / 解绑三合一）。
 *
 * 一个组件三种模式，因为三者只是「发码/提交调哪个接口」不同，输入区几乎一样：
 *   - mode="bind"（默认）：账号还没有邮箱，或者有邮箱但没验证 → 走绑定；
 *   - mode="change"：已经绑过，要换一个 → 先验当前密码，再给新邮箱发码；
 *   - mode="unbind"：已经绑过，要解绑 → 只验当前密码，清空邮箱（角色不动）。
 *
 * 为什么是弹窗而不是页面里展开的面板：账号管理页那一行要同时放「邮箱 + 待验证 + 更换 + 解绑」，
 * 面板一展开就把下面的签名/性别全推下去、页面跳一下；而且三个动作的表单字段不一样，
 * 塞在同一行里只会越来越长。弹窗限定宽度、底部小字专门说清「这个动作会影响什么」。
 * ⚠️ 点蒙层不关闭（同登录弹窗），只能点 × 或「取消」。
 * 发布框 / 评论区的「去绑定」仍跳账号管理页（见 utils/bindEmail.js），弹窗由那里触发。
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import IconClose from "@/components/icons/IconClose.vue";
import CaptchaPrompt from "@/components/modules/CaptchaPrompt.vue";
import {
  confirmVerifyCode,
  sendVerifyCode,
  sendChangeEmailCode,
  confirmChangeEmail,
  unbindEmail,
} from "@/api/user";
import { useUserStore } from "@/stores/user";
import { message } from "@/utils/message";

// ⚠️ 不要静态 import encrypt：它会把 jsencrypt（100KB+）打进「个人中心」这个主 chunk，
// 而这个组件只有点「更换」时才需要加密密码。改成用时再动态加载。
// const { encryptedData } = await import("@/utils/encrypt")

const emit = defineEmits(["done", "cancel"]);
const props = defineProps({
  /** 是否已经打开面板（用于自动发码 / 清状态） */
  active: { type: Boolean, default: false },
  /** bind = 首次绑定 / 补绑；change = 换绑（要验当前密码） */
  mode: { type: String, default: "bind" },
});

const userStore = useUserStore();

const emailInput = ref(null);
const pwdInput = ref(null);
const emailModel = ref("");
const passwordModel = ref("");
const code = ref("");
const error = ref("");
const sending = ref(false);
const submitting = ref(false);
const countdown = ref(0);
const devCode = ref("");
/** 人机校验块（点「发送验证码」才展开） */
const captchaOpen = ref(false);
const captchaRef = ref(null);

const isChange = computed(() => props.mode === "change");
const isUnbind = computed(() => props.mode === "unbind");
/** 弹窗标题：动作说清楚，别让用户点进来还要猜自己在干嘛 */
const dialogTitle = computed(() => {
  if (isUnbind.value) return "解绑邮箱";
  if (isChange.value) return "更换邮箱";
  return "绑定邮箱";
});
/** 账号上已经有邮箱（只是没验证）→ 补绑时不用再填 */
const hasEmail = computed(() => !!userStore.user?.email);
/** a***@qq.com */
const maskedEmail = computed(() => {
  const raw = userStore.user?.email || "";
  const at = raw.indexOf("@");
  if (at <= 0) return raw;
  return raw.slice(0, 1) + "***" + raw.slice(at);
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let timer = null;

const clearTimer = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

const startCountdown = (seconds) => {
  clearTimer();
  countdown.value = Math.max(0, Number(seconds) || 0);
  if (countdown.value <= 0) return;
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) clearTimer();
  }, 1000);
};

const onInput = () => {
  code.value = code.value.replace(/\D/g, "").slice(0, 6);
  error.value = "";
};

/** 换绑永远用输入框里的新邮箱；补绑时若账号已有未验证邮箱就交给后端用它 */
const currentEmail = () =>
  hasEmail.value && !isChange.value ? "" : emailModel.value.trim();

/** 换绑时 send() 已经算好的密码密文，submitSend 直接用，不再重复加密 */
let pendingCipher = "";

/**
 * 点「发送验证码」：前置校验（邮箱 / 当前密码）通过后，把图形验证码那一行展开。
 * 真正的发信交给 submitSend —— 后端要求带图形验证码，没有 key 发了也是 505。
 */
const send = async () => {
  if (sending.value || countdown.value > 0) return;
  const email = currentEmail();
  const mustFillEmail = !hasEmail.value || isChange.value;
  if (mustFillEmail) {
    if (!email) {
      error.value = isChange.value ? "请先填写要换成的邮箱" : "请先填写要绑定的邮箱";
      return;
    }
    if (!EMAIL_RE.test(email)) {
      error.value = "邮箱格式不对，检查一下";
      return;
    }
  }

  // 换绑要先把密码加密：后端只按 RSA 密文解，明文解不开。
  // 放在展开人机校验之前 —— 密码不对就别让人白看一张图。
  pendingCipher = "";
  if (isChange.value) {
    const pwd = passwordModel.value.trim();
    if (!pwd) {
      error.value = "请输入当前密码";
      return;
    }
    try {
      const { encryptedData } = await import("@/utils/encrypt");
      pendingCipher = await encryptedData({ oldPassword: pwd });
    } catch (e) {
      error.value = e?.message || "密码加密失败，请刷新页面后重试";
      return;
    }
  }

  error.value = "";
  captchaOpen.value = true;
};

/** 人机校验通过 → 真正发码 */
const submitSend = async ({ captchaKey, captchaCode }) => {
  if (sending.value) return;
  const email = currentEmail();
  const cipher = pendingCipher;
  sending.value = true;
  error.value = "";
  try {
    const res = isChange.value
      ? await sendChangeEmailCode(email, cipher, captchaKey, captchaCode)
      : await sendVerifyCode(email, captchaKey, captchaCode);
    const data = res?.data || {};
    devCode.value = data.devCode || "";
    // 后端受理了（发了 / 冷却中），人机校验块可以收起来
    captchaOpen.value = false;
    if (data.sent) {
      // 重发即废旧码（后端只认最新一封）：清掉框里的旧码，别让用户拿上一条邮件的码去试
      code.value = "";
      message.success(data.message || "验证码已发送");
    } else if (!data.retryAfter) {
      error.value = data.message || "验证码发送失败，请稍后重试";
    }
    startCountdown(data.retryAfter || (data.sent ? 60 : 0));
  } catch (e) {
    const msg = e?.message || "验证码发送失败，请稍后重试";
    if (/人机|图形验证码/.test(msg)) {
      // 图看错了：留在原地换一张
      captchaRef.value?.fail(msg);
    } else {
      // 密码不对 / 这个账号已经绑过邮箱 —— 落在弹窗的红色提示里
      captchaOpen.value = false;
      error.value = msg;
    }
  } finally {
    sending.value = false;
  }
};

const submit = async () => {
  if (submitting.value) return;

  // 解绑：不用验证码，只验当前密码（改的是「找回密码」的凭据，必须本人确认）
  if (isUnbind.value) {
    const pwd = passwordModel.value.trim();
    if (!pwd) {
      error.value = "请输入当前密码";
      return;
    }
    submitting.value = true;
    error.value = "";
    try {
      const { encryptedData } = await import("@/utils/encrypt");
      await unbindEmail(await encryptedData({ oldPassword: pwd }));
      // 刷新用户态：个人中心那一行要变回「未绑定」
      await userStore.refreshUser();
      message.success("邮箱已解绑，账号照常使用");
      emit("done");
    } catch (e) {
      error.value = e?.message || "解绑失败，请稍后重试";
    } finally {
      submitting.value = false;
    }
    return;
  }

  if (code.value.length !== 6) return;
  const email = currentEmail();
  if ((!hasEmail.value || isChange.value) && !EMAIL_RE.test(email)) {
    error.value = "请先填写并发送验证码到你的邮箱";
    return;
  }
  submitting.value = true;
  error.value = "";
  try {
    if (isChange.value) {
      await confirmChangeEmail(email, code.value);
      // 刷新用户态，个人中心那一行才会立刻显示新邮箱
      await userStore.refreshUser();
      message.success(`邮箱已换成 ${email}`);
    } else {
      await confirmVerifyCode(code.value, email);
      // 后端顺带把存量游客升成了普通用户，不刷新的话发布框还是「绑定邮箱后就能评论」
      await userStore.refreshUser();
      message.success(
        userStore.canPost
          ? "邮箱已绑定，现在是普通用户，可以评论和发帖了"
          : "邮箱已绑定"
      );
    }
    emit("done");
  } catch (e) {
    error.value = e?.message || "验证失败，请检查验证码";
    code.value = "";
  } finally {
    submitting.value = false;
  }
};

const reset = () => {
  code.value = "";
  error.value = "";
  devCode.value = "";
  emailModel.value = "";
  passwordModel.value = "";
  captchaOpen.value = false;
  pendingCipher = "";
  clearTimer();
  countdown.value = 0;
};

/**
 * 打开弹窗时的初始化。
 * ⚠️ watch 和 onMounted 都得走这里：调用方一直是 `v-if="bindOpen"` + `:active="bindOpen"`，
 * 组件挂载那一刻 active 已经是 true，watch 再也等不到 true 的变化 —— 只写在 watch 里，
 * 「补绑一个已存在但未验证的邮箱」就永远不会自动发码。
 */
const applyOpen = () => {
  reset();
  nextTick(() => {
    if (isChange.value || isUnbind.value) pwdInput.value?.focus();
    else emailInput.value?.focus();
  });
  // 只有「补绑已存在但未验证的邮箱」才自动发码。
  // 更换绝不能自动发：新邮箱和当前密码都还没填，一发就是「请先填写」的红字。
  if (hasEmail.value && !isChange.value && !isUnbind.value) send();
};

watch(
  () => props.active,
  (open) => {
    if (open) applyOpen();
    else clearTimer();
  }
);

onMounted(() => {
  if (props.active) applyOpen();
});

onUnmounted(clearTimer);
</script>

<style scoped>
.bind-overlay {
  position: fixed;
  inset: 0;
  /* 和登录弹窗同一层（2000）：这两个不会同时出现，但别再往下掉，
     否则被顶栏（1002）和 Dropdown（1010）盖住 */
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
}

.bind-dialog {
  position: relative;
  width: 400px;
  max-width: 100%;
  /* 矮屏手机上必须能滚，否则「确认」按钮和底部小字会被顶出视口 */
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  box-sizing: border-box;
  padding: 26px 24px 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: bindFade 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes bindFade {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.bind-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.bind-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.bind-title {
  margin: 0 0 8px;
  /* 给右上角 × 让位 */
  padding-right: 32px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.bind-panel__desc {
  margin: 0 0 12px;
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--text-secondary);
  word-break: break-all;
}

.bind-panel__desc b {
  color: var(--text-primary);
  font-weight: 500;
}

.bind-input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.875rem;
  box-sizing: border-box;
  outline: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.bind-input:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px var(--primary-color-soft);
}

.bind-input--email {
  margin-bottom: 10px;
}

.bind-code-row {
  display: flex;
  gap: 8px;
}

/* 验证码框有字距，和普通输入框区分开 */
.bind-input--code {
  letter-spacing: 3px;
}

.bind-send {
  flex: none;
  min-width: 100px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--primary-color);
  font-family: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}

.bind-send:hover:not(:disabled) {
  border-color: var(--primary-color);
}

.bind-send:disabled {
  color: var(--text-secondary);
  cursor: not-allowed;
}

/* 人机校验块：紧跟在「验证码 + 发送」那一行下面 */
.bind-captcha {
  margin-top: 10px;
}

.bind-dev {
  margin: 10px 0 0;
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--bg-nomarl);
  color: var(--text-secondary);
  font-size: 0.75rem;
  line-height: 1.5;
}

.bind-dev b {
  color: var(--primary-color);
  letter-spacing: 1px;
}

.bind-error {
  margin: 8px 0 0;
  font-size: 0.75rem;
  line-height: 1.5;
  color: #ef4444;
}

.bind-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.bind-submit {
  height: 34px;
  padding: 0 18px;
  border: none;
  border-radius: 8px;
  background: var(--primary-color);
  color: #fff;
  font-family: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    opacity 0.15s ease;
}

.bind-submit:hover:not(:disabled) {
  background: var(--primary-color-hover);
}

.bind-submit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* 解绑是「减法」动作，用警示色和绑定/换绑区分开 */
.bind-submit--danger {
  background: #ef4444;
}

.bind-submit--danger:hover:not(:disabled) {
  background: #dc2626;
}

.bind-cancel {
  height: 34px;
  padding: 0 12px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}

.bind-cancel:hover {
  color: var(--text-primary);
}

.bind-tip {
  margin: 10px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
  font-size: 0.72rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .bind-code-row {
    flex-wrap: wrap;
  }

  .bind-send {
    width: 100%;
  }
}
</style>
