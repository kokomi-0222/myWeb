package com.example.kokomi.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;
import java.util.List;

@Data
public class CreatePostDTO {

    @Size(max = 20, message = "标题不能超过20字")
    private String title;

    // 上限与前端 setting.postMaxLength 保持一致。
    // 数据库 post.content 是 TEXT（65535 字节，中文约 2.1 万字），1 万字留有一倍余量。
    @Size(max = 10000, message = "内容不能超过10000字")
    private String content;

    private List<PostMediaDTO> media;
    private List<String> tags;
    private String type;
}
