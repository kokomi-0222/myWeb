import request from '@/utils/request'

// 上传头像（临时文件）
export function uploadAvatar(file) {
  const formData = new FormData()
  formData.append('file', file)

  return request({
    url: '/file/upload/avatar',
    method: 'POST',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
}