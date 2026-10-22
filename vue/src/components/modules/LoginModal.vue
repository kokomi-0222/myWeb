<template>
  <!-- 蒙层 -->
  <Transition name="modal">
    <div v-if="uiStore.loginModalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal-container" :key="formType">
        <!-- 关闭按钮 -->
        <button class="modal-close" aria-label="关闭" @click="closeModal">
          <IconClose />
        </button>

        <!-- 登录 -->
        <div v-if="formType === 'login'" class="form-body">
          <div class="form-header">
            <h2 class="form-title">欢迎回来</h2>
            <p class="form-subtitle">登录后即可发帖、评论和点赞</p>
          </div>

          <div class="form-item">
            <InputLine
              v-model="loginForm.account"
              type="text"
              label="用户名 / 手机号 / 邮箱"
              @focus="loginErr.account = ''"
              @keyup.enter="handleLogin"
            />
            <div v-if="loginErr.account" class="err-tip">{{ loginErr.account }}</div>
          </div>

          <div class="form-item">
            <InputLine
              v-model="loginForm.password"
              label="密码"
              type="password"
              @focus="loginErr.password = ''"
              @keyup.enter="handleLogin"
            />
            <div v-if="loginErr.password" class="err-tip">{{ loginErr.password }}</div>
          </div>

          <!-- 验证码 -->
          <div class="form-item">
            <div class="captcha-row">
              <InputLine
                v-model="captchaCode"
                label="验证码"
                type="text"
                maxlength="4"
                @focus="captchaErr = ''"
                @keyup.enter="handleLogin"
              />
              <button
                class="captcha-img"
                type="button"
                title="看不清？点击换一张"
                @click="fetchCaptcha"
              >
                <img v-if="captchaImage" :src="captchaImage" alt="验证码" />
                <span v-else class="captcha-img__ph">点击获取</span>
              </button>
            </div>
            <div v-if="captchaErr" class="err-tip">{{ captchaErr }}</div>
          </div>

          <Button
            class="submit-button"
            type="bilibili"
            :disabled="logging"
            @click="handleLogin"
          >
            <span>{{ logging ? "登录中…" : "登 录" }}</span>
          </Button>

          <div class="footer-link">
            还没有账号?
            <span class="link-text" @click="goToRegister">立即注册</span>
          </div>
        </div>

        <!-- 注册 -->
        <div v-else autocomplete="off" class="form-body">
          <div class="form-header">
            <h2 class="form-title">创建账号</h2>
            <p class="form-subtitle">加入心海的小窝，记录你的日常</p>
          </div>
          <div
            style="width: 0; height: 0; overflow: hidden; position: absolute; z-index: -1"
          >
            <input type="text" autocomplete="username" />
            <input type="password" autocomplete="current-password" />
          </div>
          <div class="form-item">
            <InputLine
              ref="regAccRef"
              v-model="registerForm.account"
              label="手机号 / 邮箱"
              type="text"
              autocomplete="off"
              @focus="regErr.account = ''"
            />
            <div v-if="regErr.account" class="err-tip">{{ regErr.account }}</div>
          </div>

          <div class="form-item">
            <InputLine
              ref="regPwdRef"
              v-model="registerForm.password"
              label="密码（至少 6 位）"
              type="password"
              autocomplete="new-password"
              @focus="regErr.password = ''"
            />
            <div v-if="regErr.password" class="err-tip">{{ regErr.password }}</div>
          </div>

          <div class="form-item">
            <InputLine
              ref="regPwd2Ref"
              v-model="registerForm.confirmPassword"
              label="确认密码"
              type="password"
              autocomplete="new-password"
              @focus="regErr.confirmPassword = ''"
            />
            <div v-if="regErr.confirmPassword" class="err-tip">
              {{ regErr.confirmPassword }}
            </div>
          </div>

          <!-- 验证码 -->
          <div class="form-item">
            <div class="captcha-row">
              <InputLine
                v-model="captchaCode"
                label="验证码"
                type="text"
                maxlength="4"
                @focus="captchaErr = ''"
                @keyup.enter="handleRegister"
              />
              <button
                class="captcha-img"
                type="button"
                title="看不清？点击换一张"
                @click="fetchCaptcha"
              >
                <img v-if="captchaImage" :src="captchaImage" alt="验证码" />
                <span v-else class="captcha-img__ph">点击获取</span>
              </button>
            </div>
            <div v-if="captchaErr" class="err-tip">{{ captchaErr }}</div>
          </div>

          <Button
            class="submit-button"
            type="bilibili"
            :disabled="registering"
            @click="handleRegister"
          >
            <span>{{ registering ? "注册中…" : "注 册" }}</span>
          </Button>

          <div class="footer-link">
            已有账号?
            <span class="link-text" @click="goToLogin">返回登录</span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, watch } from "vue";
