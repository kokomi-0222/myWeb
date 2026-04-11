<template>
  <!-- 蒙层 -->
  <div
    v-if="uiStore.loginModalOpen"
    class="modal-overlay"
    @click.self="closeModal"
  >
    <div class="modal-container" :style="dialogStyle">
      <!-- 登录 -->
      <div v-if="formType === 'login'" class="form-body">
        <div class="login-title">用 户 登 录</div>

        <div class="form-item">
          <InputLine
            v-model="loginForm.account"
            type="text"
            label="请输入用户名/手机号/邮箱"
            @focus="loginErr.account = ''"
          />
          <div v-if="loginErr.account" class="err-tip">{{ loginErr.account }}</div>
        </div>

        <div class="form-item">
          <InputLine
            v-model="loginForm.password"
            label="请输入密码"
            type="password"
            @focus="loginErr.password = ''"
          />
          <div v-if="loginErr.password" class="err-tip">{{ loginErr.password }}</div>
        </div>

        <div class="button-group">
          <Button class="login-button" @click="goToRegister">
            <span>注册</span>
          </Button>
          <Button class="login-button" type="bilibili" @click="handleLogin">
            <span>登录</span>
          </Button>
        </div>

        <div class="footer-link">
          还没有账号?
          <span class="link-text" @click="goToRegister">立即注册</span>
        </div>
      </div>

      <!-- 注册 -->
      <div v-else class="form-body">
        <div class="login-title">注 册 账 号</div>

        <div class="form-item">
          <InputLine
            v-model="registerForm.account"
            label="请输入手机号/邮箱"
            type="text"
            autocomplete="off"
            @focus="regErr.account = ''"
          />
          <div v-if="regErr.account" class="err-tip">{{ regErr.account }}</div>
        </div>

        <div class="form-item">
          <InputLine
            v-model="registerForm.password"
            label="请输入密码"
            type="password"
            autocomplete="new-password"
            @focus="regErr.password = ''"
          />
          <div v-if="regErr.password" class="err-tip">{{ regErr.password }}</div>
        </div>

        <div class="form-item">
          <InputLine
            v-model="registerForm.confirmPassword"
            label="请确认密码"
            type="password"
            autocomplete="new-password"
            @focus="regErr.confirmPassword = ''"
          />
          <div v-if="regErr.confirmPassword" class="err-tip">{{ regErr.confirmPassword }}</div>
        </div>

        <div class="button-group">
          <Button class="login-button" @click="goToLogin">返回登录</Button>
          <Button class="login-button" type="bilibili" @click="handleRegister">
            <span style="color: white">注册账号</span>
          </Button>
        </div>

        <div class="footer-link">
          已有账号?
          <span class="link-text" @click="goToLogin">返回登录</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { useUIStore } from "@/stores/ui";
import { useUserStore } from "@/stores/user";
import { message } from '@/utils/message'

const uiStore = useUIStore();
const userStore = useUserStore();
const formType = ref<"login" | "register">("login");

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

// 工具函数（加了类型，无红线）
const isPhone = (val: string) => /^1[3-9]\d{9}$/.test(val);
const isEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

// ================ 校验 ================
const validateLogin = (): boolean => {
  let ok = true;
  loginErr.value.account = "";
  loginErr.value.password = "";

  if (!loginForm.account.trim()) {
    loginErr.value.account = "请输入用户名/手机号/邮箱";
    ok = false;
  }
  if (!loginForm.password) {
    loginErr.value.password = "请输入密码";
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
  }

  if (!registerForm.confirmPassword) {
    regErr.value.confirmPassword = "请再次输入密码";
    ok = false;
  } else if (registerForm.confirmPassword !== pwd) {
    regErr.value.confirmPassword = "两次密码不一致";
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
    const res = await userStore.login(loginForm);
    if (res.success) {
      message.success("登录成功");
      uiStore.closeLoginModal();
    } else {
      message.error(res.message || "登录失败");
    }
  } catch (err) {
    message.error("登录异常");
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
    message.success("注册校验通过");
  } catch (err) {
    message.error("注册异常");
  } finally {
    registering.value = false;
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
};

const goToRegister = () => {
  formType.value = "register";
};

const goToLogin = () => {
  formType.value = "login";
};

const dialogStyle = {
  background: "var(--login-modal-bg)",
  opacity: 0.9,
  borderRadius: "10px",
  boxShadow: "0 0 10px rgba(0, 0, 0, 0.24)",
  padding: "40px 20px",
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal-container {
  width: 400px;
  position: relative;
  border-radius: 10px;
  animation: modalFade 0.3s ease;
}

@keyframes modalFade {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.login-title {
  text-align: center;
  font-weight: bold;
  font-size: 1.5rem;
  margin-bottom: 12px;
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

.button-group {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 8px;
}

.login-button {
  width: 194px;
  height: 40px;
  border-radius: 8px;
  font-weight: 500;
}

.footer-link {
  text-align: right;
  font-size: 14px;
}

.link-text {
  color: #4173df;
  cursor: pointer;
  text-decoration: underline;
}
</style>