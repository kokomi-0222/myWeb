
// 统一配置：所有轻提示都走这里，样式见 assets/css/message.css 的 .kokomi-toast
// - offset 76：默认的 20px 会压在顶栏（55px）上，盖住搜索框，这里挪到顶栏下方
// - grouping：连续触发同一条提示时合并，右下角显示次数，不会叠成一串
const BASE = {
  offset: 76,
  grouping: true,
  customClass: 'kokomi-toast',
}

const Message = {
  success(text) {
    ElMessage.success({ ...BASE, message: text, duration: 2400 })
  },
  error(text) {
    ElMessage.error({ ...BASE, message: text, duration: 3000 })
  },
  info(text) {
    ElMessage.info({ ...BASE, message: text, duration: 2400 })
  },
  warning(text) {
    ElMessage.warning({ ...BASE, message: text, duration: 3000 })
  },

  // 兼容旧调用：message('文字', 'success')
  show(text, type = 'success') {
    ElMessage({ ...BASE, message: text, type, duration: 2400 })
  }
}


export function message(text, type) {
  return Message.show(text, type)
}

message.success = Message.success
message.error = Message.error
message.info = Message.info
message.warning = Message.warning

export default message
