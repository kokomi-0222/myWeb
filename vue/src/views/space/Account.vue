<template>
  <div class="account-page">
    <div class="account-card">
      <!-- 头像 -->
      <div class="form-item">
        <label>头像:</label>

        <div class="avatar-upload">
          <!-- 预览当前头像 -->
          <Avatar :src="userInfo?.avatar" :key="userInfo?.avatar" alt="头像" :size="60" />
          <div class="progress-bar" v-if="showProgress">
            <div class="progress" :style="{ width: progress + '%' }"></div>
          </div>
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
          :maxlength="setting.nameMaxLength"
          class="name-input"
          v-model="userInfo.name"
          type="text"
          placeholder="请输入昵称"
        />
        <div class="tip">
          注：昵称长度不能超过 12 个字符
        </div>
      </div>
      <!-- 用户名 -->
      <div class="form-item">
        <label>用户名:</label>
        <div class="username">{{ userInfo.username }}</div>
       <!--  <div class="tip">不可修改</div> -->
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
import { uploadAvatar } from "@/api/file";
import { compressImages } from "@/utils/imageCompress";
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
const progress = ref(0); // 进度百分比
const showProgress = ref(false); // 是否显示进度条
//点击触发文件选择
const triggerAvatarChange = () => {
  avatarFileInput.value?.click();
};

// 选择头像
const handleAvatarChange = async (e) => {
  const picked = e.target.files?.[0];
  e.target.value = "";
  if (!picked) return;

  // 服务器（Nginx）的请求体上限是 2MB，超了会在网络层被 413 拦掉，
  // 前端完全拿不到响应。所以选图后先压到上限以内，压不动的再明确提示。
  const { files, compressedCount, failed, skippedAnimated } = await compressImages(
    [picked],
    setting.imageSize
  );
  if (failed.length || !files.length) {
    message.warning(
      skippedAnimated.length
        ? `GIF 动图无法自动压缩，请换一张静态图（上限 ${setting.imageSizeText}）`
        : `图片压缩后仍超过 ${setting.imageSizeText}，请换一张`
    );
    return;
  }
  const file = files[0];
  if (compressedCount) {
    message.success(`头像已自动压缩到 ${setting.imageSizeText} 以内`);
  }

  // 开启进度条
  showProgress.value = true;
  progress.value = 0;

  try {
    // 上传并带进度监听
    const res = await uploadAvatar(file, (event) => {
      const percent = Math.floor((event.loaded / event.total) * 100);
      progress.value = percent;
    });

    if (!setting.successCode.includes(res.code)) {
      message.error(res.message);
      return;
    }
    userInfo.avatar = res.data;
    progress.value = 100;
  } catch (err) {
    console.error(err);
    // 413 等已在请求层给出过明确提示，这里不再重复弹「上传失败」
    if (!err?.handled) {
      message.error("上传失败");
    }
  } finally {
    // 延迟消失，更自然
    setTimeout(() => {
      showProgress.value = false;
    }, 500);
    avatarFileInput.value.value = "";
  }
};

// 保存
const handleSave = async () => {
  if (!userInfo.avatar) {
    message.warning("请选择头像");
    return;
  }
  if (!userInfo.name) {
    message.warning("请填写昵称");
    return;
  }
 

  // 等待接口执行完
  const res = await userStore.updateProfile(userInfo)
  if (res?.success) {
    message.success("保存成功！")
  } 
}

onMounted(async () => {
  await loadUserInfo();
});
</script>

<style scoped>
.account-page {
  padding: 0;
}

.account-card {
  padding: 24px 24px 20px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.form-item {
  display: flex;
  align-items: flex-start;
  margin-bottom: 24px;
}

.tip {
  margin-left: 12px;
  color: var(--text-secondary);
  font-size: 0.8rem;
  display: inline-block;
  line-height: 36px;
}

.form-item label {
  display: inline-block;
  text-align: right;
  white-space: nowrap;
  line-height: 36px;
  margin-right: 16px;
  color: var(--text-secondary);
  width: 80px;
  flex-shrink: 0;
}

.form-item input {
  width: 260px;
  height: 36px;
  box-sizing: border-box;
  padding: 2px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.form-item input:focus,
.form-item textarea:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px var(--primary-color-soft);
}

.form-item textarea {
  width: min(600px, 100%);
  box-sizing: border-box;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.9rem;
  outline: none;
  resize: none;
  line-height: 24px;
  font-family: inherit;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.read-only {
  padding: 10px 12px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border-radius: 8px;
}

.username {
  font-size: 15px;
  color: var(--text-secondary);
  line-height: 36px;
}

/* 性别：胶囊选择 */
.gender-group {
  display: flex;
  gap: 10px;
}

.gender-item {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  height: 32px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  padding: 0 18px;
  font-size: 0.9rem;
  user-select: none;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
}

.gender-item:hover {
  color: var(--primary-color);
  border-color: var(--primary-color);
}

.gender-item.active {
  color: #fff;
  background: var(--primary-color);
  border: 1px solid var(--primary-color);
}

/* 按钮 */
.btn-row {
  justify-content: flex-end;
  margin-top: 8px;
  padding-top: 20px;
  border-top: 1px solid var(--border-color);
}

.save-btn {
  padding: 9px 28px;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.avatar-upload {
  display: inline-block;
}

.change-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 10px;
  padding: 5px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
}

.progress-bar {
  width: 100%;
  height: 6px;
  background: var(--bg-hover);
  border-radius: 3px;
  margin-top: 10px;
  overflow: hidden;
}

.progress {
  height: 100%;
  background: var(--primary-color);
  transition: width 0.1s;
}

@media (max-width: 768px) {
  .account-page {
    padding: 0;
  }

  .account-card {
    padding: 16px 14px;
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

  .form-item input {
    width: 100%;
  }

  .form-item textarea {
    width: 100%;
  }

  .gender-group {
    width: 100%;
    justify-content: flex-start;
  }

  /* 保存键不占整行：留在右下角，宽度按文字走（铺满一整条会像页面底部的横幅） */
  .btn-row {
    flex-direction: row;
    justify-content: flex-end;
    align-items: center;
  }

  .save-btn {
    width: auto;
    min-width: 96px;
  }
}
</style>