import { useUIStore } from "@/stores/ui";
import { useUserStore } from "@/stores/user";
import { message } from "@/utils/message";
import { getCaptcha } from "@/api/captcha";
import IconClose from "@/components/icons/IconClose.vue";
import router from "@/router";

const uiStore = useUIStore();
const userStore = useUserStore();
const formType = ref<"login" | "register">("login");
const regAccRef = ref<any>(null);
const regPwdRef = ref<any>(null);
const regPwd2Ref = ref<any>(null);
// ================ 登录 ================
const loginForm = reactive({
  account: "",
  password: "",
});

const loginErr = ref({
  account: "",
  password: "",
});

// ================ 注册 ================
const registerForm = reactive({
  account: "",
  password: "",
  confirmPassword: "",
});

const regErr = ref({
  account: "",
  password: "",
  confirmPassword: "",
});

// ================ 验证码（登录和注册共用） ================
const captchaImage = ref("");
const captchaKey = ref("");
const captchaCode = ref("");
const captchaErr = ref("");

const fetchCaptcha = async () => {
  try {
    captchaCode.value = "";
    captchaErr.value = "";
    const res = await getCaptcha();
    if (res.data) {
      captchaImage.value = res.data.captchaImage || "";
      captchaKey.value = res.data.captchaKey || "";
    }
  } catch (e) {
    // 获取验证码失败，静默处理
  }
};

// 弹窗打开时自动获取验证码
watch(
  () => uiStore.loginModalOpen,
  (open) => {
    if (open) {
      fetchCaptcha();
    }
  }
);

// 工具函数（加了类型，无红线）
const isPhone = (val: string) => /^1[3-9]\d{9}$/.test(val);
const isEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

// ================ 校验 ================
const validateLogin = (): boolean => {
  let ok = true;
  loginErr.value.account = "";
  loginErr.value.password = "";
  captchaErr.value = "";

  if (!loginForm.account.trim()) {
    loginErr.value.account = "请输入用户名/手机号/邮箱";
    ok = false;
  }
  if (!loginForm.password) {
    loginErr.value.password = "请输入密码";
    ok = false;
  }
  if (!captchaCode.value.trim()) {
    captchaErr.value = "请输入验证码";
    ok = false;
  }
  return ok;
};

const validateRegister = (): boolean => {
  let ok = true;
  regErr.value.account = "";
  regErr.value.password = "";
  regErr.value.confirmPassword = "";

  const acc = registerForm.account.trim();
  if (!acc) {
    regErr.value.account = "请输入手机号/邮箱";
    ok = false;
  } else if (!isPhone(acc) && !isEmail(acc)) {
    regErr.value.account = "必须是正确的手机号或邮箱";
    ok = false;
  }

  const pwd = registerForm.password;
  if (!pwd) {
    regErr.value.password = "请输入密码";
    ok = false;
  } else if (pwd.length < 6) {
    regErr.value.password = "密码至少6位";
    ok = false;
  } else if (pwd.length > 32) {
    regErr.value.password = "密码过长";
    ok = false;
  }

  if (!registerForm.confirmPassword) {
    regErr.value.confirmPassword = "请再次输入密码";
    ok = false;
  } else if (registerForm.confirmPassword !== pwd) {
    regErr.value.confirmPassword = "两次密码不一致";
    ok = false;
  }

  captchaErr.value = "";
  if (!captchaCode.value.trim()) {
    captchaErr.value = "请输入验证码";
    ok = false;
  }

  return ok;
};

