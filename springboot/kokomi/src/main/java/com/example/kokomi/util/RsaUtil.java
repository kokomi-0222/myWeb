package com.example.kokomi.util;
import com.example.kokomi.config.RsaProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import javax.crypto.Cipher;
import java.security.*;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

@Component
@RequiredArgsConstructor
public class RsaUtil {

    private final RsaProperties rsaProperties;

    // 解密
    public String decrypt(String encryptStr) {
        try {
            byte[] priBytes = Base64.getDecoder().decode(rsaProperties.getPrivateKey());
            PKCS8EncodedKeySpec spec = new PKCS8EncodedKeySpec(priBytes);
            PrivateKey privateKey = KeyFactory.getInstance("RSA").generatePrivate(spec);

            Cipher cipher = Cipher.getInstance("RSA/ECB/PKCS1Padding"); // 👈 重点改这里
            cipher.init(Cipher.DECRYPT_MODE, privateKey);

            // 解密前端传来的 Base64
            byte[] decrypted = cipher.doFinal(Base64.getDecoder().decode(encryptStr));
            return new String(decrypted);

        } catch (javax.crypto.BadPaddingException e) {
            System.err.println(" 解密失败原因：密钥不匹配 或 前端加密模式不对");
            e.printStackTrace();
        } catch (javax.crypto.IllegalBlockSizeException e) {
            System.err.println(" 解密失败原因：加密内容过长");
            e.printStackTrace();
        } catch (Exception e) {
            System.err.println(" 解密失败原因：其他错误");
            e.printStackTrace();
        }
        return null;
    }

    // 加密
    public String encrypt(String plainText) {
        try {
            byte[] pubBytes = Base64.getDecoder().decode(rsaProperties.getPublicKey());
            X509EncodedKeySpec spec = new X509EncodedKeySpec(pubBytes);
            PublicKey publicKey = KeyFactory.getInstance("RSA").generatePublic(spec);

            Cipher cipher = Cipher.getInstance("RSA");
            cipher.init(Cipher.ENCRYPT_MODE, publicKey);
            byte[] encrypted = cipher.doFinal(plainText.getBytes());
            return Base64.getEncoder().encodeToString(encrypted);
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }

}