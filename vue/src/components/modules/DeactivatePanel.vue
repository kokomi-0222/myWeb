<template>
  <Teleport to="body">
    <!-- 点蒙层不关（同登录 / 邮箱弹窗）：注销是不可逆操作，
         误触蒙层直接关掉反倒安全，但这里同样不给「手一抖就关」的通道，
         只留 × 和「取消」两个明确的出口。 -->
    <div class="dc-overlay">
      <div class="dc-dialog" role="dialog" aria-modal="true" aria-label="注销账号">
        <button type="button" class="dc-close" aria-label="关闭" @click="$emit('cancel')">
          <IconClose />
        </button>

        <h3 class="dc-title">注销账号</h3>
        <p class="dc-desc">
          注销后这个账号<b>无法恢复</b>。请先确认下面三件事都是你想要的：
        </p>

        <ul class="dc-list">
          <li>用户名、邮箱、头像、签名等资料会被<b>清空</b></li>
          <li>你发过的帖子和评论<b>仍然保留</b>，作者显示为「已注销用户」</li>
          <li>想再回来，可以用同一个邮箱重新注册，但那是一个<b>全新的账号</b></li>
        </ul>

        <input
          ref="pwdInput"
          v-model="password"
          class="dc-input"
          type="password"
          autocomplete="current-password"
          maxlength="32"
          placeholder="输入当前登录密码以确认"
          @input="error = ''"
          @keyup.enter="submit"
        />

        <label class="dc-agree">
          <input
            v-model="agreed"
            type="checkbox"
            class="dc-checkbox"
            @change="error = ''"
          />
          <span>我已知晓，注销后账号无法恢复</span>
        </label>

        <p v-if="error" class="dc-error">{{ error }}</p>

        <div class="dc-actions">
          <button
            type="button"
            class="dc-submit"
            :disabled="!canSubmit"
            @click="submit"
          >
            {{ submitting ? "注销中…" : "确认注销" }}
          </button>
          <button type="button" class="dc-cancel" @click="$emit('cancel')">取消</button>
        </div>

        <p class="dc-tip">
          只是不想收到邮件？那去<b>解绑邮箱</b>就够了，不用注销账号。
        </p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
/**
 * 注销账号弹窗。
 *
 * 为什么单独做一个弹窗、而不是挂在账号管理页里展开：注销是全站唯一不可逆的操作，
 * 它需要「列后果 + 验密码 + 勾确认」这一整套，塞进表单流里会被当成普通设置项点掉。
 *
 * 三个硬性约束（少一个都不行）：
 *   ① 必须输当前密码 —— token 只能证明「这台设备登录过」，不能证明是本人；
 *   ② 必须勾选「我已知晓」—— 让「不可逆」这句话被真正读过一遍；
 *   ③ 两者都满足，红色按钮才可点 —— 不给「先点了再说」的机会。
 *
 * 密码走 RSA（同换绑邮箱）：后端只认密文，而且 jsencrypt 用动态 import，
 * 不点注销就永远不会加载这一百多 KB。
 */
import { ref, computed, onMounted, nextTick } from "vue";
import IconClose from "@/components/icons/IconClose.vue";
import { deactivateAccount } from "@/api/user";
import setting from "@/config/setting";

const emit = defineEmits(["done", "cancel"]);

const pwdInput = ref(null);
const password = ref("");
const agreed = ref(false);
const submitting = ref(false);
const error = ref("");

const canSubmit = computed(
  () => !submitting.value && password.value.trim().length > 0 && agreed.value
);

const submit = async () => {
  if (!canSubmit.value) return;
  // 后端已经拦了一道，前端再拦一次是为了「输错了立刻说」而不是白等一个来回
  const pwd = password.value.trim();
  if (!pwd) {
    error.value = "请输入当前密码";
    return;
  }

  submitting.value = true;
  error.value = "";
  try {
    const { encryptedData } = await import("@/utils/encrypt");
    const cipher = await encryptedData({ oldPassword: pwd });
    const res = await deactivateAccount(cipher);
    if (setting.successCode.includes(res?.code)) {
      emit("done");
    } else {
      error.value = res?.message || "注销失败，请稍后重试";
    }
  } catch (e) {
    // 密码错(504) / 管理员账号(403) 的文案都由后端给，直接展示
    error.value = e?.message || "注销失败，请稍后重试";
    password.value = "";
  } finally {
    submitting.value = false;
  }
};

onMounted(() => {
  nextTick(() => pwdInput.value?.focus());
});
</script>

<style scoped>
.dc-overlay {
  position: fixed;
  inset: 0;
  /* 和登录 / 邮箱弹窗同层（2000），别往下掉到顶栏(1002)下面 */
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
}

.dc-dialog {
  position: relative;
  width: 420px;
  max-width: 100%;
  /* 矮屏手机上必须能滚，否则「确认注销」会被顶出视口 */
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  box-sizing: border-box;
  padding: 26px 24px 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: dcFade 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes dcFade {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.dc-close {
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

.dc-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.dc-title {
  margin: 0 0 8px;
  /* 给右上角 × 让位 */
  padding-right: 32px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.dc-desc {
  margin: 0 0 10px;
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

.dc-list {
  margin: 0 0 14px;
  padding-left: 18px;
  font-size: 0.8125rem;
  line-height: 1.75;
  color: var(--text-secondary);
}

.dc-list b,
.dc-desc b {
  color: var(--text-primary);
  font-weight: 500;
}

.dc-input {
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

.dc-input:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px var(--primary-color-soft);
}

.dc-agree {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.dc-checkbox {
  flex: none;
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: #ef4444;
  cursor: pointer;
}

.dc-error {
  margin: 8px 0 0;
  font-size: 0.75rem;
  line-height: 1.5;
  color: #ef4444;
}

.dc-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.dc-submit {
  height: 34px;
  padding: 0 18px;
  border: none;
  border-radius: 8px;
  background: #ef4444;
  color: #fff;
  font-family: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    opacity 0.15s ease;
}

.dc-submit:hover:not(:disabled) {
  background: #dc2626;
}

.dc-submit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.dc-cancel {
  height: 34px;
  padding: 0 12px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}

.dc-cancel:hover {
  color: var(--text-primary);
}

.dc-tip {
  margin: 10px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
  font-size: 0.72rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

.dc-tip b {
  color: var(--text-primary);
  font-weight: 500;
}
</style>
