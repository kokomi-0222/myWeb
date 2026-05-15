package com.example.kokomi.mapper;

import com.example.kokomi.dto.PostPageQueryDTO;
import com.example.kokomi.entity.Post;
import com.example.kokomi.vo.PostDetailVO;
import org.apache.ibatis.annotations.Param;
import java.util.List;

public interface PostMapper {

    // 分页查询帖子
    List<Post> selectPostPage(@Param("query") PostPageQueryDTO query,
                              @Param("offset") Integer offset);

    // 查询总数
    Long selectPostCount(@Param("query") PostPageQueryDTO query);
}