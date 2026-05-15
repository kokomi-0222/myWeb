package com.example.kokomi.service;

import com.example.kokomi.dto.PostPageQueryDTO;
import com.example.kokomi.entity.Post;
import com.example.kokomi.vo.PageVO;
import com.example.kokomi.vo.PostDetailVO;

public interface PostService {
    /**
     *分页获取帖子列表
     * @param dto
     * @return
     */
    PageVO<PostDetailVO> getPostPage(PostPageQueryDTO dto);

}
