package com.example.kokomi.mapper;

import org.apache.ibatis.annotations.Param;
import java.util.List;

public interface PostTagMapper {
    List<String> selectTagNamesByPostId(@Param("postId") Long postId);
}