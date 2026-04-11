import { h, render } from 'vue'

let messageContainer = null
let messageTimer = null

function createContainer() {
  if (messageContainer) return
  messageContainer = document.createElement('div')
  messageContainer.id = 'global-message-container'
  document.body.appendChild(messageContainer)
}

export function message(text, type = 'success') {
  createContainer()

  if (messageTimer) clearTimeout(messageTimer)
  render(null, messageContainer)

  const vnode = h('div', {
    class: `global-message message-${type}`
  }, text)

  render(vnode, messageContainer)

  messageTimer = setTimeout(() => {
    render(null, messageContainer)
  }, 2200)
}

message.success = (text) => message(text, 'success')
message.error = (text) => message(text, 'error')
message.info = (text) => message(text, 'info')