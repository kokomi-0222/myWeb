<template>
  <!-- 蒙层 -->
  <Transition name="modal">
    <!-- 蒙层：点外面**不关闭**（以前 @click.self 会关，鼠标一抖就把填了一半的表单、
         注册第二步的 ticket 一起丢掉）。要关只能点右上角 ×。 -->
    <div v-if="uiStore.loginModalOpen" class="modal-overlay">
      <div class="modal-container" :key="formType">
        <!-- 关闭按钮 -->
        <button class="modal-close" aria-label="关闭" @click="closeModal">
          <IconClose />
        </button>

        <!-- 登录 -->
        <div v-if="formType === 'login'" class="form-body">
          <div class="form-header">
            <h2 class="form-title">欢迎回来</h2>
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
            <span class="link-dot">·</span>
            <span class="link-text" @click="goToForgot">忘记密码</span>
          </div>
        </div>

        <!--
          注册：两步。
          第 1 步只验邮箱（发码 + 输码 → 换一张 10 分钟的 ticket），
          第 2 步才是用户名和密码。这样「邮箱是不是他的」在建号之前就有答案，
          新号落地就是 member，不存在「注册完什么都干不了」的空窗期。
          不再要图形验证码：邮件都验了，再加一道图灵测试只是给真人添麻烦。
        -->
        <div v-else-if="formType === 'register'" autocomplete="off" class="form-body">
          <div class="form-header">
            <h2 class="form-title">
              {{ regStep === 1 ? "创建账号" : "设置登录密码" }}
            </h2>
          </div>
          <div
            style="width: 0; height: 0; overflow: hidden; position: absolute; z-index: -1"
          >
            <input type="text" autocomplete="username" />
            <input type="password" autocomplete="current-password" />
          </div>

          <!-- ---------- 第 1 步：邮箱 + 验证码 ---------- -->
          <template v-if="regStep === 1">
            <div class="form-item">
              <div class="captcha-row">
                <InputLine
                  v-model="registerForm.email"
                  label="邮箱"
                  type="email"
                  autocomplete="off"
                  @focus="regErr.email = ''"
                  @keyup.enter="handleSendRegCode"
                />
                <button
                  type="button"
                  class="reset-send"
                  :disabled="regCountdown > 0 || sendingRegCode"
                  @click="handleSendRegCode"
                >
                  <template v-if="sendingRegCode">发送中</template>
                  <template v-else-if="regCountdown > 0">{{ regCountdown }}s</template>
                  <template v-else>发送验证码</template>
                </button>
              </div>
              <div v-if="regErr.email" class="err-tip">{{ regErr.email }}</div>
            </div>

            <div class="form-item">
              <InputLine
                v-model="registerForm.emailCode"
                label="邮箱验证码（6 位）"
                type="text"
                maxlength="6"
                autocomplete="one-time-code"
                @focus="regErr.emailCode = ''"
                @keyup.enter="handleVerifyEmail"
              />
              <div v-if="regErr.emailCode" class="err-tip">{{ regErr.emailCode }}</div>
              <p v-if="regDevCode" class="reset-dev">本地调试码：<b>{{ regDevCode }}</b></p>
            </div>

            <Button
              class="submit-button"
              type="bilibili"
              :disabled="verifyingEmail"
              @click="handleVerifyEmail"
            >
              <span>{{ verifyingEmail ? "验证中…" : "下 一 步" }}</span>
            </Button>
          </template>

          <!-- ---------- 第 2 步：只设密码 ---------- -->
          <template v-else>
            <!-- 这里不显示第一步验过的邮箱：用户刚填完、记得住，再摆一遍纯属占位。
                 要换邮箱就关掉弹窗重来（重开时 ticket 会被清掉，必须重新验码）。 -->
            <div class="form-item">
              <InputLine
                ref="regPwdRef"
                v-model="registerForm.password"
                label="密码（至少 6 位）"
                type="password"
                autocomplete="new-password"
                @focus="regErr.password = ''"
                @keyup.enter="handleRegister"
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
                @keyup.enter="handleRegister"
              />
              <div v-if="regErr.confirmPassword" class="err-tip">
                {{ regErr.confirmPassword }}
              </div>
            </div>

            <Button
              class="submit-button"
              type="bilibili"
              :disabled="registering"
              @click="handleRegister"
            >
              <span>{{ registering ? "注册中…" : "完 成 注 册" }}</span>
            </Button>
          </template>

          <div class="footer-link">
            已有账号?
            <span class="link-text" @click="goToLogin">返回登录</span>
          </div>
        </div>

        <!-- 找回密码：登录不了才来这儿，所以整条链路都不需要 token -->
        <div v-else class="form-body" autocomplete="off">
          <div class="form-header">
            <h2 class="form-title">找回密码</h2>
            <p class="form-subtitle">用绑定的邮箱收验证码，重置后其它设备会退出登录</p>
          </div>

          <div class="form-item">
            <div class="captcha-row">
              <InputLine
                v-model="forgotForm.email"
                label="绑定邮箱"
                type="email"
                @focus="forgotErr.email = ''"
                @keyup.enter="handleSendReset"
              />
              <button
                type="button"
                class="reset-send"
                :disabled="resetCountdown > 0 || sendingReset"
                @click="handleSendReset"
              >
                <template v-if="sendingReset">发送中</template>
                <template v-else-if="resetCountdown > 0">{{ resetCountdown }}s</template>
                <template v-else>发送验证码</template>
              </button>
            </div>
            <div v-if="forgotErr.email" class="err-tip">{{ forgotErr.email }}</div>
          </div>

          <div class="form-item">
            <InputLine
              v-model="forgotForm.code"
              label="6 位验证码"
              type="text"
              maxlength="6"
              @focus="forgotErr.code = ''"
              @keyup.enter="handleReset"
            />
            <div v-if="forgotErr.code" class="err-tip">{{ forgotErr.code }}</div>
          </div>

          <div class="form-item">
            <InputLine
              v-model="forgotForm.newPassword"
              label="新密码（至少 6 位）"
              type="password"
              @focus="forgotErr.password = ''"
            />
            <div v-if="forgotErr.password" class="err-tip">{{ forgotErr.password }}</div>
          </div>

          <div class="form-item">
            <InputLine
              v-model="forgotForm.confirmPassword"
              label="确认新密码"
              type="password"
              @focus="forgotErr.password = ''"
            />
          </div>

          <p v-if="resetDevCode" class="reset-dev">
            本地开发模式（未配 SMTP）：验证码是 <b>{{ resetDevCode }}</b>
          </p>

          <Button
            class="submit-button"
            type="bilibili"
            :disabled="resetting"
            @click="handleReset"
          >
            <span>{{ resetting ? "重置中…" : "重 置 密 码" }}</span>
          </Button>

          <div v-if="forgotErr.general" class="err-tip err-tip--center">
            {{ forgotErr.general }}
          </div>

          <div class="footer-link">
            想起来了?
            <span class="link-text" @click="goToLogin">返回登录</span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, watch, onUnmounted } from "vue";
