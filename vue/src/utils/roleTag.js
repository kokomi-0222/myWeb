// utils/roleTag.js
// 身份标签（名字旁边那个方块 / 帖子里的胶囊）的公共逻辑。
//
// 颜色规则（2026-10-26 与用户确认，第二版）：
//   1. 用户被后台单独设了 roleColor → 用它
//   2. 没设 → 用 ROLE_DEFAULT_COLORS 里该角色的颜色
//   3. 自建角色不在表里 → 才回退 nameColor / 粉色
//
// ⚠️ 第 2 步是补上的。以前「没设 roleColor 就用 nameColor」，
// 而 name_color 默认是近黑的 #18191c —— 结果游客、普通用户、会员
// 全是同一个黑块，等级完全看不出来（用户原话：「普通用户的牌子不要用黑色，
// 黑色给游客用」）。name_color 是**名字**的颜色，不该拿来当身份底色。

import { reactive } from "vue";

/** 角色编码 → 中文名。后台建的自定义角色走 setRoleLabels 注入的映射 */
export const ROLE_LABELS = {
  admin: "管理员",
  moderator: "版主",
  editor: "编辑",
  vip: "会员",
  member: "普通用户",
  guest: "游客",
};

/**
 * 角色默认底色。后台没单独设 roleColor 时用它。
 * 定色理由：
 *   admin / moderator / editor 沿用原来的品牌粉（管理团队同色系）；
 *   vip 金色，和空间页「会员」提示卡、IconCrown 呼应；
 *   member 主题蓝 —— 普通用户是绝大多数，用最中性的品牌色；
 *   guest 深灰偏黑 —— 「还没验证」的状态，越不抢眼越好。
 */
export const ROLE_DEFAULT_COLORS = {
  admin: "#e966b2",
  moderator: "#e966b2",
  editor: "#e966b2",
  vip: "#e6a23c",
  member: "#00aeec",
  guest: "#4e5969",
};

/** 取角色默认色；自建角色返回空串，交给调用方继续兜底 */
export function roleDefaultColor(code) {
  return (code && ROLE_DEFAULT_COLORS[code]) || "";
}

/**
 * 后端下发的角色名字典（stores/role.js 拉到 /role/list 后注入）。
 * 用 reactive 而不是普通对象：字典是异步到的，模板要在它到了之后自动重渲染，
 * 否则首屏会先显示编码、再也不会变回中文。
 */
const dynamicLabels = reactive({});

export function setRoleLabels(map) {
  for (const key of Object.keys(dynamicLabels)) {
    delete dynamicLabels[key];
  }
  Object.assign(dynamicLabels, map && typeof map === "object" ? map : {});
}

/** 帖子/主页胶囊标签的默认色（沿用原来写死的粉） */
export const DEFAULT_ROLE_TAG_COLOR = "#fb7299";

/**
 * 不挂标签的角色：普通用户挂上去每篇帖子都是噪音。
 * 游客要挂 —— 「还没验证」是需要让看帖人知道的状态，而且游客现在发不了帖，
 * 只有历史帖或降级后的账号会出现，不构成噪音。
 */
const SILENT_ROLES = new Set(["", "member"]);

export function roleLabelOf(code) {
  if (!code) return "";
  // 后端说了算（后台可以改角色中文名），拿不到再退回前端写死的兜底表
  return dynamicLabels[code] || ROLE_LABELS[code] || code;
}

export function shouldShowRoleTag(code) {
  return !!code && !SILENT_ROLES.has(code);
}

/**
 * 把颜色规整成 #RRGGBB。
 * 兼容 3 位简写（老数据里有 name_color = '#333'），
 * 认不出来的一律返回空串，交给调用方走默认。
 */
export function normalizeHex(value) {
  if (typeof value !== "string") return "";
  const v = value.trim();
  const long = /^#([0-9a-fA-F]{6})$/.exec(v);
  if (long) return `#${long[1].toLowerCase()}`;
  const short = /^#([0-9a-fA-F]{3})$/.exec(v);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return "";
}

/** #RRGGBB → rgba(r,g,b,a)，用于做柔和的浅色底 */
export function hexToRgba(hex, alpha = 0.12) {
  const h = normalizeHex(hex);
  if (!h) return "";
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 根据底色亮度选黑字还是白字。
 * 后台可以挑任意颜色，浅色底配原来的白字会直接看不见，所以文字色得算出来。
 */
export function contrastText(hex) {
  const h = normalizeHex(hex);
  if (!h) return "";
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  // 人眼感知亮度（YIQ 公式），150 是常用的黑/白分界
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#18191c" : "#ffffff";
}

/**
 * 名字色在**当前主题**下能不能看清。
 *
 * name_color 是用户/后台选的固定色，不随主题变。但站点有明暗两套底色：
 * 默认的 #636161 在暗色下几乎糊在背景里，后台给人设成纯白的话亮色下又看不见。
 * 所以只在「明显看不清」时兜底换掉，其它情况原样保留（尊重用户选的颜色）。
 *
 * @param {string} hex      用户/后台设的名字色
 * @param {boolean} isDark  当前是否暗色模式
 * @returns {string} 可直接用在 style 里的颜色；空串表示交给 CSS 默认
 */
export function readableNameColor(hex, isDark) {
  const h = normalizeHex(hex);
  if (!h) return "";
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  // 暗色底色约 #18191c（亮度 ≈ 25），110 以下对比度不足 4.5:1；
  // 注意老用户默认的 #636161 亮度是 98，正好在这条线下面 —— 它本来就该被提亮。
  // 亮色底色约 #ffffff，220 以上同理。
  if (isDark && yiq < 110) return "#e5e6eb";
  if (!isDark && yiq > 220) return "#18191c";
  return h;
}

/**
 * 「我的空间」那个方块的底色，优先级：
 *   后台单独设的 roleColor → 角色默认色 → nameColor → 空（交给 CSS）
 * nameColor 只留作自建角色的最后兜底 —— 它不是身份色。
 */
export function roleBlockColor(roleColor, nameColor, roleCode) {
  return (
    normalizeHex(roleColor) ||
    roleDefaultColor(roleCode) ||
    normalizeHex(nameColor) ||
    ""
  );
}

/**
 * 帖子 / 他人主页胶囊标签的样式：文字用原色，底色用 12% 透明度。
 * 和原来写死的 `color:#fb7299; background:rgba(251,114,153,.12)` 是同一套观感，
 * 换成任意颜色都不会出现「白字白底」的情况。
 */
export function rolePillStyle(roleColor, roleCode) {
  const color =
    normalizeHex(roleColor) || roleDefaultColor(roleCode) || DEFAULT_ROLE_TAG_COLOR;
  return {
    color,
    background: hexToRgba(color, 0.12),
  };
}
