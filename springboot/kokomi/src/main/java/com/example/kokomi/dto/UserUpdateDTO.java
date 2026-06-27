package com.example.kokomi.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;

@Data
public class UserUpdateDTO {
    @Size(max = 12, message = "昵称不能超过12字")
    private String name;            // 昵称
    @Size(max = 100, message = "签名不能超过100字")
    private String signature;       // 签名
    @Pattern(regexp = "^(male|female|secret)?$", message = "性别仅支持 male/female/secret")
    private String gender;          // 性别 male/female/secret
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate birthday;        // 生日 2000-01-01
    private String avatar;          // 头像地址
}
