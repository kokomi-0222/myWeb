package com.example.kokomi.vo;

import com.example.kokomi.bo.UserBO;
import lombok.Data;
import java.util.List;

@Data
public class LoginVO {
    private String token;
    private UserVO user;
    private List<String> roles;
    private List<String> permissions;

    public static LoginVO fromUserBO(UserBO bo) {
        LoginVO vo = new LoginVO();

        // 临时 token，后面可以换成 JWT
        vo.setToken("token_" + System.currentTimeMillis());

        UserVO userVO = new UserVO();
        userVO.setId(bo.getId());
        userVO.setUsername(bo.getUsername());
        userVO.setName(bo.getName());
        userVO.setNameColor(bo.getNameColor());
        userVO.setPrimaryRole(bo.getPrimaryRole());
        userVO.setAvatar(bo.getAvatar());
        userVO.setBadge(bo.getBadge());
        userVO.setOrnament(bo.getOrnament());
        userVO.setBirthday(bo.getBirthday());
        userVO.setEmail(bo.getEmail());
        userVO.setGender(bo.getGender());
        userVO.setPhone(bo.getPhone());
        userVO.setSignature(bo.getSignature());

        vo.setUser(userVO);
        vo.setRoles(bo.getRoles());
        vo.setPermissions(bo.getPermissions());

        return vo;
    }
}