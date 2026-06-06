package com.example.kokomi.service.impl;


import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.kokomi.common.ResultCode;
import com.example.kokomi.dto.CreatePostDTO;
import com.example.kokomi.dto.PostMediaDTO;
import com.example.kokomi.dto.PostPageQueryDTO;
import com.example.kokomi.entity.Post;
import com.example.kokomi.entity.PostMedia;
import com.example.kokomi.entity.User;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.mapper.PostMapper;
import com.example.kokomi.mapper.PostMediaMapper;
import com.example.kokomi.mapper.PostTagMapper;
import com.example.kokomi.mapper.UserMapper;
import com.example.kokomi.mapper.UserRoleMapper;
import com.example.kokomi.service.PostService;
import com.example.kokomi.util.LoginUserHolder;
import com.example.kokomi.vo.PageVO;
import com.example.kokomi.vo.PostAuthorVO;
import com.example.kokomi.vo.PostDetailVO;
import com.example.kokomi.vo.PostMediaVO;

import lombok.RequiredArgsConstructor;
@Service
@RequiredArgsConstructor
public class PostServiceImpl implements PostService {

    private final PostMapper postMapper;
    private final PostMediaMapper postMediaMapper;
    private final PostTagMapper postTagMapper;
    private final UserMapper userMapper;
    private final UserRoleMapper userRoleMapper;

    @Value("${app.upload-path}")
    private String uploadPath;

    @Value("${app.base-url}")
    private String baseUrl;

    @Override
    public PageVO<PostDetailVO> getPostPage(PostPageQueryDTO dto) {
        return getPostList(dto);
    }

    @Override
    public PageVO<PostDetailVO> getMyPosts(PostPageQueryDTO dto) {
        dto.setUserId(LoginUserHolder.getUserId());
        return getPostList(dto);
    }