import { useUIStore } from "@/stores/ui";
import { useUserStore } from "@/stores/user";
import { message } from "@/utils/message";
import { getCaptcha } from "@/api/captcha";
import { sendResetCode, resetPassword, sendRegisterCode, verifyRegisterEmail } from "@/api/user";
import IconClose from "@/components/icons/IconClose.vue";
import router from "@/router";

const uiStore = useUIStore();
const userStore = useUserStore();
const formType = ref<"login" | "register" | "forgot">("login");
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
// 两步：① 邮箱 + 验证码 → 换 ticket；② 密码 → 建号。
// 邮箱在注册时就必须验证，所以新号一落地就是普通用户，
// 能直接发帖评论，不用再跑一趟个人中心。
// 用户名不在这里填 —— 由后端生成 kokomi_xxxxxxxx（见 UserServiceImpl.randomUsername）。
const regStep = ref<1 | 2>(1);
/** 第一步验完邮箱后拿到的凭证（10 分钟有效），第二步建号带上它 */
const regTicket = ref("");
const verifyingEmail = ref(false);
const registerForm = reactive({
  email: "",
  emailCode: "",
  password: "",
  confirmPassword: "",
});

const regErr = ref({
  email: "",
  emailCode: "",
  password: "",
  confirmPassword: "",
});

// 注册邮箱验证码：和「找回密码」是两套独立倒计时，两个表单不会同时出现
const regCountdown = ref(0);
const sendingRegCode = ref(false);
/** 本地没配 SMTP 时后端会把明文验证码回显，方便调试 */
const regDevCode = ref("");
let regTimer: ReturnType<typeof setInterval> | null = null;

const clearRegTimer = () => {
  if (regTimer) {
    clearInterval(regTimer);
    regTimer = null;
  }
};

