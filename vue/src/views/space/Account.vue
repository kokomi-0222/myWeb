<template>
  <div class="account-page">
    <div class="account-card">
      <!-- 头像 -->
      <div class="form-item">
        <label>头像:</label>

        <div class="avatar-upload">
          <!-- 预览当前头像 -->
          <Avatar :src="userInfo?.avatar" alt="头像" :size="60" />
          <!-- 上传按钮 -->
          <Button type="bilibili" class="change-btn" @click="triggerAvatarChange">
            更换头像
            <input
              ref="avatarFileInput"
              type="file"
              accept="image/*"
              hidden
              @change="handleAvatarChange"
            />
          </Button>
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
import { ref, reactive, onMounted } from "vue";
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

const avatarFileInput = ref(null);
const avatarFile = ref(null);

//点击触发文件选择
const triggerAvatarChange = () => {
  avatarFileInput.value?.click();
};

// 选择头像
const handleAvatarChange = (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (file.size > setting.imageSize) {
    message.warning("头像不能超过 2MB！");
    e.target.value = ""; // 清空选择
    return;
  }

  avatarFile.value = file;
  const previewUrl = URL.createObjectURL(file);
  userInfo.avatar = previewUrl;
};

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

/* 按钮 */
.btn-row {
  justify-content: center;
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
  display: inline-block;
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

.change-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 10px;
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

@media (max-width: 768px) {
  .account-page {
    padding: 10px 12px;
  }

  .account-card {
    padding: 16px 12px;
  }

  .form-item {
    flex-direction: column; /* 竖排：标签在上，输入框在下 */
    margin-bottom: 20px;
  }

  .form-item label {
    text-align: left;
    margin-bottom: 6px;
    margin-right: 0;
  }

  .form-item textarea {
    width: 100%;
  }

  .gender-group {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
