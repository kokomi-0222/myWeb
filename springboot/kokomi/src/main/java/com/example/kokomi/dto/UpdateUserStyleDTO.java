package com.example.kokomi.dto;

import jakarta.validation.constraints.Pattern;
import lombok.Data;

/**
 * 后台「外观」面板：设置某个用户的名字颜色和身份标签底色。
 * <p>
 * 两个字段都允许为 null 或空串 —— 表示恢复默认：
 * <ul>
 *   <li>nameColor 为空 → 名字用主题默认文字色</li>
 *   <li>roleColor 为空 → 方块底色回退用 nameColor</li>
 * </ul>
 * 颜色统一 #{@code #RRGGBB} 六位十六进制，不接受 rgb()/颜色名，
 * 避免把任意 CSS 注入到行内 style 里。
 */
@Data
public class UpdateUserStyleDTO {

    @Pattern(regexp = "^$|^#[0-9a-fA-F]{6}$", message = "名字颜色需为 #RRGGBB 格式")
    private String nameColor;

    @Pattern(regexp = "^$|^#[0-9a-fA-F]{6}$", message = "身份标签颜色需为 #RRGGBB 格式")
    private String roleColor;
}
