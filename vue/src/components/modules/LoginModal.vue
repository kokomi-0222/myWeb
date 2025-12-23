<!-- src/components/LoginModal.vue -->
<!-- 这是一个登录的弹窗模块 可在任意组件中调用 -->
<template>
  <el-dialog
    v-model="uiStore.loginModalOpen"
    title=""
    destroy-on-close
    width="350px"
    custom-class="login-dialog"
    @close="onClose"
  >
    <el-form :model="form" :rules="rules" ref="formRef" @submit.prevent>
      <div class="login-title">用 户 登 录</div>

      <el-form-item prop="username">
        <InputLine v-model="form.username" placeholder="请输入账号" type="text" />
      </el-form-item>

      <el-form-item prop="password">
        <InputLine v-model="form.password" placeholder="请输入密码" type="password" />
      </el-form-item>

      <div class="button-group">
        <el-button style="width: 48%" size="large" @click="goToRegister">注册</el-button>
        <el-button style="width: 48%" size="large" type="primary" @click="handleLogin"
          >登录</el-button
        >
      </div>

      <div class="footer-link">
        还没有账号? <a href="/register" style="color: #4173df">立即注册</a>
      </div>
    </el-form>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { useUIStore } from "@/stores/ui";
import { useUserStore } from "@/stores/user"; // 假设你有 user store
import InputLine from "@/components/inputs/InputLine.vue";

const uiStore = useUIStore();
const userStore = useUserStore();

// 表单数据
const form = reactive({
  username: "",
  password: "",
});

const rules = {
  username: [{ required: true, message: "请输入账号", trigger: "blur" }],
  password: [{ required: true, message: "请输入密码", trigger: "blur" }],
};

// 计算属性：同步 uiStore 的状态

// 监听外部关闭（比如点击遮罩）
const onClose = () => {
  uiStore.closeLoginModal();
};

// 登录
const handleLogin = async () => {
  try {
    await userStore.login(form.username, form.password);
    // 登录成功后自动关闭
    uiStore.closeLoginModal();
    // 可选：重置表单
    form.username = "";
    form.password = "";
  } catch (error) {
    // 登录失败，Element Plus 可以在这里 ElMessage.error(...)
    console.error("登录失败:", error);
  }
};

const goToRegister = () => {
  /*  uiStore.closeLoginModal()
  // 跳转注册页
  window.location.href = '/register' */
};
</script>

<style scoped>
.login-dialog {
  background-color: #e7ecfd;
  opacity: 0.9 !important;
  border-radius: 10px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.24);
  padding: 40px 20px;
}

.login-title {
  margin-bottom: 40px;
  text-align: center;
  font-weight: bold;
  font-size: 25px;
}

.button-group {
  display: flex;
  justify-content: space-between;
  margin: 20px 0;
}

.footer-link {
  margin-top: 20px;
  text-align: right;
}
</style>
