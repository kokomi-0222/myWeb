package com.example.kokomi.vo;

import lombok.Data;
import java.time.LocalDate;

@Data
public class UserVO {
    private Long id;
    private String username;
    private String name;
    private String nameColor;
    private String primaryRole;
    private String avatar;
    private String badge;
    private String ornament;
    private LocalDate birthday;
    private String email;
    private String gender;
    private String phone;
    private String signature;
}