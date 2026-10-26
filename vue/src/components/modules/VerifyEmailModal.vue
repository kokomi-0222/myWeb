<template>
  <Teleport to="body">
    <Transition name="verify-fade">
      <div v-if="uiStore.verifyModalOpen" class="verify-overlay" @click.self="close">
        <div class="verify-card" role="dialog" aria-modal="true" aria-label="验证邮箱">
          <button type="button" class="verify-close" aria-label="关闭" @click="close">
            <IconClose :size="16" />
          </button>

          <div class="verify-head">
            <span class="verify-head__icon"><IconMail :size="20" /></span>
            <div class="verify-head__text">
              <h3 class="verify-head__title">验证邮箱</h3>
              <p class="verify-head__desc">
                验证码会发到 <b>{{ emailText }}</b>
              </p>
            </div>
          </div>

          <input
            v-model="code"
            class="verify-input"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            placeholder="6 位验证码"
            @input="onInput"
            @keyup.enter="submit"
          />

          <p v-if="devCode" class="verify-dev">
            本地开发模式（未配 SMTP）：验证码是 <b>{{ devCode }}</b>
          </p>
          <p v-if="error" class="verify-error">{{ error }}</p>

          <button
            type="button"
            class="verify-submit"
            :disabled="submitting || code.length !== 6"
            @click="submit"
          >
            {{ submitting ? "验证中…" : "验证并解锁发言" }}
          </button>

          <div class="verify-foot">
            <button
              type="button"
              class="verify-resend"
              :disabled="countdown > 0 || sending"
              @click="send"
            >
              <template v-if="sending">发送中…</template>
              <template v-else-if="countdown > 0">{{ countdown }}s 后可重发</template>
              <template v-else>重新发送验证码</template>
            </button>
            <button type="button" class="verify-later" @click="close">稍后再说</button>
          </div>

          <p class="verify-tip">
            没收到？看一眼垃圾箱；QQ 邮箱有时会把验证码归到「垃圾邮件」里。
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, onUnmounted } from "vue";
import IconClose from "@/components/icons/IconClose.vue";
import IconMail from "@/components/icons/IconMail.vue";
import { confirmVerifyCode, sendVerifyCode } from "@/api/user";
import { useUIStore } from "@/stores/ui";
import { useUserStore } from "@/stores/user";
import { message } from "@/utils/message";

const uiStore = useUIStore();
const userStore = useUserStore();

const code = ref("");
const error = ref("");
const sending = ref(false);
const submitting = ref(false);
const countdown = ref(0);
const devCode = ref("");
const emailText = ref("你的邮箱");

let timer = null;

const startCountdown = (seconds) => {
  clearTimer();
  countdown.value = Math.max(0, Number(seconds) || 0);
  if (countdown.value <= 0) return;
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) clearTimer();
  }, 1000);
};

const clearTimer = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (countdown.value < 0) countdown.value = 0;
};

const reset = () => {
  code.value = "";
  error.value = "";
  devCode.value = "";
  clearTimer();
  countdown.value = 0;
};

const onInput = () => {
  // 只留数字，顺便在粘贴带空格的内容时也能用
  code.value = code.value.replace(/\D/g, "").slice(0, 6);
  error.value = "";
};

/**
 * 发验证码。打开弹窗时自动发一次，省得用户再点一下。
 * 被频控挡住（sent=false + retryAfter>0）不是错误，只是显示倒计时。
 */
const send = async () => {
  if (sending.value || countdown.value > 0) return;
  sending.value = true;
  error.value = "";
  try {
    const res = await sendVerifyCode();
    const data = res?.data || {};
    emailText.value = data.email || emailText.value;
    devCode.value = data.devCode || "";
    if (data.sent) {
      message.success(data.message || "验证码已发送");
    } else if (!data.retryAfter) {
      error.value = data.message || "验证码发送失败，请稍后重试";
    }
    startCountdown(data.retryAfter || (data.sent ? 60 : 0));
  } catch (e) {
    // 接口层的业务错误已经弹过 toast，这里只把文案留在卡片里
    error.value = e?.message || "验证码发送失败，请稍后重试";
  } finally {
    sending.value = false;
  }
};

const submit = async () => {
  if (submitting.value || code.value.length !== 6) return;
  submitting.value = true;
  error.value = "";
  try {
    await confirmVerifyCode(code.value);
    message.success("邮箱已验证，现在可以发帖和评论了");
    // 刷新用户状态：发布框 / 评论框的「去验证」提示会立刻换回正常输入框
    await userStore.refreshUser();
    uiStore.closeVerifyModal();
  } catch (e) {
    error.value = e?.message || "验证失败，请检查验证码";
    code.value = "";
  } finally {
    submitting.value = false;
  }
};

const close = () => {
  uiStore.closeVerifyModal();
};

watch(
  () => uiStore.verifyModalOpen,
  (open) => {
    if (open) {
      reset();
      send();
    } else {
      clearTimer();
    }
  }
);

onUnmounted(clearTimer);
</script>

<style scoped>
.verify-overlay {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(3px);
}

.verify-card {
  position: relative;
  width: 380px;
  max-width: 100%;
  padding: 24px 24px 18px;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--dropdown-bg);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.28);
}

.verify-close {
  position: absolute;
  top: 14px;
  right: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.verify-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.verify-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding-right: 28px;
}

.verify-head__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 10px;
  background: var(--primary-color-soft);
  color: var(--primary-color);
}

.verify-head__title {
  margin: 2px 0 4px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.verify-head__desc {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--text-secondary);
  word-break: break-all;
}

.verify-head__desc b {
  color: var(--text-primary);
  font-weight: 500;
}

.verify-input {
  width: 100%;
  height: 46px;
  margin-top: 18px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 8px;
  text-align: center;
  box-sizing: border-box;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.verify-input::placeholder {
  font-size: 0.875rem;
  font-weight: 400;
  letter-spacing: 0;
  color: var(--text-secondary);
}

.verify-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px var(--primary-color-soft);
}

.verify-dev {
  margin: 10px 0 0;
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--bg-nomarl);
  color: var(--text-secondary);
  font-size: 0.75rem;
  line-height: 1.5;
}

.verify-dev b {
  color: var(--primary-color);
  letter-spacing: 1px;
}

.verify-error {
  margin: 10px 0 0;
  font-size: 0.75rem;
  line-height: 1.5;
  color: #ef4444;
}

.verify-submit {
  width: 100%;
  height: 38px;
  margin-top: 16px;
  border: none;
  border-radius: 9px;
  background: var(--primary-color);
  color: #fff;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    opacity 0.15s ease;
}

.verify-submit:hover:not(:disabled) {
  background: var(--primary-color-hover);
}

.verify-submit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.verify-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}

.verify-resend,
.verify-later {
  padding: 4px 2px;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.verify-resend {
  color: var(--primary-color);
}

.verify-resend:disabled {
  color: var(--text-secondary);
  cursor: not-allowed;
}

.verify-later {
  color: var(--text-secondary);
}

.verify-later:hover {
  color: var(--text-primary);
}

.verify-tip {
  margin: 12px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
  font-size: 0.72rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

.verify-fade-enter-active,
.verify-fade-leave-active {
  transition: opacity 0.18s ease;
}

.verify-fade-enter-from,
.verify-fade-leave-to {
  opacity: 0;
}

@media (max-width: 480px) {
  .verify-card {
    padding: 22px 18px 16px;
  }
}
</style>
