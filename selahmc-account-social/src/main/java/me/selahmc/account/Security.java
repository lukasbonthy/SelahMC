package me.selahmc.account;

import at.favre.lib.crypto.bcrypt.BCrypt;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Locale;
import java.util.regex.Pattern;

final class Security {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Pattern USERNAME = Pattern.compile("^[A-Za-z0-9_.-]{3,24}$");

    private Security() {}

    static String normalizeUsername(String username) {
        return username == null ? "" : username.trim().toLowerCase(Locale.ROOT);
    }

    static boolean validUsername(String username) {
        return username != null && USERNAME.matcher(username.trim()).matches();
    }

    static String validatePassword(String password, int minimumLength) {
        if (password == null || password.length() < minimumLength) {
            return "Password must contain at least " + minimumLength + " characters.";
        }
        if (password.length() > 128) {
            return "Password must be 128 characters or fewer.";
        }
        return null;
    }

    static String hashPassword(String password, int cost) {
        return BCrypt.withDefaults().hashToString(cost, password.toCharArray());
    }

    static boolean verifyPassword(String password, String hash) {
        if (password == null || hash == null || hash.isBlank()) return false;
        try {
            return BCrypt.verifyer().verify(password.toCharArray(), hash).verified;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    static String randomToken(int bytes) {
        byte[] value = new byte[bytes];
        RANDOM.nextBytes(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    static String numericCode(int digits) {
        int bound = 1;
        for (int i = 0; i < digits; i++) bound *= 10;
        int value = RANDOM.nextInt(bound);
        return String.format(Locale.ROOT, "%0" + digits + "d", value);
    }

    static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hashed);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    static String cleanMessage(String value, int maxLength) {
        if (value == null) return "";
        String clean = value.replace('\u0000', ' ').replaceAll("[\\r\\n\\t]+", " ").trim();
        if (clean.length() > maxLength) clean = clean.substring(0, maxLength);
        return clean;
    }
}
