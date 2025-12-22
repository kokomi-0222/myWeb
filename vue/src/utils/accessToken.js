import setting from '@/config/setting'

/**
 * @description 获取accessToken
 * @returns {string|ActiveX.IXMLDOMNode|Promise<any>|any|IDBRequest<any>|MediaKeyStatus|FormDataEntryValue|Function|Promise<Credential | null>}
 */
export function getAccessToken() {
  if (setting.storage) {
    if ('localStorage' === setting.storage) {
      return localStorage.getItem(setting.tokenTableName)
    } else if ('sessionStorage' === setting.storage) {
      return sessionStorage.getItem(setting.tokenTableName)
    } else {
      return localStorage.getItem(setting.tokenTableName)
    }
  } else {
    return localStorage.getItem(setting.tokenTableName)
  }
}

/**
 * @description 存储accessToken
 * @param accessToken
 * @returns {void|*}
 */
export function setAccessToken(accessToken) {
  if (setting.storage) {
    if ('localStorage' === setting.storage) {
      return localStorage.setItem(setting.tokenTableName, accessToken)
    } else if ('sessionStorage' === storage) {
      return sessionStorage.setItem(setting.tokenTableName, accessToken)
    } else {
      return localStorage.setItem(setting.tokenTableName, accessToken)
    }
  } else {
    return localStorage.setItem(setting.tokenTableName, accessToken)
  }
}

/**
 * @description 移除accessToken
 * @returns {void|Promise<void>}
 */
export function removeAccessToken() {
  if (setting.storage) {
    if ('localStorage' === setting.storage) {
      return localStorage.removeItem(setting.tokenTableName)
    } else if ('sessionStorage' === setting.storage) {
      return sessionStorage.clear()
    } else {
      return localStorage.removeItem(setting.tokenTableName)
    }
  } else {
    return localStorage.removeItem(setting.tokenTableName)
  }
}
