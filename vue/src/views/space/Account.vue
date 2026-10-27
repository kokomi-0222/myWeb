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

      <!--
        邮箱：全站唯一的绑定 / 解绑入口。
        发布框和评论区的「去绑定」都跳到这里（/space/account?bind=1），
        页面里只留一行「邮箱 + 待验证 + 更换 / 解绑」，具体操作走弹窗（见 EmailBindPanel）。
      -->
      <div class="form-item">
        <label>邮箱:</label>
        <div class="email-box">
          <div class="email-line">
            <template v-if="boundEmail">
              <span class="email-text">{{ boundEmail }}</span>
              <span v-if="!emailVerified" class="email-badge">待验证</span>
              <button
                v-if="!emailVerified"
                type="button"
                class="email-link"
                @click="toggleBind('bind')"
              >
                去验证
              </button>
              <!--
                更换 / 解绑都要验当前密码（都会改写「找回密码」的凭据）。
                解绑不回收角色：账号照常发帖评论，只是不能再靠邮箱找回密码。
              -->
              <template v-else>
                <button
                  type="button"
                  class="email-link"
                  @click="toggleBind('change')"
                >
                  更换
                </button>
                <button
                  type="button"
                  class="email-link email-link--danger"
                  @click="toggleBind('unbind')"
                >
                  解绑
                </button>
              </template>
            </template>
            <template v-else>
              <span class="email-text email-text--empty">未绑定</span>
              <button
                type="button"
                class="email-link"
                @click="toggleBind('bind')"
              >
                去绑定
              </button>
            </template>
          </div>
        </div>
      </div>
      <!-- 弹窗（Teleport 到 body，DOM 位置不影响渲染），三种模式共用：绑定 / 更换 / 解绑 -->
      <EmailBindPanel
        v-if="bindOpen"
        :active="bindOpen"
        :mode="bindMode"
        @done="closeBind"
        @cancel="closeBind"
      />

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
import { ref, reactive, computed, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import { useUserStore } from "@/stores/user";
import { message } from "@/utils/message";
import setting from "@/config/setting";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import { uploadAvatar } from "@/api/file";
import { compressImages } from "@/utils/imageCompress";
import EmailBindPanel from "@/components/modules/EmailBindPanel.vue";
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
const route = useRoute();
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

// ==================== 邮箱（绑定 / 更换 / 解绑） ====================
/** 弹窗开关；真正的表单在 EmailBindPanel 里（Teleport 到 body，点蒙层不关闭） */
const bindOpen = ref(false);
/** bind = 绑定（没邮箱 / 有但没验证）；change = 更换；unbind = 解绑（后两个都要验当前密码） */
const bindMode = ref("bind");

const boundEmail = computed(() => userStore.user?.email || "");
/** 后端没给这个字段的老接口一律当已验证，避免已绑定的人被要求再验一次 */
const emailVerified = computed(() => userStore.user?.emailVerified !== false);

const toggleBind = (mode = "bind") => {
  bindMode.value = mode;
  bindOpen.value = true;
};

const closeBind = () => {
  bindOpen.value = false;
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
  // 从发布框 / 评论区的「去绑定」跳过来会带 ?bind=1，直接弹出绑定弹窗
  if (route.query.bind === "1") {
    if (emailVerified.value) {
      message.info("这个账号已经绑好邮箱了");
    } else {
      toggleBind("bind");
    }
  }
  // 已经在这一页时点「去绑定」不会重新挂载，靠事件再展开一次
  window.addEventListener("kokomi:open-bind", openBindFromEvent);
});

onUnmounted(() => {
  window.removeEventListener("kokomi:open-bind", openBindFromEvent);
});

function openBindFromEvent() {
  if (emailVerified.value && boundEmail.value) {
    message.info("这个账号已经绑好邮箱了");
    return;
  }
  toggleBind("bind");
}
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

/* ---- 邮箱行 ---- */
.email-box {
  flex: 1;
  min-width: 0;
}

.email-line {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  flex-wrap: wrap;
}

.email-text {
  font-size: 0.9rem;
  color: var(--text-primary);
  line-height: 1.5;
  word-break: break-all;
}

.email-text--empty {
  color: var(--text-secondary);
}

/* 「待验证」小标：和后台的胶囊标签同一个形状，不用另造一套 */
.email-badge {
  flex: none;
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--bg-nomarl);
  color: var(--text-secondary);
  font-size: 0.7rem;
  line-height: 18px;
}

/* 无边框文字按钮：邮箱这一行要「邮箱 + 两个动作」排得下又不抢眼，
   胶囊边框会让它看起来像待填的表单控件。hover 用底色反馈可点。 */
.email-link {
  flex: none;
  height: 26px;
  padding: 0 12px;
  /* 胶囊描边按钮：和站内其它「次要操作」一致，无边框看起来像纯文字链接、点不到 */
  border: 1px solid var(--border-color);
  border-radius: 13px;
  background: transparent;
  color: var(--primary-color);
  font-family: inherit;
  font-size: 0.78rem;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease;
}

.email-link:hover:not(:disabled) {
  border-color: var(--primary-color);
  background: var(--bg-hover);
}

/* 解绑是减法动作，用警示色区分，别和「更换」看起来一样 */
.email-link--danger {
  color: #ef4444;
}

.email-link--danger:hover:not(:disabled) {
  border-color: #ef4444;
  background: var(--bg-hover);
}

.email-link:disabled {
  color: var(--text-secondary);
  cursor: not-allowed;
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

  .email-box {
    width: 100%;
  }

  .gender-group {
    width: 100%;
    justify-content: flex-start;
  }

  .btn-row {
    flex-direction: column;
    align-items: stretch;
  }

  .save-btn {
    width: 100%;
  }
}
</style>
