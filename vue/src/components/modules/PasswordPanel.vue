<template>
  <Teleport to="body">
    <!-- 点蒙层不关（同注销 / 邮箱弹窗）：密码框填到一半手一抖就全丢了 -->
    <div class="pp-overlay">
      <div class="pp-dialog" role="dialog" aria-modal="true" aria-label="修改密码">
        <button type="button" class="pp-close" aria-label="关闭" @click="$emit('cancel')">
          <IconClose />
        </button>

        <h3 class="pp-title">修改密码</h3>
        <p class="pp-desc">改完需要用新密码重新登录一次。</p>

        <!-- 自动填充诱饵：不加的话浏览器会把整站登录密码塞进「当前密码」框 -->
        <div class="pp-decoy" aria-hidden="true">
          <input type="text" autocomplete="username" tabindex="-1" />
          <input type="password" autocomplete="current-password" tabindex="-1" />
        </div>

        <input
          ref="oldInput"
          v-model="form.oldPassword"
          class="pp-input"
          type="password"
          autocomplete="off"
          maxlength="32"
          placeholder="当前密码"
          @input="error = ''"
        />
        <input
          v-model="form.newPassword"
          class="pp-input"
          type="password"
          autocomplete="new-password"
          maxlength="32"
          placeholder="新密码（至少 6 位）"
          @input="error = ''"
        />
        <input
          v-model="form.confirmPassword"
          class="pp-input"
          type="password"
          autocomplete="new-password"
          maxlength="32"
          placeholder="再输一次新密码"
          @input="error = ''"
          @keyup.enter="submit"
        />

        <p v-if="error" class="pp-error">{{ error }}</p>

        <div class="pp-actions">
          <button type="button" class="pp-submit" :disabled="submitting" @click="submit">
            {{ submitting ? "提交中…" : "确认修改" }}
          </button>
          <button type="button" class="pp-cancel" @click="$emit('cancel')">取消</button>
        </div>

        <!-- 知道不了原密码的人平时进不来（要登录），但在公共电脑上记着登录态时会撞上 -->
        <p class="pp-forgot">
          忘记当前密码？
          <button type="button" class="forgot-link" @click="openForgot">用绑定邮箱重置</button>
        </p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
/**
 * 修改密码弹窗。
 *
 * 从原来的独立页面（views/space/Password.vue）搬过来：密码属于「账号凭据」，
 * 和邮箱、注销放在同一个「账号安全」页里更合适，也不占一个侧栏位置。
 *
 * 校验顺序保持原样（空 → 位数 → 两次不一致 → 新旧相同），
 * 成功后的动作也没变：清登录态回首页，因为 token_version 变了旧 token 已作废。
 */
import { reactive, ref, onMounted, nextTick } from "vue";
import { useUserStore } from "@/stores/user";
import { useUIStore } from "@/stores/ui";
import { useRouter } from "vue-router";
import { message } from "@/utils/message";
import IconClose from "@/components/icons/IconClose.vue";

const emit = defineEmits(["done", "cancel"]);

const userStore = useUserStore();
const uiStore = useUIStore();
const router = useRouter();

const oldInput = ref(null);
const submitting = ref(false);
const error = ref("");

const form = reactive({
  oldPassword: "",
  newPassword: "",
  confirmPassword: "",
});

/** 忘记原密码：关掉弹窗，打开登录弹窗的「找回密码」那一屏 */
const openForgot = () => {
  emit("cancel");
  uiStore.openLoginModal("forgot");
};

const submit = async () => {
  if (submitting.value) return;
  const { oldPassword, newPassword, confirmPassword } = form;

  if (!oldPassword) {
    error.value = "请输入当前密码";
    return;
  }
  if (!newPassword || newPassword.length < 6) {
    error.value = "新密码至少 6 位";
    return;
  }
  if (newPassword.length > 32) {
    error.value = "新密码不超过 32 位";
    return;
  }
  if (newPassword !== confirmPassword) {
    error.value = "两次输入的新密码不一致";
    return;
  }
  if (oldPassword === newPassword) {
    error.value = "新密码不能与原密码相同";
    return;
  }

  submitting.value = true;
  error.value = "";
  try {
    const res = await userStore.updatePassword(form);
    if (res?.success) {
      message.success("密码修改成功，请重新登录");
      emit("done");
      await userStore.logout();
      router.push("/").then(() => {
        router.go(0);
      });
    } else {
      error.value = res?.message || "修改失败";
    }
  } catch (err) {
    error.value = err?.msg || err?.message || "原密码不正确";
  } finally {
    submitting.value = false;
  }
};

onMounted(() => {
  nextTick(() => oldInput.value?.focus());
});
</script>

<style scoped>
.pp-overlay {
  position: fixed;
  inset: 0;
  /* 与登录 / 邮箱 / 注销弹窗同层，别掉到顶栏(1002)下面 */
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
}

.pp-dialog {
  position: relative;
  width: 400px;
  max-width: 100%;
  /* 矮屏手机上必须能滚，否则「确认修改」会被顶出视口 */
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  box-sizing: border-box;
  padding: 26px 24px 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: ppFade 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes ppFade {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.pp-close {
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

.pp-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.pp-title {
  margin: 0 0 6px;
  /* 给右上角 × 让位 */
  padding-right: 28px;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-primary);
}

.pp-desc {
  margin: 0 0 16px;
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

/* 诱饵框：不占位、不可聚焦，只为了让浏览器认出来「这里已经自动填过了」 */
.pp-decoy {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  z-index: -1;
}

.pp-input {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-nomarl);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.2s ease;
}

.pp-input::placeholder {
  color: var(--text-tertiary);
}

.pp-input:focus {
  border-color: var(--primary-color);
}

.pp-error {
  margin: 2px 0 0;
  font-size: 0.78rem;
  line-height: 1.5;
  color: #ef4444;
}

.pp-actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}

.pp-submit {
  flex: 1;
  height: 38px;
  border: none;
  border-radius: 8px;
  background: var(--primary-color);
  color: #fff;
  font-family: inherit;
  font-size: 0.875rem;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.pp-submit:hover:not(:disabled) {
  opacity: 0.85;
}

.pp-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pp-cancel {
  flex: none;
  height: 38px;
  padding: 0 18px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}

.pp-cancel:hover {
  color: var(--text-primary);
  border-color: var(--text-tertiary);
}

.pp-forgot {
  margin: 14px 0 0;
  text-align: right;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.forgot-link {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--primary-color);
  font-family: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.forgot-link:hover {
  opacity: 0.75;
}
</style>