const startRegCountdown = (seconds: number) => {
  clearRegTimer();
  regCountdown.value = Math.max(0, Number(seconds) || 0);
  if (regCountdown.value <= 0) return;
  regTimer = setInterval(() => {
    regCountdown.value -= 1;
    if (regCountdown.value <= 0) clearRegTimer();
  }, 1000);
};

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
      // 从「修改密码」页点「忘记密码」进来时直接落在找回密码那一屏
      if (uiStore.loginModalMode === "forgot") {
        formType.value = "forgot";
        resetForgotState();
      }
      fetchCaptcha();
    }
  }
);

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

/** 第 1 步：只校验邮箱 + 验证码（密码还没填呢） */
const validateRegisterStep1 = (): boolean => {
  let ok = true;
  regErr.value.email = "";
  regErr.value.emailCode = "";

  const mail = registerForm.email.trim();
  if (!mail) {
    regErr.value.email = "请输入邮箱";
    ok = false;
  } else if (!EMAIL_RE.test(mail)) {
    regErr.value.email = "邮箱格式不对，检查一下";
    ok = false;
  }

  const mailCode = registerForm.emailCode.replace(/\D/g, "").slice(0, 6);
  if (!mailCode) {
    regErr.value.emailCode = "请输入邮箱里收到的 6 位验证码";
    ok = false;
  } else if (mailCode.length !== 6) {
    regErr.value.emailCode = "验证码是 6 位数字";
    ok = false;
  }

  return ok;
};

