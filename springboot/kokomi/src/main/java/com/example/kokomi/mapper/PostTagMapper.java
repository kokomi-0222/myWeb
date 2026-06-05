package com.example.kokomi.mapper;

import org.apache.ibatis.annotations.Param;
import java.util.List;

public interface PostTagMapper {
    List<String> selectTagNamesByPostId(@Param("postId") Long postId);

    int insertBatch(@Param("postId") Long postId, @Param("tags") List<String> tags);
}
