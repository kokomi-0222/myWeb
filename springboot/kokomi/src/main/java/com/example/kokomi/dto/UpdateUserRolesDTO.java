package com.example.kokomi.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

/**
 * 修改某个用户的角色。
 * 语义是「整体覆盖」而不是增量追加：前端传过来什么就是什么，
 * 这样取消勾选也能生效。
 */
@Data
public class UpdateUserRolesDTO {

    /** 至少要留一个角色，否则用户会变成既不是会员也不是任何身份的孤儿 */
    @NotEmpty(message = "至少保留一个角色")
    private List<@NotBlank(message = "角色编码不能为空") String> roles;
}
