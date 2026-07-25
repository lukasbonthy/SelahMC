package me.selahmc.account;

record Account(
    long id,
    String username,
    String passwordHash,
    String minecraftUuid,
    boolean disabled,
    long createdAt,
    Long lastLoginAt
) {}

record Session(
    long accountId,
    String csrfToken,
    long expiresAt
) {}

record MinecraftCode(
    long accountId,
    String username,
    long expiresAt
) {}

record UserRow(
    long id,
    String username,
    String friendship,
    boolean online,
    long createdAt
) {}

record MessageRow(
    long id,
    long senderId,
    String sender,
    Long recipientId,
    String recipient,
    String channel,
    String body,
    long createdAt
) {}
