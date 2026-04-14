package com.example.kokomi;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("com.example.kokomi.mapper")
public class KokomiApplication {

    public static void main(String[] args) {
        SpringApplication.run(KokomiApplication.class, args);
    }

}
