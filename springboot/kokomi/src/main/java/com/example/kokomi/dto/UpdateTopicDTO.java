package com.example.kokomi.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 后台编辑话题。
 * <p>
 * name 改的是展示名，同时会把 topic.value 和该话题下所有帖子的 post.type
 * 一起改过去（见 TopicServiceImpl.update），所以搜索、配色、标签不会对不上。
 */
@Data
public class UpdateTopicDTO {

    @Size(max = 20, message = "话题名称最多 20 个字")
    private String name;

    /** #RGB / #RRGGBB */
    @Size(max = 16, message = "颜色格式应为 #RRGGBB")
    private String color;

    /** 排序值，越小越靠前 */
    private Integer sort;
}
