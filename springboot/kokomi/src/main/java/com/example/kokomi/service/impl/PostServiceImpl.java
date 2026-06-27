package com.example.kokomi.service.impl;


import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

import com.example.kokomi.mapper.*;
import com.example.kokomi.util.PermissionCache;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.kokomi.common.ResultCode;
import com.example.kokomi.dto.CreatePostDTO;
import com.example.kokomi.dto.PostMediaDTO;
import com.example.kokomi.dto.PostPageQueryDTO;
import com.example.kokomi.entity.Comment;
import com.example.kokomi.entity.Post;
import com.example.kokomi.entity.PostLike;
import com.example.kokomi.entity.PostMedia;
import com.example.kokomi.entity.User;
import com.example.kokomi.exception.CustomerException;
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
    private final PostLikeMapper postLikeMapper;
    private final PostTagMapper postTagMapper;
    private final UserMapper userMapper;
    private final UserRoleMapper userRoleMapper;
    private final RolePermissionMapper rolePermissionMapper;
    private final CommentMapper commentMapper;

    @Value("${app.upload-path}")
    private String uploadPath;

    @Value("${app.base-url}")
    private String baseUrl;

    @Override
    public PostDetailVO getPostById(Long id) {
        Post post = postMapper.selectById(id);
        if (post == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "帖子不存在");
        }
        return convertToVO(post);
    }

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
        post.setType(dto.getType() != null ? dto.getType().trim() : "");

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

                // 将 temp 目录中的图片移动到 images 目录（仅接受合法的 temp URL）
                String finalUrl = moveTempFileToImages(md.getUrl());
                if (finalUrl == null) {
                    continue; // 非法的媒体 URL，跳过不入库
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

        // 检查权限：帖子作者 或 拥有 post:delete 权限的用户
        boolean isOwner = post.getUserId().equals(currentUserId);
        boolean hasDeletePerm = hasPermission(currentUserId, "post:delete");

        if (!isOwner && !hasDeletePerm) {
            throw new CustomerException(ResultCode.NO_PERMISSION, "无权删除该帖子");
        }

        // 删除帖子关联的图片文件
        List<PostMedia> mediaList = postMediaMapper.selectByPostId(postId);
        for (PostMedia media : mediaList) {
            deleteImageFile(media.getThumbnailUrl());
        }

        // 删除评论中关联的图片文件（需在删DB记录前完成）
        List<Comment> comments = commentMapper.selectByPostId(postId);
        for (Comment comment : comments) {
            deleteImageFile(comment.getImage());
        }

        // 删除关联数据：媒体、标签、评论、帖子
        postMediaMapper.deleteByPostId(postId);
        postTagMapper.deleteByPostId(postId);
        commentMapper.deleteByPostId(postId);
        postMapper.deleteById(postId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void like(Long postId) {
        Long userId = LoginUserHolder.getUserId();

        Post post = postMapper.selectById(postId);
        if (post == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "帖子不存在");
        }

        // 原子 INSERT IGNORE：遇唯一约束冲突时返回 0，消除 check-then-act 竞态
        PostLike like = new PostLike();
        like.setPostId(postId);
        like.setUserId(userId);
        int inserted = postLikeMapper.insertIgnore(like);
        if (inserted > 0) {
            postMapper.incrementLikes(postId);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void unlike(Long postId) {
        Long userId = LoginUserHolder.getUserId();

        Post post = postMapper.selectById(postId);
        if (post == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "帖子不存在");
        }

        // 直接用 DELETE 返回值判断是否真正删除了记录，避免 check-then-act 竞态
        int deleted = postLikeMapper.deleteByPostIdAndUserId(postId, userId);
        if (deleted > 0) {
            postMapper.decrementLikes(postId);
        }
    }

    /**
     * 将临时文件从 temp 目录迁移到 images 目录，返回永久访问 URL。
     * 仅接受以 {@code /upload/temp/} 为路径的合法临时文件 URL，
     * 拒绝外部 URL、javascript: 协议等任意字符串。
     *
     * @param url 客户端传入的临时文件 URL
     * @return 迁移成功返回永久 URL，否则返回 null（调用方应跳过该媒体项）
     */
    private String moveTempFileToImages(String url) {
        // 必须是本地上传的临时文件 URL
        if (url == null || !url.contains("/upload/temp/")) {
            return null;
        }
        String filename = url.substring(url.lastIndexOf("/") + 1);
        // 防止路径穿越：文件名不能包含路径分隔符或上级目录标记
        if (filename.isEmpty() || filename.contains("/") || filename.contains("\\")
                || filename.contains("..")) {
            return null;
        }
        File tempFile = new File(uploadPath + "temp/" + filename);
        File imageFile = new File(uploadPath + "images/" + filename);
        try {
            // 直接 move，消除 exists() → move() 之间的 TOCTOU 竞态窗口
            Files.move(tempFile.toPath(), imageFile.toPath(),
                    StandardCopyOption.REPLACE_EXISTING);
            return baseUrl + "/upload/images/" + filename;
        } catch (IOException e) {
            return null;
        }
    }

    /**
     * 检查用户是否拥有指定权限（优先查缓存，缓存缺失时查 DB 并回填）。
     */
    private boolean hasPermission(Long userId, String permCode) {
        if (PermissionCache.hasPermission(userId, permCode)) {
            return true;
        }
        // 缓存缺失：从 DB 加载 roles + permissions 并回填缓存
        java.util.Set<String> roles = new java.util.HashSet<>(
                userRoleMapper.selectRolesByUserId(userId));
        java.util.Set<String> perms = new java.util.HashSet<>(
                rolePermissionMapper.selectPermissionsByUserId(userId));
        PermissionCache.put(userId, roles, perms);
        return perms.contains(permCode);
    }

    /**
     * 安全删除 images 目录下的图片文件。
     * 仅处理合法路径，防止路径穿越。
     */
    private void deleteImageFile(String url) {
        if (url == null || !url.contains("/upload/images/")) {
            return;
        }
        String filename = url.substring(url.lastIndexOf("/") + 1);
        if (filename.contains("/") || filename.contains("\\") || filename.contains("..")) {
            return;
        }
        File file = new File(uploadPath + "images/" + filename);
        if (file.exists()) {
            file.delete();
        }
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
        vo.setType(post.getType());

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

        // 当前用户是否已点赞
        Long currentUserId = LoginUserHolder.getUserId();
        boolean likedByMe = currentUserId != null
                && postLikeMapper.existsByPostIdAndUserId(post.getId(), currentUserId) > 0;
        vo.setLikedByMe(likedByMe);
        return vo;
    }
}