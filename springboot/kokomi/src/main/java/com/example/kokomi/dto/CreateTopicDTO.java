package com.example.kokomi.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 新建话题入参。
 * <p>
 * 只允许拥有 {@code topic:create} 权限的角色（当前仅 admin）调用。
 * {@code value} 选填：不填就用中文名本身当存储值，站长不用理解「标识」这种概念。
 */
@Data
public class CreateTopicDTO {

    @NotBlank(message = "话题名称不能为空")
    @Size(max = 16, message = "话题名称不能超过16个字")
    private String name;

    // 选填。留空则复用 name，最长 32（与 post.type 的字段宽度一致）
    @Size(max = 32, message = "话题标识不能超过32个字符")
    private String value;

    // 选填。留空则按名称哈希从调色板里挑一个，保证同一话题颜色稳定
    @Size(max = 16, message = "颜色值格式不正确")
    private String color;
}