    @Override
    public PageVO<PostDetailVO> getUserPosts(PostPageQueryDTO dto) {
        Long targetUserId = dto.getUserId();
        if (targetUserId == null || targetUserId <= 0) {
            return PageVO.build(new ArrayList<>(), 0L, dto.getPageNum(), dto.getPageSize());
        }
        return getPostList(dto);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public PostDetailVO createPost(CreatePostDTO dto) {
        Long userId = LoginUserHolder.getUserId();

        Post post = new Post();
        post.setTitle(dto.getTitle() != null ? dto.getTitle().trim() : "");
        post.setContent(dto.getContent() != null ? dto.getContent().trim() : "");
        post.setUserId(userId);

        postMapper.insert(post);

        // 插入媒体（将图片从 temp 移到 images）
        if (dto.getMedia() != null && !dto.getMedia().isEmpty()) {
            // 确保 images 目录存在
            File imagesDirFile = new File(uploadPath + "images/");
            if (!imagesDirFile.exists()) {
                imagesDirFile.mkdirs();
            }

            List<PostMedia> mediaList = new ArrayList<>();
            int sort = 0;
            for (PostMediaDTO md : dto.getMedia()) {
                PostMedia m = new PostMedia();
                m.setPostId(post.getId());

                // 将 temp 目录中的图片移动到 images 目录
                String originalUrl = md.getUrl();
                String finalUrl = originalUrl;
                if (originalUrl != null && originalUrl.contains("/upload/temp/")) {
                    String filename = originalUrl.substring(originalUrl.lastIndexOf("/") + 1);
                    File tempFile = new File(uploadPath + "temp/" + filename);
                    File imageFile = new File(uploadPath + "images/" + filename);
                    if (tempFile.exists()) {
                        try {
                            Files.move(tempFile.toPath(), imageFile.toPath(),
                                StandardCopyOption.REPLACE_EXISTING);
                            finalUrl = baseUrl + "/upload/images/" + filename;
                        } catch (IOException e) {
                            e.printStackTrace();
                        }
                    }
                }

                m.setThumbnailUrl(finalUrl);
                m.setPreviewUrl(finalUrl);
                m.setRawUrl(finalUrl);
                m.setType(md.getType() != null ? md.getType() : "image");
                m.setWidth(md.getWidth());
                m.setHeight(md.getHeight());
                m.setSize(md.getSize());
                m.setAlt(md.getAlt() != null ? md.getAlt() : "");
                m.setFormat(md.getFormat() != null ? md.getFormat() : "");
                m.setIsAnimated(md.getIsAnimated() != null ? md.getIsAnimated() : 0);
                m.setSort(sort);
                sort++;
                mediaList.add(m);
            }
            if (!mediaList.isEmpty()) {
                postMediaMapper.insertBatch(mediaList);
            }
        }

        // 插入标签
        if (dto.getTags() != null && !dto.getTags().isEmpty()) {
            postTagMapper.insertBatch(post.getId(), dto.getTags());
        }

        return convertToVO(post);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deletePost(Long postId) {
        Long currentUserId = LoginUserHolder.getUserId();

        // 查询帖子是否存在
        Post post = postMapper.selectById(postId);
        if (post == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "帖子不存在");
        }

        // 检查权限：帖子作者 或 管理员
        boolean isOwner = post.getUserId().equals(currentUserId);
        boolean isAdmin = userRoleMapper.selectRolesByUserId(currentUserId).contains("admin");

        if (!isOwner && !isAdmin) {
            throw new CustomerException(ResultCode.NO_PERMISSION, "无权删除该帖子");
        }

        // 删除帖子关联的图片文件
        List<PostMedia> mediaList = postMediaMapper.selectByPostId(postId);
        for (PostMedia media : mediaList) {
            String url = media.getThumbnailUrl();
            if (url != null && url.contains("/upload/images/")) {
                String filename = url.substring(url.lastIndexOf("/") + 1);
                File imageFile = new File(uploadPath + "images/" + filename);
                if (imageFile.exists()) {
                    imageFile.delete();
                }
            }
        }

        // 删除关联数据：媒体、标签、帖子
        postMediaMapper.deleteByPostId(postId);
        postTagMapper.deleteByPostId(postId);
        postMapper.deleteById(postId);
    }

    private PageVO<PostDetailVO> getPostList(PostPageQueryDTO dto) {
        int offset = (dto.getPageNum() - 1) * dto.getPageSize();

        //  只有一行查询
        List<Post> postList = postMapper.selectPostPage(dto, offset);
        Long total = postMapper.selectPostCount(dto);

        // 转 VO（不变）
        List<PostDetailVO> voList = new ArrayList<>();
        for (Post post : postList) {
            voList.add(convertToVO(post));
        }
        return PageVO.build(voList, total, dto.getPageNum(), dto.getPageSize());
    }

    private PostDetailVO convertToVO(Post post) {
        PostDetailVO vo = new PostDetailVO();
        vo.setId(post.getId());
        vo.setTitle(post.getTitle());
        vo.setContent(post.getContent());
        vo.setCreatedAt(post.getCreatedAt());
        vo.setViews(post.getViews());
        vo.setLikes(post.getLikes());
        vo.setCommentsCount(post.getComments());
        vo.setForward(post.getForwards());

        // 作者
        User user = userMapper.selectById(post.getUserId());
        PostAuthorVO authorVO = new PostAuthorVO();
        authorVO.setId(user.getId());
        authorVO.setName(user.getName());
        authorVO.setNameColor(user.getNameColor());
        authorVO.setPrimaryRole(user.getPrimaryRole());
        authorVO.setAvatar(user.getAvatar());
        authorVO.setBadge(user.getBadge());
        authorVO.setOrnament(user.getOrnament());
        vo.setAuthor(authorVO);

        // 媒体
        List<PostMedia> mediaList = postMediaMapper.selectByPostId(post.getId());
        List<PostMediaVO> mediaVOList = new ArrayList<>();
        for (PostMedia m : mediaList) {
            PostMediaVO mv = new PostMediaVO();
            mv.setId(String.valueOf(m.getId()));
            mv.setThumbnailUrl(m.getThumbnailUrl());
            mv.setPreviewUrl(m.getPreviewUrl());
            mv.setRowUrl(m.getRawUrl());
            mv.setType(m.getType());
            mv.setWidth(m.getWidth());
            mv.setHeight(m.getHeight());
            mv.setSize(m.getSize());
            mv.setAlt(m.getAlt());
            mv.setOrientation(1);
            mv.setFormat(m.getFormat());
            mv.setIsAnimated(m.getIsAnimated() == 1);
            mediaVOList.add(mv);
        }
        vo.setMedia(mediaVOList);

        // 标签
        vo.setTag(postTagMapper.selectTagNamesByPostId(post.getId()));
        vo.setLikedByMe(false);
        return vo;
    }
}