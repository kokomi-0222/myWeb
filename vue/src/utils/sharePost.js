// utils/sharePost.js
// 分享帖子的唯一动作：把帖子链接复制到剪贴板。
// 不再弹分享面板（微博 / QQ / 系统分享都已下线），
// 统一从 PostCard 的更多菜单和 PostActionBar（详情页右侧悬浮条）调用。
import message from "@/utils/message";

/** 由帖子 id 生成可分享的绝对链接 */
export function getPostLink(post) {
  const id = post?.id;
  if (!id) return "";
  return `${window.location.origin}/post/${id}`;
}

/**
 * 写剪贴板。优先 navigator.clipboard，失败（非 HTTPS / 无权限）时
 * 退回隐藏 textarea + execCommand 的老办法。
 */
export async function writeClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 落到下面的兜底
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** 复制帖子链接，返回是否成功 */
export async function copyPostLink(post) {
  const url = getPostLink(post);
  if (!url) {
    message.error("帖子地址无效");
    return false;
  }
  const ok = await writeClipboard(url);
  if (!ok) {
    message.error("复制失败，请手动复制地址栏链接");
    return false;
  }
  message.success("链接已复制");
  return true;
}

export default copyPostLink;
