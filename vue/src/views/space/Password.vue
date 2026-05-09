<template>
  <div class="account-page">
    <div class="account-card">
      <div style="width: 0; height: 0; overflow: hidden; position: absolute; z-index: -1">
        <input type="text" autocomplete="username" />
        <input type="password" autocomplete="current-password" />
      </div>
      <div class="form-item">
        <label>当前密码：</label>
        <InputText
          v-model="form.oldPassword"
          type="password"
          placeholder="请输入当前密码"
          autocomplete="off"
          class="input-password"
        />
      </div>

      <div class="form-item">
        <label>新密码：</label>
        <InputText
          v-model="form.newPassword"
          type="password"
          placeholder="请输入新密码（至少6位）"
          autocomplete="off"
          class="input-password"
        />
      </div>

      <div class="form-item">
        <label>确认密码：</label>
        <InputText
          v-model="form.confirmPassword"
          type="password"
          placeholder="请再次输入新密码"
          autocomplete="off"
          class="input-password"
        />
      </div>

      <div class="form-item btn-row">
        <Button type="bilibili" class="save-btn" @click="handleSubmit"> 确认修改 </Button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive } from "vue";
import { useUserStore } from "@/stores/user";
import { message } from "@/utils/message";
import router from "@/router";
// import { updatePassword } from "@/api/user"; // 后面你再开接口

const userStore = useUserStore();

// 表单数据
const form = reactive({
  oldPassword: "",
  newPassword: "",
  confirmPassword: "",
});

// 提交修改
const handleSubmit = async () => {
  const { oldPassword, newPassword, confirmPassword } = form;

  // -------------- 前端校验 --------------
  if (!oldPassword) {
    message.warning("请输入当前密码");
    return;
  }
  if (!newPassword || newPassword.length < 6) {
    message.warning("新密码至少 6 位");
    return;
  }
  if(newPassword.length > 32){
    message.warning("新密码不超过32位");
    return;
  }

  if (newPassword !== confirmPassword) {
    message.warning("两次输入的新密码不一致");
    return;
  }
  if (oldPassword === newPassword) {
    message.warning("新密码不能与原密码相同");
    return;
  }

  // -------------- 调用接口 --------------
  try {
    const res = await userStore.updatePassword(form);
    if (res?.success) {
      message.success("密码修改成功，请重新登录");
      // 修改成功后：
      userStore.logout(); // 退出登录
      router.push("/").then(() => {
        router.go(0);
      });
    } else {
      message.error(res.message || "修改失败");
    }
  } catch (err) {
    message.error("修改失败：" + (err.msg || "原密码错误"));
  }
};
</script>

<style scoped>
.account-page {
  padding: 10px 20px;
  max-width: 700px;
  margin: 0 auto;
}
.account-card {
  padding: 24px;
  width: 100%;
  box-sizing: border-box;
}
.form-item {
  display: flex;
  margin-bottom: 30px;
  align-items: center;
}
.form-item label {
  display: inline-block;
  text-align: right;
  white-space: nowrap;
  line-height: 30px;
  margin-right: 20px;
  color: #606266;
  width: 90px;
  flex-shrink: 0;
}

.form-item .input-password {
  width: 100%;
  max-width: 225px;
}

.btn-row {
  margin-top: 30px;
  justify-content: center;
}
.save-btn {
  padding: 10px 24px;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  width: 100%;
  max-width: 150px;
}

/* 移动端响应式 */
@media (max-width: 768px) {
  .account-page {
    padding: 10px 12px;
  }
  .account-card {
    padding: 16px 12px;
  }
  .form-item {
    flex-direction: column;
    align-items: flex-start;
    margin-bottom: 20px;
  }
  .form-item label {
    text-align: left;
    margin-bottom: 6px;
  }
  .form-item .input-password {
    max-width: 100%;
  }
}
</style>
