import request from '@/utils/request'

// 上传头像（临时文件）
export const uploadAvatar = (file, onUploadProgress) => {
  const formData = new FormData()
  formData.append('file', file)
  return request({
    url: '/file/upload/avatar',
    method: 'POST',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: onUploadProgress,
  })
}

// 上传帖子图片（临时文件）
export const uploadPostImage = (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return request({
    url: '/file/upload/post-image',
    method: 'POST',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}
