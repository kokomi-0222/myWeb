// utils/roleTag.js
// 身份标签（名字旁边那个方块 / 帖子里的胶囊）的公共逻辑。
//
// 颜色规则（2026-10-23 与用户确认）：
//   1. 用户/该用户被后台单独设了 roleColor → 用它
//   2. 没设 → 保持项目原来的视觉：
//        · 「我的空间」那个方块沿用 nameColor（历史行为）
//        · 帖子 / 他人主页的胶囊用默认粉 #fb7299
//   这样老数据一行不用改，界面看起来和拆字段前一模一样。

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

/** 不挂标签的角色：普通用户挂上去每篇帖子都是噪音 */
const SILENT_ROLES = new Set(["", "member", "guest"]);

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
 * 「我的空间」那个方块的底色：
 * 后台设了 roleColor 就用它，否则沿用 nameColor（保持历史视觉）
 */
export function roleBlockColor(roleColor, nameColor) {
  return normalizeHex(roleColor) || normalizeHex(nameColor) || "";
}

/**
 * 帖子 / 他人主页胶囊标签的样式：文字用原色，底色用 12% 透明度。
 * 和原来写死的 `color:#fb7299; background:rgba(251,114,153,.12)` 是同一套观感，
 * 换成任意颜色都不会出现「白字白底」的情况。
 */
export function rolePillStyle(roleColor) {
  const color = normalizeHex(roleColor) || DEFAULT_ROLE_TAG_COLOR;
  return {
    color,
    background: hexToRgba(color, 0.12),
  };
}
