package com.example.kokomi;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@MapperScan("com.example.kokomi.mapper")
// 定时任务：目前只有 upload/temp 的过期清理（TempFileCleanupTask）
@EnableScheduling
public class KokomiApplication {

    public static void main(String[] args) {
        SpringApplication.run(KokomiApplication.class, args);
    }

}
