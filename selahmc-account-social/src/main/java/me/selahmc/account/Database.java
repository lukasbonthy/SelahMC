package me.selahmc.account;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

final class Database {
    private final String jdbcUrl;

    Database(Path file) throws IOException {
        Files.createDirectories(file.getParent());
        this.jdbcUrl = "jdbc:sqlite:" + file.toAbsolutePath();
    }

    private Connection open() throws SQLException {
        Connection connection = DriverManager.getConnection(jdbcUrl);
        try (Statement statement = connection.createStatement()) {
            statement.execute("PRAGMA foreign_keys = ON");
            statement.execute("PRAGMA busy_timeout = 5000");
        }
        return connection;
    }

    void init() throws SQLException {
        try (Connection connection = open(); Statement statement = connection.createStatement()) {
            statement.execute("PRAGMA journal_mode = WAL");
            statement.executeUpdate("""
                CREATE TABLE IF NOT EXISTS accounts (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
                  password_hash TEXT NOT NULL,
                  minecraft_uuid TEXT UNIQUE,
                  disabled INTEGER NOT NULL DEFAULT 0,
                  created_at INTEGER NOT NULL,
                  last_login_at INTEGER
                )
                """);
            statement.executeUpdate("""
                CREATE TABLE IF NOT EXISTS sessions (
                  token_hash TEXT PRIMARY KEY,
                  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                  csrf_token TEXT NOT NULL,
                  expires_at INTEGER NOT NULL,
                  created_at INTEGER NOT NULL,
                  last_seen_at INTEGER NOT NULL
                )
                """);
            statement.executeUpdate("""
                CREATE TABLE IF NOT EXISTS minecraft_codes (
                  code_hash TEXT PRIMARY KEY,
                  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                  username TEXT NOT NULL COLLATE NOCASE,
                  expires_at INTEGER NOT NULL,
                  created_at INTEGER NOT NULL,
                  used_at INTEGER
                )
                """);
            statement.executeUpdate("""
                CREATE TABLE IF NOT EXISTS friend_requests (
                  from_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                  to_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                  status TEXT NOT NULL DEFAULT 'pending',
                  created_at INTEGER NOT NULL,
                  responded_at INTEGER,
                  PRIMARY KEY (from_id, to_id),
                  CHECK (from_id <> to_id)
                )
                """);
            statement.executeUpdate("""
                CREATE TABLE IF NOT EXISTS friendships (
                  user_low INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                  user_high INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                  created_at INTEGER NOT NULL,
                  PRIMARY KEY (user_low, user_high),
                  CHECK (user_low < user_high)
                )
                """);
            statement.executeUpdate("""
                CREATE TABLE IF NOT EXISTS messages (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  sender_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                  recipient_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
                  channel TEXT NOT NULL,
                  body TEXT NOT NULL,
                  created_at INTEGER NOT NULL,
                  CHECK (channel IN ('direct', 'friends', 'global'))
                )
                """);
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at)");
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_codes_expiry ON minecraft_codes(expires_at)");
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_messages_direct ON messages(channel, sender_id, recipient_id, id)");
            statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel, id)");
        }
    }

    Account createAccount(String username, String passwordHash, long now) throws SQLException {
        try (Connection connection = open();
             PreparedStatement statement = connection.prepareStatement(
                 "INSERT INTO accounts(username,password_hash,created_at) VALUES(?,?,?)",
                 Statement.RETURN_GENERATED_KEYS)) {
            statement.setString(1, username);
            statement.setString(2, passwordHash);
            statement.setLong(3, now);
            statement.executeUpdate();
            try (ResultSet keys = statement.getGeneratedKeys()) {
                if (!keys.next()) throw new SQLException("No account id was returned.");
                return new Account(keys.getLong(1), username, passwordHash, null, false, now, null);
            }
        }
    }

    Optional<Account> findAccountByUsername(String username) throws SQLException {
        try (Connection connection = open();
             PreparedStatement statement = connection.prepareStatement("SELECT * FROM accounts WHERE username = ? COLLATE NOCASE")) {
            statement.setString(1, username);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? Optional.of(readAccount(result)) : Optional.empty();
            }
        }
    }

    Optional<Account> findAccountById(long id) throws SQLException {
        try (Connection connection = open();
             PreparedStatement statement = connection.prepareStatement("SELECT * FROM accounts WHERE id = ?")) {
            statement.setLong(1, id);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? Optional.of(readAccount(result)) : Optional.empty();
            }
        }
    }

    Optional<Account> findAccountByMinecraftUuid(String uuid) throws SQLException {
        try (Connection connection = open();
             PreparedStatement statement = connection.prepareStatement("SELECT * FROM accounts WHERE minecraft_uuid = ?")) {
            statement.setString(1, uuid);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? Optional.of(readAccount(result)) : Optional.empty();
            }
        }
    }

    void bindMinecraftUuid(long accountId, String uuid) throws SQLException {
        try (Connection connection = open();
             PreparedStatement statement = connection.prepareStatement(
                 "UPDATE accounts SET minecraft_uuid = COALESCE(minecraft_uuid, ?) WHERE id = ? AND (minecraft_uuid IS NULL OR minecraft_uuid = ?)")) {
            statement.setString(1, uuid);
            statement.setLong(2, accountId);
            statement.setString(3, uuid);
            if (statement.executeUpdate() != 1) throw new SQLException("This website account is already linked to another Minecraft identity.");
        }
    }

    void markLastLogin(long accountId, long now) throws SQLException {
        try (Connection connection = open();
             PreparedStatement statement = connection.prepareStatement("UPDATE accounts SET last_login_at = ? WHERE id = ?")) {
            statement.setLong(1, now);
            statement.setLong(2, accountId);
            statement.executeUpdate();
        }
    }

    void setDisabled(long accountId, boolean disabled) throws SQLException {
        try (Connection connection = open();
             PreparedStatement statement = connection.prepareStatement("UPDATE accounts SET disabled = ? WHERE id = ?")) {
            statement.setInt(1, disabled ? 1 : 0);
            statement.setLong(2, accountId);
            statement.executeUpdate();
        }
    }

    void createSession(String tokenHash, long accountId, String csrfToken, long expiresAt, long now) throws SQLException {
        try (Connection connection = open();
             PreparedStatement statement = connection.prepareStatement(
                 "INSERT INTO sessions(token_hash,account_id,csrf_token,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?,?)")) {
            statement.setString(1, tokenHash);
            statement.setLong(2, accountId);
            statement.setString(3, csrfToken);
            statement.setLong(4, expiresAt);
            statement.setLong(5, now);
            statement.setLong(6, now);
            statement.executeUpdate();
        }
    }

    Optional<Session> findSession(String tokenHash, long now) throws SQLException {
        try (Connection connection = open();
             PreparedStatement statement = connection.prepareStatement(
                 "SELECT account_id,csrf_token,expires_at FROM sessions WHERE token_hash = ? AND expires_at > ?")) {
            statement.setString(1, tokenHash);
            statement.setLong(2, now);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) return Optional.empty();
                try (PreparedStatement touch = connection.prepareStatement("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?")) {
                    touch.setLong(1, now);
                    touch.setString(2, tokenHash);
                    touch.executeUpdate();
                }
                return Optional.of(new Session(result.getLong(1), result.getString(2), result.getLong(3)));
            }
        }
    }

    void deleteSession(String tokenHash) throws SQLException {
        try (Connection connection = open();
             PreparedStatement statement = connection.prepareStatement("DELETE FROM sessions WHERE token_hash = ?")) {
            statement.setString(1, tokenHash);
            statement.executeUpdate();
        }
    }

    void deleteSessionsForAccount(long accountId) throws SQLException {
        try (Connection connection = open();
             PreparedStatement statement = connection.prepareStatement("DELETE FROM sessions WHERE account_id = ?")) {
            statement.setLong(1, accountId);
            statement.executeUpdate();
        }
    }

    void createMinecraftCode(String codeHash, long accountId, String username, long expiresAt, long now) throws SQLException {
        try (Connection connection = open()) {
            connection.setAutoCommit(false);
            try (PreparedStatement delete = connection.prepareStatement("DELETE FROM minecraft_codes WHERE account_id = ? OR expires_at <= ?")) {
                delete.setLong(1, accountId);
                delete.setLong(2, now);
                delete.executeUpdate();
            }
            try (PreparedStatement insert = connection.prepareStatement(
                "INSERT INTO minecraft_codes(code_hash,account_id,username,expires_at,created_at) VALUES(?,?,?,?,?)")) {
                insert.setString(1, codeHash);
                insert.setLong(2, accountId);
                insert.setString(3, username);
                insert.setLong(4, expiresAt);
                insert.setLong(5, now);
                insert.executeUpdate();
            }
            connection.commit();
        }
    }

    Optional<MinecraftCode> consumeMinecraftCode(String codeHash, long now) throws SQLException {
        try (Connection connection = open()) {
            connection.setAutoCommit(false);
            MinecraftCode code;
            try (PreparedStatement select = connection.prepareStatement(
                "SELECT account_id,username,expires_at FROM minecraft_codes WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?")) {
                select.setString(1, codeHash);
                select.setLong(2, now);
                try (ResultSet result = select.executeQuery()) {
                    if (!result.next()) {
                        connection.rollback();
                        return Optional.empty();
                    }
                    code = new MinecraftCode(result.getLong(1), result.getString(2), result.getLong(3));
                }
            }
            try (PreparedStatement update = connection.prepareStatement("UPDATE minecraft_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL")) {
                update.setLong(1, now);
                update.setString(2, codeHash);
                if (update.executeUpdate() != 1) {
                    connection.rollback();
                    return Optional.empty();
                }
            }
            connection.commit();
            return Optional.of(code);
        }
    }

    List<UserRow> listUsers(long requesterId, String query, int limit, int offset) throws SQLException {
        String pattern = "%" + (query == null ? "" : query.trim()) + "%";
        String sql = """
            SELECT a.id,a.username,a.created_at,
              CASE
                WHEN f.user_low IS NOT NULL THEN 'friends'
                WHEN outgoing.status = 'pending' THEN 'outgoing'
                WHEN incoming.status = 'pending' THEN 'incoming'
                ELSE 'none'
              END AS friendship
            FROM accounts a
            LEFT JOIN friendships f
              ON f.user_low = MIN(a.id, ?) AND f.user_high = MAX(a.id, ?)
            LEFT JOIN friend_requests outgoing ON outgoing.from_id = ? AND outgoing.to_id = a.id
            LEFT JOIN friend_requests incoming ON incoming.from_id = a.id AND incoming.to_id = ?
            WHERE a.disabled = 0 AND a.id <> ? AND a.username LIKE ? COLLATE NOCASE
            ORDER BY CASE friendship WHEN 'incoming' THEN 0 WHEN 'friends' THEN 1 WHEN 'outgoing' THEN 2 ELSE 3 END,
                     a.username COLLATE NOCASE
            LIMIT ? OFFSET ?
            """;
        List<UserRow> users = new ArrayList<>();
        try (Connection connection = open(); PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setLong(1, requesterId);
            statement.setLong(2, requesterId);
            statement.setLong(3, requesterId);
            statement.setLong(4, requesterId);
            statement.setLong(5, requesterId);
            statement.setString(6, pattern);
            statement.setInt(7, limit);
            statement.setInt(8, offset);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    users.add(new UserRow(result.getLong("id"), result.getString("username"), result.getString("friendship"), false, result.getLong("created_at")));
                }
            }
        }
        return users;
    }

    List<UserRow> listFriends(long accountId) throws SQLException {
        String sql = """
            SELECT a.id,a.username,a.created_at FROM friendships f
            JOIN accounts a ON a.id = CASE WHEN f.user_low = ? THEN f.user_high ELSE f.user_low END
            WHERE f.user_low = ? OR f.user_high = ?
            ORDER BY a.username COLLATE NOCASE
            """;
        List<UserRow> users = new ArrayList<>();
        try (Connection connection = open(); PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setLong(1, accountId);
            statement.setLong(2, accountId);
            statement.setLong(3, accountId);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    users.add(new UserRow(result.getLong("id"), result.getString("username"), "friends", false, result.getLong("created_at")));
                }
            }
        }
        return users;
    }

    boolean isFriend(long first, long second) throws SQLException {
        long low = Math.min(first, second), high = Math.max(first, second);
        try (Connection connection = open();
             PreparedStatement statement = connection.prepareStatement("SELECT 1 FROM friendships WHERE user_low = ? AND user_high = ?")) {
            statement.setLong(1, low);
            statement.setLong(2, high);
            try (ResultSet result = statement.executeQuery()) {
                return result.next();
            }
        }
    }

    String requestFriend(long fromId, long toId, long now) throws SQLException {
        if (fromId == toId) return "You cannot add yourself.";
        if (isFriend(fromId, toId)) return "You are already friends.";
        try (Connection connection = open();
             PreparedStatement reverse = connection.prepareStatement(
                 "SELECT status FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'")) {
            reverse.setLong(1, toId);
            reverse.setLong(2, fromId);
            try (ResultSet result = reverse.executeQuery()) {
                if (result.next()) return "incoming";
            }
        }
        try (Connection connection = open();
             PreparedStatement statement = connection.prepareStatement("""
                 INSERT INTO friend_requests(from_id,to_id,status,created_at,responded_at)
                 VALUES(?,?,'pending',?,NULL)
                 ON CONFLICT(from_id,to_id) DO UPDATE SET status='pending',created_at=excluded.created_at,responded_at=NULL
                 """)) {
            statement.setLong(1, fromId);
            statement.setLong(2, toId);
            statement.setLong(3, now);
            statement.executeUpdate();
            return "sent";
        }
    }

    boolean respondFriend(long requesterId, long currentId, boolean accept, long now) throws SQLException {
        try (Connection connection = open()) {
            connection.setAutoCommit(false);
            try (PreparedStatement update = connection.prepareStatement(
                "UPDATE friend_requests SET status = ?, responded_at = ? WHERE from_id = ? AND to_id = ? AND status = 'pending'")) {
                update.setString(1, accept ? "accepted" : "declined");
                update.setLong(2, now);
                update.setLong(3, requesterId);
                update.setLong(4, currentId);
                if (update.executeUpdate() != 1) {
                    connection.rollback();
                    return false;
                }
            }
            if (accept) {
                long low = Math.min(requesterId, currentId), high = Math.max(requesterId, currentId);
                try (PreparedStatement insert = connection.prepareStatement(
                    "INSERT OR IGNORE INTO friendships(user_low,user_high,created_at) VALUES(?,?,?)")) {
                    insert.setLong(1, low);
                    insert.setLong(2, high);
                    insert.setLong(3, now);
                    insert.executeUpdate();
                }
            }
            connection.commit();
            return true;
        }
    }

    void removeFriend(long first, long second) throws SQLException {
        long low = Math.min(first, second), high = Math.max(first, second);
        try (Connection connection = open()) {
            connection.setAutoCommit(false);
            try (PreparedStatement delete = connection.prepareStatement("DELETE FROM friendships WHERE user_low = ? AND user_high = ?")) {
                delete.setLong(1, low);
                delete.setLong(2, high);
                delete.executeUpdate();
            }
            try (PreparedStatement requests = connection.prepareStatement(
                "DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)")) {
                requests.setLong(1, first);
                requests.setLong(2, second);
                requests.setLong(3, second);
                requests.setLong(4, first);
                requests.executeUpdate();
            }
            connection.commit();
        }
    }

    MessageRow addMessage(long senderId, Long recipientId, String channel, String body, long now) throws SQLException {
        long id;
        try (Connection connection = open();
             PreparedStatement statement = connection.prepareStatement(
                 "INSERT INTO messages(sender_id,recipient_id,channel,body,created_at) VALUES(?,?,?,?,?)",
                 Statement.RETURN_GENERATED_KEYS)) {
            statement.setLong(1, senderId);
            if (recipientId == null) statement.setNull(2, java.sql.Types.INTEGER); else statement.setLong(2, recipientId);
            statement.setString(3, channel);
            statement.setString(4, body);
            statement.setLong(5, now);
            statement.executeUpdate();
            try (ResultSet keys = statement.getGeneratedKeys()) {
                if (!keys.next()) throw new SQLException("No message id was returned.");
                id = keys.getLong(1);
            }
        }
        return findMessage(id).orElseThrow(() -> new SQLException("Message could not be reloaded."));
    }

    Optional<MessageRow> findMessage(long id) throws SQLException {
        try (Connection connection = open();
             PreparedStatement statement = connection.prepareStatement(messageSelect() + " WHERE m.id = ?")) {
            statement.setLong(1, id);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? Optional.of(readMessage(result)) : Optional.empty();
            }
        }
    }

    List<MessageRow> listDirect(long first, long second, long afterId, int limit) throws SQLException {
        String sql = messageSelect() + """
            WHERE m.channel = 'direct' AND m.id > ? AND
              ((m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?))
            ORDER BY m.id ASC LIMIT ?
            """;
        List<MessageRow> messages = new ArrayList<>();
        try (Connection connection = open(); PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setLong(1, afterId);
            statement.setLong(2, first);
            statement.setLong(3, second);
            statement.setLong(4, second);
            statement.setLong(5, first);
            statement.setInt(6, limit);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) messages.add(readMessage(result));
            }
        }
        return messages;
    }

    List<MessageRow> listChannel(long accountId, String channel, long afterId, int limit) throws SQLException {
        String condition;
        if ("friends".equals(channel)) {
            condition = """
                m.channel = 'friends' AND (m.sender_id = ? OR EXISTS (
                  SELECT 1 FROM friendships f
                  WHERE f.user_low = MIN(m.sender_id, ?) AND f.user_high = MAX(m.sender_id, ?)
                ))
                """;
        } else {
            condition = "m.channel = 'global'";
        }
        String sql = messageSelect() + " WHERE m.id > ? AND " + condition + " ORDER BY m.id ASC LIMIT ?";
        List<MessageRow> messages = new ArrayList<>();
        try (Connection connection = open(); PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setLong(1, afterId);
            int index = 2;
            if ("friends".equals(channel)) {
                statement.setLong(index++, accountId);
                statement.setLong(index++, accountId);
                statement.setLong(index++, accountId);
            }
            statement.setInt(index, limit);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) messages.add(readMessage(result));
            }
        }
        return messages;
    }

    void cleanup(long now) throws SQLException {
        try (Connection connection = open(); Statement statement = connection.createStatement()) {
            statement.executeUpdate("DELETE FROM sessions WHERE expires_at <= " + now);
            statement.executeUpdate("DELETE FROM minecraft_codes WHERE expires_at <= " + now + " OR used_at IS NOT NULL");
        }
    }

    private static String messageSelect() {
        return """
            SELECT m.id,m.sender_id,s.username AS sender,m.recipient_id,r.username AS recipient,
                   m.channel,m.body,m.created_at
            FROM messages m
            JOIN accounts s ON s.id = m.sender_id
            LEFT JOIN accounts r ON r.id = m.recipient_id
            """;
    }

    private static Account readAccount(ResultSet result) throws SQLException {
        long last = result.getLong("last_login_at");
        Long lastLogin = result.wasNull() ? null : last;
        return new Account(
            result.getLong("id"),
            result.getString("username"),
            result.getString("password_hash"),
            result.getString("minecraft_uuid"),
            result.getInt("disabled") != 0,
            result.getLong("created_at"),
            lastLogin
        );
    }

    private static MessageRow readMessage(ResultSet result) throws SQLException {
        long recipient = result.getLong("recipient_id");
        Long recipientId = result.wasNull() ? null : recipient;
        return new MessageRow(
            result.getLong("id"),
            result.getLong("sender_id"),
            result.getString("sender"),
            recipientId,
            result.getString("recipient"),
            result.getString("channel"),
            result.getString("body"),
            result.getLong("created_at")
        );
    }
}
