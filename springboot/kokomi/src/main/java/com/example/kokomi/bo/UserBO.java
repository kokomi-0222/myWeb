package com.example.kokomi.bo;

import lombok.Data;
import java.time.LocalDate;
import java.util.List;

@Data
public class UserBO {
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

    // 角色、权限
    private List<String> roles;
    private List<String> permissions;
}