// ================ 登录 ================
const logging = ref(false);
const handleLogin = async () => {
  if (!validateLogin() || logging.value) return;

  try {
    logging.value = true;
    const res = await userStore.login(loginForm, captchaKey.value, captchaCode.value);
    if (res.success) {
      message.success("登录成功");
      uiStore.closeLoginModal();
      // 登录成功后才刷新页面，重置状态
      router.push("/").then(() => {
        router.go(0);
      });
    } else {
      // 登录失败刷新验证码
      fetchCaptcha();
    }
    // 失败消息已在请求拦截器中提示，不再重复弹窗
  } catch (err) {
    message.error("登录异常");
    fetchCaptcha();
  } finally {
    logging.value = false;
  }
};

// ================ 注册 ================
const registering = ref(false);
const handleRegister = async () => {
  if (!validateRegister() || registering.value) return;

  try {
    registering.value = true;
  } catch (err) {
    message.error("注册异常");
  } finally {
    registering.value = false;
  }

  const res = await userStore.register(registerForm, captchaKey.value, captchaCode.value);
  if (res.success) {
    message.success("注册成功，请登录");
    goToLogin();
  } else {
    message.error(res.message || "注册失败");
    fetchCaptcha();
  }
};

// ================ 弹窗控制 ================
const closeModal = () => {
  uiStore.closeLoginModal();
  formType.value = "login";
  loginForm.account = "";
  loginForm.password = "";
  registerForm.account = "";
  registerForm.password = "";
  registerForm.confirmPassword = "";
  loginErr.value = { account: "", password: "" };
  regErr.value = { account: "", password: "", confirmPassword: "" };
  captchaCode.value = "";
  captchaErr.value = "";
};

const goToRegister = () => {
  formType.value = "register";
  registerForm.account = "";
  registerForm.password = "";
  registerForm.confirmPassword = "";
  captchaErr.value = "";
  fetchCaptcha();
  nextTick(() => {
    if (regAccRef?.value?.input) regAccRef.value.input.value = "";
    if (regPwdRef?.value?.input) regPwdRef.value.input.value = "";
    if (regPwd2Ref?.value?.input) regPwd2Ref.value.input.value = "";
  });
};

const goToLogin = () => {
  formType.value = "login";
  captchaErr.value = "";
  fetchCaptcha();
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 16px;
}

.modal-container {
  position: relative;
  width: 400px;
  max-width: 100%;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  padding: 36px 36px 28px;
  animation: modalFade 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalFade {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 过渡动画 */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s ease;
}
.modal-enter-active .modal-container {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal-container {
  transform: translateY(16px) scale(0.98);
}

/* 关闭按钮 */
.modal-close {
  position: absolute;
  top: 14px;
  right: 14px;
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

.modal-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* 标题区 */
.form-header {
  text-align: center;
  margin-bottom: 4px;
}

.form-title {
  margin: 0 0 6px;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.02em;
}

.form-subtitle {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.err-tip {
  color: #f53f3f;
  font-size: 12px;
  padding: 0 4px;
}

/* 验证码行：输入框占满剩余宽度，图片固定尺寸贴右侧 */
.captcha-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.captcha-row > :first-child {
  flex: 1;
  min-width: 0;
}

.captcha-img {
  flex: 0 0 auto;
  width: 108px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  overflow: hidden;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    border-color 0.2s ease,
    transform 0.15s ease;
}

.captcha-img:hover {
  border-color: var(--primary-color);
}

.captcha-img:active {
  transform: scale(0.97);
}

.captcha-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.captcha-img__ph {
  font-size: 12px;
  color: var(--text-secondary);
  user-select: none;
}

/* 主按钮：通栏大按钮 */
.submit-button {
  width: 100%;
  height: 44px;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.2em;
  margin-top: 4px;
}

.submit-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.footer-link {
  text-align: center;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.link-text {
  color: var(--primary-color);
  cursor: pointer;
  font-weight: 500;
  transition: opacity 0.2s ease;
}

.link-text:hover {
  opacity: 0.75;
}

/* 小屏 */
@media (max-width: 480px) {
  .modal-container {
    padding: 28px 22px 22px;
    border-radius: 12px;
  }
}
</style>
