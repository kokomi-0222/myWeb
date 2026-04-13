
const Message = {
  success(text) {
    ElMessage.success({ message: text, duration: 2200 })
  },
  error(text) {
    ElMessage.error({ message: text, duration: 2200 })
  },
  info(text) {
    ElMessage.info({ message: text, duration: 2200 })
  },
  warning(text) {
    ElMessage.warning({ message: text, duration: 2200 })
  },

  // 兼容旧调用：message('文字', 'success')
  show(text, type = 'success') {
    ElMessage({ message: text, type, duration: 2200 })
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