/** 第 2 步：只校验两次密码是否一致 —— 用户名由后端生成 */
const validateRegisterStep2 = (): boolean => {
  let ok = true;
  regErr.value.password = "";
  regErr.value.confirmPassword = "";

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

/**
 * 发注册验证码。
 * <p>
 * 和「找回密码」相反，这个接口对「邮箱已被占用」是**直接报错**的：
 * 注册场景瞒着用户没意义，他填完码提交还是会失败，不如在发码这一步就说清楚。
 */
const handleSendRegCode = async () => {
  if (sendingRegCode.value || regCountdown.value > 0) return;
  const mail = registerForm.email.trim();
  regErr.value.email = "";
  regErr.value.emailCode = "";
  if (!mail) {
    regErr.value.email = "请先填写邮箱";
    return;
  }
  if (!EMAIL_RE.test(mail)) {
    regErr.value.email = "邮箱格式不对，检查一下";
    return;
  }

  sendingRegCode.value = true;
  try {
    const res = await sendRegisterCode(mail);
    const data = res?.data || {};
    regDevCode.value = data.devCode || "";
    if (data.sent) {
      // 重发即废旧码（后端只认最新一封）：把输入框里已经填了的旧码清掉，
      // 免得用户拿着上一条邮件的码去验证、被回一句「验证码已更新」还得自己复盘
      registerForm.emailCode = "";
      regErr.value.emailCode = "";
      message.success(data.message || "验证码已发送");
    } else if (!data.retryAfter) {
      // retryAfter > 0 表示「还在冷却中」，这不算错误，用一个普通提示就够
      regErr.value.email = data.message || "验证码发送失败，请稍后重试";
    }
    startRegCountdown(data.retryAfter || (data.sent ? 60 : 0));
  } catch (e: any) {
    regErr.value.email = e?.message || "验证码发送失败，请稍后重试";
  } finally {
    sendingRegCode.value = false;
  }
};

/**
 * 第 1 步 → 第 2 步：校验邮箱验证码，换一张 ticket。
 * <p>
 * 为什么不把验证码留到建号时一起交：第一步验完还会继续走第二步（设密码），
 * 中间任何一步失败都不该让用户重收邮件。ticket 只绑定邮箱、30 分钟内可反复重试。
 */
const handleVerifyEmail = async () => {
  if (verifyingEmail.value) return;
  if (!validateRegisterStep1()) return;

  verifyingEmail.value = true;
  try {
    const mail = registerForm.email.trim();
    const code = registerForm.emailCode.replace(/\D/g, "").slice(0, 6);
    const res = await verifyRegisterEmail(mail, code);
    const ticket = res?.data?.ticket || "";
    if (!ticket) {
      regErr.value.emailCode = "验证失败，请重新获取验证码";
      return;
    }
    regTicket.value = ticket;
    regStep.value = 2;
    nextTick(() => {
      regPwdRef.value?.input?.focus?.();
    });
  } catch (e: any) {
    const msg = e?.message || "验证失败，请稍后重试";
    // 「该邮箱已被注册」落在邮箱框，「验证码不对」落在验证码框
    if (msg.includes("邮箱")) regErr.value.email = msg;
    else regErr.value.emailCode = msg;
  } finally {
    verifyingEmail.value = false;
  }
};

const handleRegister = async () => {
  if (registering.value) return;
  if (!regTicket.value) {
    regStep.value = 1;
    regErr.value.emailCode = "邮箱验证已过期，请重新验证";
    return;
  }
  if (!validateRegisterStep2()) return;

  registering.value = true;
  try {
    const res = await userStore.register({
      ticket: regTicket.value,
      password: registerForm.password,
      confirmPassword: registerForm.confirmPassword,
    });
    if (res.success) {
      // 注册接口直接返回 token，此时已经登录上了 —— 不用再让用户输一遍密码
      clearRegTimer();
      message.success("注册成功，欢迎加入");
      uiStore.closeLoginModal();
      // 整页刷一次：和登录成功保持同一套收尾，避免「刚登录那几秒权限还没进内存」
      router.push("/").then(() => {
        router.go(0);
      });
    } else {
      // 用户名不再由用户填，所以不会再有「用户名被占用」这类错误；
      // 剩下的失败基本是 ticket 过期或邮箱在十分钟内被别人注册 → 退回第 1 步重验
      const msg = res.message || "注册失败";
      if (msg.includes("邮箱") || msg.includes("过期")) {
        // 邮箱在这十分钟里被别人注册了，或者 ticket 过期 → 退回第 1 步重验
        regErr.value.email = msg;
        regStep.value = 1;
        regTicket.value = "";
        registerForm.emailCode = "";
      } else {
        message.error(msg);
      }
    }
  } catch (err) {
    message.error("注册异常");
  } finally {
    registering.value = false;
  }
};

// ================ 找回密码 ================
// 走的是「绑定邮箱 + 验证码」，和绑定流程共用同一套发码限流（EmailCodeCache），
// 所以不用担心这里变成发信机。
const forgotForm = reactive({
  email: "",
  code: "",
  newPassword: "",
  confirmPassword: "",
});
const forgotErr = ref({
  email: "",
  code: "",
  password: "",
  general: "",
});
const resetCountdown = ref(0);
const sendingReset = ref(false);
const resetting = ref(false);
const resetDevCode = ref("");

let resetTimer: ReturnType<typeof setInterval> | null = null;

const clearResetTimer = () => {
  if (resetTimer) {
    clearInterval(resetTimer);
    resetTimer = null;
  }
};

const startResetCountdown = (seconds: number) => {
  clearResetTimer();
  resetCountdown.value = Math.max(0, Number(seconds) || 0);
  if (resetCountdown.value <= 0) return;
  resetTimer = setInterval(() => {
    resetCountdown.value -= 1;
    if (resetCountdown.value <= 0) clearResetTimer();
  }, 1000);
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const handleSendReset = async () => {
  if (sendingReset.value || resetCountdown.value > 0) return;
  const email = forgotForm.email.trim();
  forgotErr.value.email = "";
  forgotErr.value.general = "";
  if (!email) {
    forgotErr.value.email = "请输入绑定过的邮箱";
    return;
  }
  if (!EMAIL_RE.test(email)) {
    forgotErr.value.email = "邮箱格式不对，检查一下";
    return;
  }
  sendingReset.value = true;
  try {
    const res = await sendResetCode(email);
    const data = res?.data || {};
    resetDevCode.value = data.devCode || "";
    if (data.sent) {
      // 重发即废旧码（后端只认最新一封）：清掉框里的旧码
      forgotForm.code = "";
      forgotErr.value.code = "";
      message.success(data.message || "验证码已发送");
    } else if (!data.retryAfter) {
      forgotErr.value.email = data.message || "验证码发送失败，请稍后重试";
    }
    startResetCountdown(data.retryAfter || (data.sent ? 60 : 0));
  } catch (e: any) {
    forgotErr.value.email = e?.message || "验证码发送失败，请稍后重试";
  } finally {
    sendingReset.value = false;
  }
};

const handleReset = async () => {
  if (resetting.value) return;
  const email = forgotForm.email.trim();
  const code = forgotForm.code.replace(/\D/g, "").slice(0, 6);
  const pwd = forgotForm.newPassword;
  forgotErr.value = { email: "", code: "", password: "", general: "" };

  if (!EMAIL_RE.test(email)) {
    forgotErr.value.email = "请先填写并发送验证码到你的邮箱";
    return;
  }
  if (code.length !== 6) {
    forgotErr.value.code = "请输入 6 位验证码";
    return;
  }
  if (!pwd || pwd.length < 6) {
    forgotErr.value.password = "新密码至少 6 位";
    return;
  }
  if (pwd.length > 32) {
    forgotErr.value.password = "新密码不超过 32 位";
    return;
  }
  if (pwd !== forgotForm.confirmPassword) {
    forgotErr.value.password = "两次输入的新密码不一致";
    return;
  }

  resetting.value = true;
  try {
    await resetPassword(email, code, {
      newPassword: pwd,
      confirmPassword: forgotForm.confirmPassword,
    });
    message.success("密码已重置，请用新密码登录");
    // 邮箱本身也能当账号登录（后端 selectByAccount 三选一），顺手帮用户填好
    loginForm.account = email;
    loginForm.password = "";
    goToLogin();
  } catch (e: any) {
    // 验证码错/过期是后端给的具体文案，放在验证码下面；其余归到通用提示
    const msg = e?.message || "重置失败，请稍后重试";
    if (/验证码/.test(msg)) {
      forgotErr.value.code = msg;
      forgotForm.code = "";
    } else {
      forgotErr.value.general = msg;
    }
  } finally {
    resetting.value = false;
  }
};

const resetForgotState = () => {
  forgotForm.email = "";
  forgotForm.code = "";
  forgotForm.newPassword = "";
  forgotForm.confirmPassword = "";
  forgotErr.value = { email: "", code: "", password: "", general: "" };
  resetDevCode.value = "";
  clearResetTimer();
  resetCountdown.value = 0;
};

const goToForgot = () => {
  formType.value = "forgot";
  resetForgotState();
  // 用户可能是从「登录失败」过来的，把刚输的账号带过去省一次手打
  const typed = loginForm.account.trim();
  if (typed.includes("@")) forgotForm.email = typed;
};

onUnmounted(() => {
  clearResetTimer();
  clearRegTimer();
});

// ================ 弹窗控制 ================
/** 清空注册表单 + 发码状态（倒计时一定要停，否则关了弹窗还在后台 tick） */
const resetRegisterState = () => {
  regStep.value = 1;
  regTicket.value = "";
  verifyingEmail.value = false;
  registerForm.email = "";
  registerForm.emailCode = "";
  registerForm.password = "";
  registerForm.confirmPassword = "";
  regErr.value = { email: "", emailCode: "", password: "", confirmPassword: "" };
  regDevCode.value = "";
  regCountdown.value = 0;
  clearRegTimer();
};
const closeModal = () => {  uiStore.closeLoginModal();
  formType.value = "login";
  loginForm.account = "";
  loginForm.password = "";
  loginErr.value = { account: "", password: "" };
  resetRegisterState();
  captchaCode.value = "";
  captchaErr.value = "";
  resetForgotState();
};

const goToRegister = () => {
  formType.value = "register";
  resetRegisterState();
  // 注册不需要图形验证码（邮箱验证码就是那道闸），所以这里不拉图
};

const goToLogin = () => {
  formType.value = "login";
  captchaErr.value = "";
  // 注册成功后把邮箱填进去，省得手再打一遍（很多人注册完就直接去登录了）
  if (registerForm.email.trim()) {
    loginForm.account = registerForm.email.trim();
  }
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
  /* 注册表单比登录多三行（邮箱 / 邮箱验证码 / 图形验证码），
     矮屏手机上必须能滚，否则「注册」按钮会被顶出视口 */
  max-height: calc(100vh - 32px);
  overflow-y: auto;
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

/* 登录页脚里两个链接之间的分隔点 */
.link-dot {
  margin: 0 6px;
  color: var(--text-secondary);
}

/* 找回密码：发码按钮钉在邮箱输入框右边（和图形验证码那一行同一个排法） */
.reset-send {
  flex: 0 0 auto;
  height: 40px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--primary-color);
  font-family: inherit;
  font-size: 0.78rem;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}

.reset-send:hover:not(:disabled) {
  border-color: var(--primary-color);
}

.reset-send:disabled {
  color: var(--text-secondary);
  cursor: not-allowed;
}

/* 本地开发模式下的明文验证码提示 */
.reset-dev {
  margin: -6px 0 0;
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--bg-nomarl);
  color: var(--text-secondary);
  font-size: 0.72rem;
  line-height: 1.5;
}

.reset-dev b {
  color: var(--primary-color);
  letter-spacing: 1px;
}

.err-tip--center {
  text-align: center;
}

.link-text {
  /* 左边留 4px：模板里「还没有账号?」和链接之间没有空格，不加会挤成「还没有账号?立即注册」 */
  margin-left: 4px;
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
