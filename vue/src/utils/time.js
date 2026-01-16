/**
 * 相对时间格式化（带“1天前”、“2天前”、“3天前”，超过3天显示中文日期）
 * @param {string | number | Date} dateStr - 任意可被 new Date() 解析的时间
 * @returns {string}
 */
export const formatRelativeTime = (dateStr) => {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '--'; // 防止无效日期

  const now = new Date();
  const diff = now - date;

  // 刚刚
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return '刚刚';

  // X分钟前
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;

  // X小时前
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;

  // 天数（只处理1~3天）
  const days = Math.floor(hours / 24);
  if (days === 1) return '1天前';
  if (days === 2) return '2天前';
  if (days === 3) return '3天前';

  // 超过3天：显示 yyyy年mm月dd日
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}年${m}月${d}日`;
};

/**
 * 绝对时间格式化（一天内显示相对时间，超过一天显示 yyyy-mm-dd HH:MM）
 * @param {string | number | Date} dateStr - 任意可被 new Date() 解析的时间
 * @returns {string}
 */
export const formatAbsoluteTime = (dateStr) => {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '--'; // 防止无效日期

  const now = new Date();
  const diff = now - date;

  // 刚刚
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return '刚刚';

  // X分钟前
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;

  // X小时前
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;

  // 超过一天：显示 yyyy-mm-dd HH:MM
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
};

export const formatFullDateTime = (dateStr) => {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '--';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
};
