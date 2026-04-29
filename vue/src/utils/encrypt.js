import JSEncrypt from 'jsencrypt'
import { getPublicKey } from '@/api/publicKey'

const privateKey =
  'MIICdwIBADANBgkqhkiG9w0BAQEFAASCAmEwggJdAgEAAoGBAMFPa+v52FkSUXvcUnrGI/XzW3EpZRI0s9BCWJ3oNQmEYA5luWW5p8h0uadTIoTyYweFPdH4hveyxlwmS7oefvbIdiP+o+QIYW/R4Wjsb4Yl8MhR4PJqUE3RCy6IT9fM8ckG4kN9ECs6Ja8fQFc6/mSl5dJczzJO3k1rWMBhKJD/AgMBAAECgYEAucMakH9dWeryhrYoRHcXo4giPVJsH9ypVt4KzmOQY/7jV7KFQK3x//27UoHfUCak51sxFw9ek7UmTPM4HjikA9LkYeE7S381b4QRvFuf3L6IbMP3ywJnJ8pPr2l5SqQ00W+oKv+w/VmEsyUHr+k4Z+4ik+FheTkVWp566WbqFsECQQDjYaMcaKw3j2Zecl8T6eUe7fdaRMIzp/gcpPMfT/9rDzIQk+7ORvm1NI9AUmFv/FAlfpuAMrdL2n7p9uznWb7RAkEA2aP934kbXg5bdV0R313MrL+7WTK/qdcYxATUbMsMuWWQBoS5irrt80WCZbG48hpocJavLNjbtrjmUX3CuJBmzwJAOJg8uP10n/+ZQzjEYXh+BszEHDuw+pp8LuT/fnOy5zrJA0dO0RjpXijO3vuiNPVgHXT9z1LQPJkNrb5ACPVVgQJBALPeb4uV0bNrJDUb5RB4ghZnIxv18CcaqNIft7vuGCcFBAIPIRTBprR+RuVq+xHDt3sNXdsvom4h49+Hky1b0ksCQBBwUtVaqH6ztCtwUF1j2c/Zcrt5P/uN7IHAd44K0gIJc1+Csr3qPG+G2yoqRM8KVqLI8Z2ZYn9c+AvEE+L9OQY='


/**
 * @description RSA 全自动加密函数
 * @param {String|Object} data 要加密的数据（密码）
 * @returns {Promise<{param: string}>} 加密后的数据
 */
export async function encryptedData(data) {
  try {
    // 获取公钥
    const res = await getPublicKey()
    let publicKey = res.data?.publicKey || ''
    // 不需要加密（mock 环境）
    if (res.data?.mockServer || publicKey === '') {
      return typeof data === 'object' ? JSON.stringify(data) : data
    }
    const encrypt = new JSEncrypt()
    encrypt.setPublicKey(publicKey)
    //console.log('RSA 加密公钥：', publicKey)
    const encryptStr = typeof data === 'object' ? JSON.stringify(data) : String(data)
    const encrypted = encrypt.encrypt(encryptStr)
    //console.log('encrypted：', encrypted)
    if (!encrypted) {
      console.error('RSA 加密失败！')
      return data
    }
    return encrypted
  } catch (err) {
    console.error('encryptedData 异常：', err)
    return data
  }
}

/**
 * @description RSA解密
 * @param data
 * @returns {PromiseLike<ArrayBuffer>}
 */
export function decryptedData(data) {
  const decrypt = new JSEncrypt()
  decrypt.setPrivateKey(`-----BEGIN RSA PRIVATE KEY-----${privateKey}-----END RSA PRIVATE KEY-----`)
  data = decrypt.decrypt(JSON.stringify(data))
  return data
}
