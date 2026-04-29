package com.example.kokomi.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDate;

@Data
public class UserUpdateDTO {
    private String name;            // 昵称
    private String signature;       // 签名
    private String gender;          // 性别 male/female/secret
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate birthday;        // 生日 2000-01-01
    private String avatar;          // 头像地址
}
