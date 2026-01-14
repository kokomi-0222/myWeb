<!-- src/components/LoginModal.vue -->
<!-- 这是一个登录的弹窗模块 可在任意组件中调用 -->
<template>
  <el-dialog
    v-model="uiStore.loginModalOpen"
    title=""
    destroy-on-close
    width="400px"
    :style="dialogStyle"
    @closed="handleDialogClose"
  >
    <!-- 登录界面 -->
    <el-form
      v-if="formType === 'login'"
      :model="loginForm"
      :rules="loginRules"
      ref="loginFormRef"
      @submit.prevent
    >
      <div class="login-title">用 户 登 录</div>
      <el-form-item prop="username">
        <InputLine
          v-model="loginForm.username"
          type="text"
          label="请输入账号"
          @focus="clearLoginError('username')"
        />
      </el-form-item>

      <el-form-item prop="password">
        <InputLine
          v-model="loginForm.password"
          label="请输入密码"
          type="password"
          @focus="clearLoginError('password')"
        />
      </el-form-item>

      <div class="button-group">
        <Button
          class="login-button"
          @click="goToRegister"
          ><span style="">注册</span></Button
        >
        <Button
          class="login-button"
          type="bilibili"
          @click="handleLogin"
          ><span>登录</span></Button
        >
      </div>

      <div class="footer-link">
        还没有账号?
        <span
          @click="goToRegister"
          style="color: #4173df; cursor: pointer; text-decoration: underline"
          >立即注册</span
        >
      </div>
    </el-form>

    <!-- 注册界面 -->

    <el-form
      v-else
      :model="registerForm"
      :rules="registerRules"
      ref="registerFormRef"
      @submit.prevent
    >
      <div class="login-title">注 册 账 号</div>
      <el-form-item prop="username" label="">
        <InputLine
          v-model="registerForm.username"
          label="请输入账号"
          type="text"
          @focus="clearRegisterError('username')"
        />
      </el-form-item>

      <el-form-item prop="password" label="">
        <InputLine
          v-model="registerForm.password"
          label="请输入密码"
          type="password"
          @focus="clearRegisterError('password')"
        />
      </el-form-item>
      <el-form-item prop="confirmPassword" label="">
        <InputLine
          v-model="registerForm.confirmPassword"
          label="请确认密码"
          type="password"
          @focus="clearRegisterError('confirmPassword')"
        />
      </el-form-item>
      <div class="button-group">
        <Button class="login-button" @click="goToLogin">返回登录</Button>
        <Button
          class="login-button"
          type="bilibili"
          @click="handleResigister"
          ><span style="color: white">注册账号</span></Button
        >
      </div>

      <div class="footer-link">
        已有账号?
        <span
          @click="goToLogin"
          style="color: #4173df; cursor: pointer; text-decoration: underline"
          >返回登录</span
        >
      </div>
    </el-form>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick } from "vue";
import { useUIStore } from "@/stores/ui";
import { useUserStore } from "@/stores/user";


const uiStore = useUIStore();
const userStore = useUserStore();
const formType = ref("login");

const loginFormRef = ref();
const registerFormRef = ref();

// 表单数据
const loginForm = reactive({
  username: "",
  password: "",
});

const loginRules = {
  username: [{ required: true, message: "请输入账号" }],
  password: [{ required: true, message: "请输入密码" }],
};

const registerForm = reactive({
  username: "",
  password: "",
  confirmPassword: "",
});

const validatePass = (rule, value, callback) => {
  if (!value) {
    callback(new Error("请再次输入密码"));
  } else if (value !== registerForm.password) {
    callback(new Error("两次输入的密码不一致！"));
  } else {
    callback();
  }
};

// 注册规则
const registerRules = {
  username: [{ required: true, message: "请输入账号" }],
  password: [
    { required: true, message: "请输入密码" },
    { min: 6, message: "密码至少6位" }, // 可选增强
  ],
  confirmPassword: [
    { required: true, message: "请再次输入密码" },
    { validator: validatePass },
  ],
};

// 清除登录表单某字段错误
const clearLoginError = (prop: string) => {
  loginFormRef.value?.clearValidate(prop);
};

// 清除注册表单某字段错误
const clearRegisterError = (prop: string) => {
  registerFormRef.value?.clearValidate(prop);
};

const handleDialogClose = (done: () => void) => {
  formType.value = "login";
  resetForms();
};

const resetForms = () => {
  loginForm.username = "";
  loginForm.password = "";
  registerForm.username = "";
  registerForm.password = "";
  registerForm.confirmPassword = "";
};

// 登录
const handleLogin = async () => {
  const valid = await loginFormRef.value?.validate().catch(() => false);
  if (valid) {
    // 校验通过，执行登录
    console.log("登录数据:", loginForm);
    const res = await userStore.login(loginForm);
    if (res.success) {
      ElMessage.success("登录成功！");
      uiStore.closeLoginModal();
    } else {
      ElMessage.error(res.message);
    }
  }
};

//注册
const handleResigister = async () => {
  const valid = await registerFormRef.value?.validate();
  if (valid) {
    console.log("注册数据:", registerForm);
    ElMessage.success("注册成功！");
  }
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
.login-title {
  margin-bottom: 40px;
  text-align: center;
  font-weight: bold;
  font-size: 1.5rem;
}

.button-group {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
}

.login-button {
  width: 194px;
  height: 40px;
  border-radius: 8px;
  font-weight: 500;
}

.footer-link {
  margin-top: 20px;
  text-align: right;
}
</style>
