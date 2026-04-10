<template>
  <div class="account-page">
    <div class="account-card">
      <!-- 昵称 -->
      <div class="form-item">
        <label>昵称:</label>
        <input v-model="userInfo.name" type="text" placeholder="请输入昵称" />
      </div>
      <!-- 用户名 -->
      <div class="form-item">
        <label>用户名</label>
        <div class="read-only">{{ userInfo.username }}</div>
        <div class="tip">用户名不可修改</div>
      </div>

      <!-- 签名 -->
      <div class="form-item">
        <label>个性签名</label>
        <textarea
          v-model="userInfo.signature"
          rows="3"
          placeholder="请输入个性签名"
        ></textarea>
      </div>

      <!-- 性别 -->
      <div class="form-item">
        <label>性别</label>
        <div class="gender-group">
          <label class="gender-item">
            <input v-model="userInfo.gender" type="radio" value="male" />
            <span>男</span>
          </label>
          <label class="gender-item">
            <input v-model="userInfo.gender" type="radio" value="female" />
            <span>女</span>
          </label>
          <label class="gender-item">
            <input v-model="userInfo.gender" type="radio" value="secret" />
            <span>保密</span>
          </label>
        </div>
      </div>

      <!-- 生日 -->
      <div class="form-item">
        <label>出生日期</label>
        <input v-model="userInfo.birthday" type="date" />
      </div>

      <!-- 保存按钮 -->
      <div class="form-item btn-row">
        <button class="save-btn" @click="handleSave">保存修改</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, onMounted } from "vue";
import { useUserStore } from "@/stores/user";
// 个人信息数据
const userInfo = reactive({
  username: "",
  name: "",
  signature: "",
  gender: "female",
  birthday: "2010-01-01",
});

const userStore = useUserStore();
const loadUserInfo = async () => {
  if (!userStore.user) {
    await userStore.getUserInfo();
  }
  if (!userStore.user) return;
  Object.assign(userInfo, {
    username: userStore.user.username,
    name: userStore.user.name,
    signature: userStore.user.signature,
    gender: userStore.user.gender,
  });
};

// 保存
const handleSave = () => {
  console.log("保存个人信息：", userInfo);
  alert("保存成功！");

  // 这里后续写接口请求即可
  // updateProfile(userInfo).then(...)
};

onMounted(() => {
  loadUserInfo();
});
</script>

<style scoped>
.account-page {
  padding: 10px 20px;
}

.account-card {
  /*   border: 1px solid var(--border-color);
  border-radius: 4px; */
  padding: 24px;
}

.form-item {
  display: flex;
  margin-bottom: 20px;
  align-items: center;
}

.form-item label {
  display: inline-block;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  margin-right: 10px;
  margin-bottom: 8px;
}

.form-item input,
.form-item textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid #e1b0b0;
  border-radius: 4px;
  background: #fff;
  color: #333;
  font-size: 14px;
  outline: none;
}

.form-item input:focus,
.form-item textarea:focus {
  border-color: #d62bc4;
}

.read-only {
  padding: 10px 12px;
  background: #f0f0f0;
  color: #666;
  border-radius: 4px;
}

.tip {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

/* 性别 */
.gender-group {
  display: flex;
  gap: 20px;
}

.gender-item {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: #d62bc4;
}

/* 按钮 */
.btn-row {
  margin-top: 30px;
}

.save-btn {
  padding: 10px 24px;
  background: #d62bc4;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.save-btn:hover {
  background: #c21aaf;
}
</style>
