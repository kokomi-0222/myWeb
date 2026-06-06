package com.example.kokomi.controller;

import java.io.File;
import java.io.IOException;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.example.kokomi.common.Result;
import com.example.kokomi.exception.CustomerException;

@RestController
@RequestMapping("/file")
public class FileController {

    @Value("${app.base-url}")
    private String baseUrl;

    @Value("${app.upload-path}")
    private String uploadPath;

    private static final Set<String> ALLOWED_IMAGE_EXT = new HashSet<>(
        Arrays.asList(".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp")
    );

    /**
     * 上传头像（临时文件）
     */
    @PostMapping("/upload/avatar")
    public Result<String> uploadAvatar(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            throw new CustomerException(400, "请选择上传文件");
        }

        String tempDir = uploadPath + "temp/";

        String originalFilename = file.getOriginalFilename();
        String suffix = getSuffix(originalFilename);

        if (!ALLOWED_IMAGE_EXT.contains(suffix)) {
            throw new CustomerException(400, "只支持 jpg、png、gif、webp 格式图片");
        }

        String fileName = UUID.randomUUID() + suffix;
        File directory  = new File(tempDir);

        if (!directory .exists()) {
            directory .mkdirs();
        }

        try {
            file.transferTo(new File(directory, fileName));
        } catch (IOException e) {
            e.printStackTrace();
            throw new CustomerException(500, "文件上传失败");
        }

        String url = baseUrl + "/upload/temp/" + fileName;
        return Result.success(url);
    }

    /**
     * 上传帖子图片（临时文件）
     */
    @PostMapping("/upload/post-image")
    public Result<Map<String, Object>> uploadPostImage(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            throw new CustomerException(400, "请选择上传文件");
        }

        String tempDir = uploadPath + "temp/";

        String originalFilename = file.getOriginalFilename();
        String suffix = getSuffix(originalFilename);

        if (!ALLOWED_IMAGE_EXT.contains(suffix)) {
            throw new CustomerException(400, "只支持图片格式(jpg/png/gif/webp/bmp)");
        }

        // 校验文件真实类型（magic bytes）
        if (!isValidImageType(file)) {
            throw new CustomerException(400, "文件类型校验失败，请上传真实图片");
        }

        String fileName = UUID.randomUUID() + suffix;
        File directory = new File(tempDir);

        if (!directory.exists()) {
            directory.mkdirs();
        }

        try {
            file.transferTo(new File(directory, fileName));
        } catch (IOException e) {
            e.printStackTrace();
            throw new CustomerException(500, "文件上传失败");
        }

        String url = baseUrl + "/upload/temp/" + fileName;

        Map<String, Object> result = new HashMap<>();
        result.put("url", url);
        result.put("type", "image");
        result.put("size", file.getSize());
        result.put("format", suffix.replace(".", ""));

        return Result.success(result);
    }

    /**
     * 通过读取文件头 magic bytes 校验是否为真实图片
     */
    private boolean isValidImageType(MultipartFile file) {
        try {
            byte[] header = new byte[8];
            java.io.InputStream is = file.getInputStream();
            int read = is.read(header);
            is.close();
            if (read < 4) return false;

            // JPEG: FF D8 FF
            if ((header[0] & 0xFF) == 0xFF && (header[1] & 0xFF) == 0xD8 && (header[2] & 0xFF) == 0xFF) {
                return true;
            }
            // PNG: 89 50 4E 47
            if (header[0] == (byte)0x89 && header[1] == 'P' && header[2] == 'N' && header[3] == 'G') {
                return true;
            }
            // GIF: 47 49 46 38
            if (header[0] == 'G' && header[1] == 'I' && header[2] == 'F' && header[3] == '8') {
                return true;
            }
            // BMP: 42 4D
            if (header[0] == 'B' && header[1] == 'M') {
                return true;
            }
            // WebP: 52 49 46 46 ... 57 45 42 50
            if (header[0] == 'R' && header[1] == 'I' && header[2] == 'F' && header[3] == 'F'
                && read >= 12 && header[8] == 'W' && header[9] == 'E' && header[10] == 'B' && header[11] == 'P') {
                return true;
            }
            return false;
        } catch (IOException e) {
            return false;
        }
    }

    private String getSuffix(String filename) {
        if (filename == null || !filename.contains(".")) return "";
        return filename.substring(filename.lastIndexOf(".")).toLowerCase();
    }
}
