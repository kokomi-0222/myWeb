<template>
  <div class="account-page">
    <div class="account-card">
      <!-- 头像 -->
      <div class="form-item">
        <label>头像:</label>
        <div class="avatar-upload">
          <!-- 预览当前头像 -->
          <div class="avatar-preview">
            <img :src="userInfo.avatar || '/default-avatar.png'" alt="头像" />
          </div>

          <!-- 上传按钮 -->
          <el-upload
            class="avatar-upload-btn"
            :show-file-list="false"
            :before-upload="beforeAvatarUpload"
            :auto-upload="false"
            @change="handleAvatarChange"
          >
            <el-button type="primary" size="small">更换头像</el-button>
          </el-upload>
        </div>
      </div>
      <!-- 昵称 -->
      <div class="form-item">
        <label>昵称:</label>
        <input
          class="name-input"
          v-model="userInfo.name"
          type="text"
          placeholder="请输入昵称"
        />
      </div>
      <!-- 用户名 -->
      <div class="form-item">
        <label>用户名:</label>
        <div class="username">{{ userInfo.username }}</div>
        <!--         <div class="tip">用户名不可修改</div> -->
      </div>

      <!-- 签名 -->
      <div class="form-item">
        <label>个性签名:</label>
        <textarea
          v-model="userInfo.signature"
          rows="3"
          placeholder="设置您的签名- ( ゜- ゜)つロ"
          :maxlength="setting.signatureMaxLength"
        ></textarea>
      </div>

      <!-- 性别 -->
      <div class="form-item">
        <label>性别:</label>
        <div class="gender-group">
          <div
            class="gender-item"
            :class="{ active: userInfo.gender === 'male' }"
            @click="() => (userInfo.gender = 'male')"
          >
            <span>男</span>
          </div>
          <div
            class="gender-item"
            :class="{ active: userInfo.gender === 'female' }"
            @click="() => (userInfo.gender = 'female')"
          >
            <span>女</span>
          </div>
          <div
            class="gender-item"
            :class="{ active: userInfo.gender === 'secret' }"
            @click="() => (userInfo.gender = 'secret')"
          >
            <span>保密</span>
          </div>
        </div>
      </div>

      <!-- 生日 -->

      <div class="form-item">
        <label>出生日期:</label>
        <el-config-provider :locale="zhCn">
          <el-date-picker
            v-model="userInfo.birthday"
            type="date"
            placeholder="选择出生日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            locale="zh-cn"
            :disabled-date="disabledFutureDate"
          />
        </el-config-provider>
      </div>

      <!-- 保存按钮 -->
      <div class="form-item btn-row">
        <Button class="save-btn" @click="handleSave" type="bilibili">保存</Button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, onMounted } from "vue";
import { useUserStore } from "@/stores/user";
import { message } from "@/utils/message";
import setting from "@/config/setting";
import zhCn from "element-plus/es/locale/lang/zh-cn";

// 个人信息数据
const userInfo = reactive({
  avatar: "",
  username: "",
  name: "",
  signature: "",
  gender: "",
  birthday: "",
});

const userStore = useUserStore();
const loadUserInfo = async () => {
  if (!userStore.user) {
    await userStore.getUserInfo();
  }
  if (!userStore.user) return;
  Object.assign(userInfo, {
    avatar: userStore.user.avatar,
    username: userStore.user.username,
    name: userStore.user.name,
    signature: userStore.user.signature,
    gender: userStore.user.gender,
    birthday: userStore.user.birthday,
  });
};

//禁止选择未来日期
const disabledFutureDate = (time) => {
  // 不能选今天 以后 的日期
  return time.getTime() > Date.now();
};



// 上传前校验（限制大小、格式）
const beforeAvatarUpload = (file) => {
  const isImage = file.type.startsWith('image/')
  const isLt2M = file.size / 1024 / 1024 < 2

  if (!isImage) {
    ElMessage.warning('只能上传图片！')
  }
  if (!isLt2M) {
    ElMessage.warning('头像不能超过 2MB！')
  }
  return isImage && isLt2M
}

// 选择图片后预览
const handleAvatarChange = (file) => {
  if (!file.raw) return

  // 本地预览
  const reader = new FileReader()
  reader.onload = (e) => {
    userInfo.value.avatar = e.target.result
  }
  reader.readAsDataURL(file.raw)
}


// 保存
const handleSave = () => {
  console.log("保存个人信息：", userInfo);
  message.success("保存成功！");

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
  padding: 24px;
}

.form-item {
  display: flex;
  margin-bottom: 30px;
  /*   align-items: center; */
}

.form-item label {
  display: inline-block;
  text-align: right;
  white-space: nowrap;
  line-height: 30px;
  margin-right: 20px;
  color: #606266;
  width: 90px;
}
.form-item input {
  width: 225px;
  height: 30px;
  box-sizing: border-box;
  padding: 2px 16px;
  border: 1px solid #c3c6ca;
  border-radius: 4px;
  background: #fff;
  color: #333;
  font-size: 14px;
  outline: none;
}

.form-item textarea {
  width: 600px;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid #c3c6ca;
  border-radius: 4px;
  background: #fff;
  color: #333;
  font-size: 0.9rem;
  outline: none;
  resize: none;
  line-height: 24px;
}

.form-item input:focus,
.form-item textarea:focus {
  border-color: var(--primary-color);
}

.read-only {
  padding: 10px 12px;
  background: #f0f0f0;
  color: #666;
  border-radius: 4px;
}

.username {
  font-size: 16px;
  color: #999;
  line-height: 30px;
}

/* 性别 */
.gender-group {
  display: flex;
  gap: 20px;
}

.gender-item {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  height: 30px;
  width: auto;
  color: #333;
  background: #fffefe;
  border: 1px solid #dbdbdb;
  gap: 4px;
  padding: 8px;
  font-size: 0.9rem;
  user-select: none;
  cursor: pointer;
}

.gender-item:hover {
  background: #e4e4e4;
}

.gender-item.active {
  color: #fff;
  background: var(--primary-color);
  border: 1px solid var(--primary-color);
}

/* 
.date-input {
  width: 225px;
  height: 30px;
  box-sizing: border-box;
  padding: 2px 10px;
  border: 1px solid #c3c6ca;
  border-radius: 4px;
  background: #fff;
  color: #333;
  font-size: 14px;
  outline: none;
}


.date-input:focus {
  border-color: var(--primary-color, #0099ff);
}


.date-input::-webkit-calendar-picker-indicator {
  opacity: 0.6;
  cursor: pointer;
}
 */
/* 按钮 */
.btn-row {
  margin-top: 30px;
}

.save-btn {
  padding: 10px 24px;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.avatar-upload {
  display: flex;
  align-items: center;
  gap: 15px;
}
.avatar-preview {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid #eee;
}
.avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
