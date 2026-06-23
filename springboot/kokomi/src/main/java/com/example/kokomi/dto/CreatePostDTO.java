package com.example.kokomi.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;
import java.util.List;

@Data
public class CreatePostDTO {

    @Size(max = 20, message = "标题不能超过20字")
    private String title;

    @Size(max = 1000, message = "内容不能超过1000字")
    private String content;

    private List<PostMediaDTO> media;
    private List<String> tags;
    private String type;
}
