package com.example.kokomi.controller;

import com.example.kokomi.common.Result;
import com.example.kokomi.exception.CustomerException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.util.UUID;

@RestController
@RequestMapping("/file")
public class FileController {

    /**
     * 上传头像（临时文件）
     */
    @PostMapping("/upload/avatar")
    public Result<String> uploadAvatar(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            throw new CustomerException(400, "请选择上传文件");
        }

        String projectPath = System.getProperty("user.dir");
        String tempDir = projectPath + "/upload/temp/";

        String originalFilename = file.getOriginalFilename();
        String suffix = originalFilename.substring(originalFilename.lastIndexOf("."));

        // 只允许图片
        if (!suffix.matches("\\.(jpg|jpeg|png|gif|webp)$")) {
            throw new CustomerException(400, "只支持 jpg、png、gif、webp 格式图片");
        }

        // 生成唯一文件名
        String fileName = UUID.randomUUID() + suffix;
        File directory  = new File(tempDir);

        if (!directory .exists()) {
            directory .mkdirs();
        }

        try {
            // 先存到临时目录
            file.transferTo(new File(directory, fileName));
        } catch (IOException e) {
            e.printStackTrace();
            throw new CustomerException(500, "文件上传失败");
        }

        // 返回临时访问地址
        String url = "http://localhost:8080/temp/" + fileName;
        return Result.success(url);
    }
}