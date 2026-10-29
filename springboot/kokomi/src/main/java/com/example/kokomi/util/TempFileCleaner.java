package com.example.kokomi.util;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;

/**
 * upload/temp 目录的过期文件清理。
 *
 * <p>背景：帖子配图、评论配图、头像都是先传到 {@code upload/temp/}，
 * 用户真正提交时才 move 进 {@code upload/images}（见 PostServiceImpl#moveTempFileToImages）。
 * 上传了但没提交的（关掉弹窗、断网、传错了重传）就永久留在 temp 里，磁盘只增不减。
 *
 * <p>判断依据只有文件的 <b>最后修改时间</b>：文件名是 UUID，不带任何时间信息；
 * 也<b>不查数据库</b> —— temp 就是垃圾桶，超过保留窗口的一律清掉，
 * 哪怕某条历史数据里还存着指向它的 URL（那种图本来就已经该修了）。
 *
 * <p>日志只有一个定时任务在用，这里只做纯逻辑，方便单测直接调。
 */
public final class TempFileCleaner {

    /**
     * 一次清理的结果。
     *
     * @param deletedFiles 成功删除的个数
     * @param freedBytes   释放的字节数
     * @param failedFiles  删除失败（被占用、权限不足）的个数
     */
    public record CleanResult(int deletedFiles, long freedBytes, int failedFiles) {

        /** 没删掉也没失败：常态，不必打日志。 */
        public boolean isEmpty() {
            return deletedFiles == 0 && failedFiles == 0;
        }
    }

    private TempFileCleaner() {
    }

    /**
     * 按当前时间清理。
     *
     * @param dir       要清理的目录（不存在或不是目录时直接返回空结果）
     * @param ttlMillis 保留多久以内的文件（毫秒）
     */
    public static CleanResult clean(Path dir, long ttlMillis) {
        return clean(dir, ttlMillis, System.currentTimeMillis());
    }

    /**
     * @param now 当前时间戳，测试里用来固定「现在」
     */
    public static CleanResult clean(Path dir, long ttlMillis, long now) {
        if (dir == null) {
            return new CleanResult(0, 0, 0);
        }
        File[] entries = dir.toFile().listFiles();
        if (entries == null || entries.length == 0) {
            return new CleanResult(0, 0, 0);
        }

        int deleted = 0;
        int failed = 0;
        long freed = 0;

        for (File entry : entries) {
            // 只处理普通文件。目录一律跳过、不做递归 —— 这里本该只有一层平铺的图片，
            // 真出现子目录多半是人为放错，删错的代价远大于留着的代价。
            // 符号链接也跳过，避免顺着链接删到 upload 之外。
            if (!entry.isFile() || Files.isSymbolicLink(entry.toPath())) {
                continue;
            }
            try {
                long mtime = Files.getLastModifiedTime(entry.toPath(), LinkOption.NOFOLLOW_LINKS)
                        .toMillis();
                // 用「年龄 > 保留窗口」判断：正好卡在窗口上的先留着，
                // 差几毫秒的边界争不出对错，留着只占一点空间，删错要用户重传。
                if (now - mtime <= ttlMillis) {
                    continue; // 还年轻，可能是用户正在编辑的图
                }
                long size = entry.length();
                if (entry.delete()) {
                    deleted++;
                    freed += size;
                } else {
                    failed++; // Windows 上被占用时 delete 返回 false 而不是抛异常
                }
            } catch (IOException | RuntimeException e) {
                // 单个文件出问题不能中断整轮清理
                failed++;
            }
        }
        return new CleanResult(deleted, freed, failed);
    }
}
