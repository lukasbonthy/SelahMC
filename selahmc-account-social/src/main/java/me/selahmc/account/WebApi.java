package me.selahmc.account;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.bukkit.Bukkit;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.logging.Level;

final class WebApi {
    private static final int MAX_BODY_BYTES = 32_768;
    private final SelahAccountSocialPlugin plugin;
    private final Gson gson = new Gson();
    private final RateLimiter rateLimiter = new RateLimiter();
    private HttpServer server;
    private ExecutorService executor;

    WebApi(SelahAccountSocialPlugin plugin) {
        this.plugin = plugin;
    }

    void start() throws IOException {
        String bind = plugin.getConfig().getString("web.bind", "127.0.0.1");
        int port = plugin.getConfig().getInt("web.port", 8788);
        server = HttpServer.create(new InetSocketAddress(bind, port), 0);
        executor = Executors.newVirtualThreadPerTaskExecutor();
        server.setExecutor(executor);
        server.createContext("/", this::handle);
        server.start();
    }

    void stop() {
        if (server != null) server.stop(1);
        if (executor != null) executor.close();
    }

    private void handle(HttpExchange exchange) throws IOException {
        try {
            exchange.getResponseHeaders().set("Cache-Control", "no-store");
            exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
            exchange.getResponseHeaders().set("Referrer-Policy", "same-origin");

            if (!originAllowed(exchange)) {
                sendError(exchange, 403, "This request did not originate from SelahMC.");
                return;
            }
            if (exchange.getRequestMethod().equalsIgnoreCase("OPTIONS")) {
                exchange.sendResponseHeaders(204, -1);
                exchange.close();
                return;
            }

            String path = exchange.getRequestURI().getPath();
            String method = exchange.getRequestMethod().toUpperCase(Locale.ROOT);
            switch (path) {
                case "/health" -> health(exchange, method);
                case "/auth/signup" -> signup(exchange, method);
                case "/auth/login" -> login(exchange, method);
                case "/auth/logout" -> logout(exchange, method);
                case "/auth/me" -> me(exchange, method);
                case "/auth/minecraft-code" -> minecraftCode(exchange, method);
                case "/social/users" -> users(exchange, method);
                case "/social/friends" -> friends(exchange, method);
                case "/social/friend-request" -> friendRequest(exchange, method);
                case "/social/friend-respond" -> friendRespond(exchange, method);
                case "/social/friend-remove" -> friendRemove(exchange, method);
                case "/social/messages" -> messages(exchange, method);
                case "/social/friends-feed" -> friendsFeed(exchange, method);
                case "/social/global" -> global(exchange, method);
                default -> sendError(exchange, 404, "API route not found.");
            }
        } catch (ClientError error) {
            sendError(exchange, error.status, error.getMessage());
        } catch (Exception error) {
            plugin.getLogger().log(Level.WARNING, "Website account API request failed: " + exchange.getRequestURI(), error);
            sendError(exchange, 500, "The SelahMC account service is temporarily unavailable.");
        }
    }

    private void health(HttpExchange exchange, String method) throws IOException {
        requireMethod(method, "GET");
        sendJson(exchange, 200, Map.of("ok", true, "service", "SelahMCAccountSocial", "version", "3.0.0"));
    }

    private void signup(HttpExchange exchange, String method) throws Exception {
        requireMethod(method, "POST");
        JsonObject body = readJson(exchange);
        String username = string(body, "username").trim();
        String password = string(body, "password");
        String remote = remoteKey(exchange) + ":signup";
        if (!rateLimiter.allow(remote, 6, 15 * 60_000L)) throw new ClientError(429, "Too many signup attempts. Please wait a few minutes.");
        if (!Security.validUsername(username)) throw new ClientError(400, "Minecraft username must be 3–24 characters using letters, numbers, underscore, dash, or period.");
        String passwordError = Security.validatePassword(password, plugin.getConfig().getInt("auth.password-min-length", 10));
        if (passwordError != null) throw new ClientError(400, passwordError);
        if (plugin.database().findAccountByUsername(username).isPresent()) throw new ClientError(409, "That Minecraft username already has a SelahMC account.");

        int cost = Math.max(10, Math.min(14, plugin.getConfig().getInt("auth.bcrypt-cost", 12)));
        String passwordHash = Security.hashPassword(password, cost);
        Account account;
        try {
            account = plugin.database().createAccount(username, passwordHash, System.currentTimeMillis());
        } catch (SQLException duplicate) {
            throw new ClientError(409, "That Minecraft username already has a SelahMC account.");
        }
        SessionResult session = createSession(account);
        setSessionCookie(exchange, session.rawToken, session.expiresAt);
        sendJson(exchange, 201, authPayload(account, session.csrfToken));
    }

    private void login(HttpExchange exchange, String method) throws Exception {
        requireMethod(method, "POST");
        JsonObject body = readJson(exchange);
        String username = string(body, "username").trim();
        String password = string(body, "password");
        int maxAttempts = plugin.getConfig().getInt("auth.login-attempts-per-15-minutes", 8);
        String key = remoteKey(exchange) + ":login:" + Security.normalizeUsername(username);
        if (!rateLimiter.allow(key, maxAttempts, 15 * 60_000L)) throw new ClientError(429, "Too many login attempts. Please wait before trying again.");

        Account account = plugin.database().findAccountByUsername(username).orElse(null);
        boolean verified = account != null && Security.verifyPassword(password, account.passwordHash());
        if (!verified) throw new ClientError(401, "Incorrect username or password.");
        if (account.disabled()) throw new ClientError(403, "This SelahMC account is disabled.");

        SessionResult session = createSession(account);
        plugin.database().markLastLogin(account.id(), System.currentTimeMillis());
        setSessionCookie(exchange, session.rawToken, session.expiresAt);
        sendJson(exchange, 200, authPayload(account, session.csrfToken));
    }

    private void logout(HttpExchange exchange, String method) throws Exception {
        requireMethod(method, "POST");
        AuthContext auth = requireAuth(exchange, true);
        plugin.database().deleteSession(auth.tokenHash);
        exchange.getResponseHeaders().add("Set-Cookie", "selah_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
        sendJson(exchange, 200, Map.of("ok", true));
    }

    private void me(HttpExchange exchange, String method) throws Exception {
        requireMethod(method, "GET");
        AuthContext auth = requireAuth(exchange, false);
        sendJson(exchange, 200, authPayload(auth.account, auth.session.csrfToken()));
    }

    private void minecraftCode(HttpExchange exchange, String method) throws Exception {
        requireMethod(method, "POST");
        AuthContext auth = requireAuth(exchange, true);
        int seconds = Math.max(60, plugin.getConfig().getInt("auth.code-expiry-seconds", 300));
        long now = System.currentTimeMillis(), expiresAt = now + seconds * 1000L;
        String code = null;
        SQLException lastError = null;
        for (int attempt = 0; attempt < 5; attempt++) {
            String candidate = Security.numericCode(8);
            try {
                plugin.database().createMinecraftCode(Security.sha256(candidate), auth.account.id(), auth.account.username(), expiresAt, now);
                code = candidate;
                break;
            } catch (SQLException collision) {
                lastError = collision;
            }
        }
        if (code == null) throw lastError == null ? new SQLException("Could not create login code.") : lastError;
        sendJson(exchange, 201, Map.of(
            "ok", true,
            "code", code,
            "command", "/login " + code,
            "username", auth.account.username(),
            "expiresAt", expiresAt
        ));
    }

    private void users(HttpExchange exchange, String method) throws Exception {
        requireMethod(method, "GET");
        AuthContext auth = requireAuth(exchange, false);
        Map<String, String> query = query(exchange.getRequestURI());
        String search = query.getOrDefault("q", "");
        int page = clampInt(query.get("page"), 1, 1, 100_000);
        int limit = clampInt(query.get("limit"), 40, 1, 100);
        List<UserRow> rows = plugin.database().listUsers(auth.account.id(), search, limit, (page - 1) * limit);
        List<Map<String, Object>> users = rows.stream().map(this::userPayload).toList();
        sendJson(exchange, 200, Map.of("ok", true, "users", users, "page", page, "limit", limit));
    }

    private void friends(HttpExchange exchange, String method) throws Exception {
        requireMethod(method, "GET");
        AuthContext auth = requireAuth(exchange, false);
        List<Map<String, Object>> friends = plugin.database().listFriends(auth.account.id()).stream().map(this::userPayload).toList();
        sendJson(exchange, 200, Map.of("ok", true, "friends", friends));
    }

    private void friendRequest(HttpExchange exchange, String method) throws Exception {
        requireMethod(method, "POST");
        AuthContext auth = requireAuth(exchange, true);
        JsonObject body = readJson(exchange);
        Account target = targetAccount(body);
        String result = plugin.database().requestFriend(auth.account.id(), target.id(), System.currentTimeMillis());
        if (result.equals("incoming")) {
            sendJson(exchange, 409, Map.of("ok", false, "error", target.username() + " already sent you a request.", "incoming", true));
            return;
        }
        if (!result.equals("sent")) throw new ClientError(409, result);
        plugin.onlinePlayer(target.id()).ifPresent(player -> player.sendMessage(net.kyori.adventure.text.Component.text(
            auth.account.username() + " sent you a friend request. Open selahmc.me/social or use /friend accept " + auth.account.username(),
            net.kyori.adventure.text.format.NamedTextColor.LIGHT_PURPLE
        )));
        sendJson(exchange, 201, Map.of("ok", true, "status", "outgoing"));
    }

    private void friendRespond(HttpExchange exchange, String method) throws Exception {
        requireMethod(method, "POST");
        AuthContext auth = requireAuth(exchange, true);
        JsonObject body = readJson(exchange);
        Account target = targetAccount(body);
        String action = string(body, "action").toLowerCase(Locale.ROOT);
        boolean accept = action.equals("accept");
        if (!accept && !action.equals("decline")) throw new ClientError(400, "Action must be accept or decline.");
        if (!plugin.database().respondFriend(target.id(), auth.account.id(), accept, System.currentTimeMillis())) {
            throw new ClientError(404, "No pending friend request from " + target.username() + ".");
        }
        if (accept) plugin.onlinePlayer(target.id()).ifPresent(player -> player.sendMessage(net.kyori.adventure.text.Component.text(
            auth.account.username() + " accepted your friend request.",
            net.kyori.adventure.text.format.NamedTextColor.GREEN
        )));
        sendJson(exchange, 200, Map.of("ok", true, "status", accept ? "friends" : "none"));
    }

    private void friendRemove(HttpExchange exchange, String method) throws Exception {
        requireMethod(method, "POST");
        AuthContext auth = requireAuth(exchange, true);
        Account target = targetAccount(readJson(exchange));
        plugin.database().removeFriend(auth.account.id(), target.id());
        sendJson(exchange, 200, Map.of("ok", true));
    }

    private void messages(HttpExchange exchange, String method) throws Exception {
        AuthContext auth = requireAuth(exchange, method.equals("POST"));
        if (method.equals("GET")) {
            Map<String, String> query = query(exchange.getRequestURI());
            Account target = findTarget(query.get("with"));
            if (!plugin.database().isFriend(auth.account.id(), target.id())) throw new ClientError(403, "Direct messages are available between friends.");
            long after = clampLong(query.get("after"), 0, 0, Long.MAX_VALUE);
            List<Map<String, Object>> messages = plugin.database().listDirect(auth.account.id(), target.id(), after, 150).stream().map(this::messagePayload).toList();
            sendJson(exchange, 200, Map.of("ok", true, "with", userPayload(new UserRow(target.id(), target.username(), "friends", plugin.isAccountOnline(target.id()), target.createdAt())), "messages", messages));
            return;
        }
        requireMethod(method, "POST");
        JsonObject body = readJson(exchange);
        Account target = targetAccount(body);
        if (!plugin.database().isFriend(auth.account.id(), target.id())) throw new ClientError(403, "You can only direct-message friends.");
        String message = cleanBody(body);
        MessageRow row = plugin.database().addMessage(auth.account.id(), target.id(), "direct", message, System.currentTimeMillis());
        Bukkit.getScheduler().runTask(plugin, () -> plugin.sendDirectMessage(auth.account, target, message));
        sendJson(exchange, 201, Map.of("ok", true, "message", messagePayload(row)));
    }

    private void friendsFeed(HttpExchange exchange, String method) throws Exception {
        AuthContext auth = requireAuth(exchange, method.equals("POST"));
        if (method.equals("GET")) {
            Map<String, String> query = query(exchange.getRequestURI());
            long after = clampLong(query.get("after"), 0, 0, Long.MAX_VALUE);
            List<Map<String, Object>> messages = plugin.database().listChannel(auth.account.id(), "friends", after, 150).stream().map(this::messagePayload).toList();
            sendJson(exchange, 200, Map.of("ok", true, "messages", messages));
            return;
        }
        requireMethod(method, "POST");
        if (!plugin.getConfig().getBoolean("chat.friends-feed-enabled", true)) throw new ClientError(403, "Friends chat is disabled.");
        String message = cleanBody(readJson(exchange));
        MessageRow row = plugin.database().addMessage(auth.account.id(), null, "friends", message, System.currentTimeMillis());
        List<Long> friendIds = plugin.database().listFriends(auth.account.id()).stream().map(UserRow::id).toList();
        Bukkit.getScheduler().runTask(plugin, () -> plugin.sendFriendsMessage(auth.account, message, friendIds));
        sendJson(exchange, 201, Map.of("ok", true, "message", messagePayload(row)));
    }

    private void global(HttpExchange exchange, String method) throws Exception {
        AuthContext auth = requireAuth(exchange, method.equals("POST"));
        if (method.equals("GET")) {
            Map<String, String> query = query(exchange.getRequestURI());
            long after = clampLong(query.get("after"), 0, 0, Long.MAX_VALUE);
            List<Map<String, Object>> messages = plugin.database().listChannel(auth.account.id(), "global", after, 150).stream().map(this::messagePayload).toList();
            sendJson(exchange, 200, Map.of("ok", true, "messages", messages));
            return;
        }
        requireMethod(method, "POST");
        if (!plugin.getConfig().getBoolean("chat.global-enabled", true)) throw new ClientError(403, "Global chat is disabled.");
        String message = cleanBody(readJson(exchange));
        MessageRow row = plugin.database().addMessage(auth.account.id(), null, "global", message, System.currentTimeMillis());
        Bukkit.getScheduler().runTask(plugin, () -> plugin.sendGlobalMessage(auth.account, message));
        sendJson(exchange, 201, Map.of("ok", true, "message", messagePayload(row)));
    }

    private SessionResult createSession(Account account) throws SQLException {
        String rawToken = Security.randomToken(32);
        String csrf = Security.randomToken(24);
        long now = System.currentTimeMillis();
        long expiresAt = now + Math.max(1, plugin.getConfig().getInt("web.session-days", 30)) * 86_400_000L;
        plugin.database().createSession(Security.sha256(rawToken), account.id(), csrf, expiresAt, now);
        return new SessionResult(rawToken, csrf, expiresAt);
    }

    private AuthContext requireAuth(HttpExchange exchange, boolean csrfRequired) throws Exception {
        String rawToken = cookie(exchange, "selah_session");
        if (rawToken == null || rawToken.isBlank()) throw new ClientError(401, "Please log in first.");
        String tokenHash = Security.sha256(rawToken);
        Session session = plugin.database().findSession(tokenHash, System.currentTimeMillis())
            .orElseThrow(() -> new ClientError(401, "Your session expired. Please log in again."));
        Account account = plugin.database().findAccountById(session.accountId())
            .orElseThrow(() -> new ClientError(401, "This account no longer exists."));
        if (account.disabled()) throw new ClientError(403, "This account is disabled.");
        if (csrfRequired) {
            String supplied = exchange.getRequestHeaders().getFirst("X-CSRF-Token");
            if (supplied == null || !MessageDigestSafe.equals(supplied, session.csrfToken())) {
                throw new ClientError(403, "Security token mismatch. Refresh the page and try again.");
            }
        }
        return new AuthContext(account, session, tokenHash);
    }

    private Account targetAccount(JsonObject body) throws Exception {
        return findTarget(string(body, "username"));
    }

    private Account findTarget(String username) throws Exception {
        if (username == null || username.isBlank()) throw new ClientError(400, "Choose a player first.");
        return plugin.database().findAccountByUsername(username.trim())
            .orElseThrow(() -> new ClientError(404, "No registered user named " + username + "."));
    }

    private String cleanBody(JsonObject body) throws ClientError {
        String message = Security.cleanMessage(string(body, "message"), plugin.getConfig().getInt("chat.max-message-length", 500));
        if (message.isBlank()) throw new ClientError(400, "Message cannot be empty.");
        return message;
    }

    private Map<String, Object> authPayload(Account account, String csrf) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("ok", true);
        payload.put("csrf", csrf);
        payload.put("account", Map.of(
            "id", account.id(),
            "username", account.username(),
            "minecraftLinked", account.minecraftUuid() != null,
            "createdAt", account.createdAt(),
            "online", plugin.isAccountOnline(account.id())
        ));
        return payload;
    }

    private Map<String, Object> userPayload(UserRow user) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", user.id());
        payload.put("username", user.username());
        payload.put("friendship", user.friendship());
        payload.put("online", plugin.isAccountOnline(user.id()));
        payload.put("createdAt", user.createdAt());
        return payload;
    }

    private Map<String, Object> messagePayload(MessageRow message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", message.id());
        payload.put("senderId", message.senderId());
        payload.put("sender", message.sender());
        payload.put("recipientId", message.recipientId());
        payload.put("recipient", message.recipient());
        payload.put("channel", message.channel());
        payload.put("body", message.body());
        payload.put("createdAt", message.createdAt());
        return payload;
    }

    private JsonObject readJson(HttpExchange exchange) throws IOException, ClientError {
        byte[] body = exchange.getRequestBody().readNBytes(MAX_BODY_BYTES + 1);
        if (body.length > MAX_BODY_BYTES) throw new ClientError(413, "Request is too large.");
        if (body.length == 0) return new JsonObject();
        try {
            JsonElement value = JsonParser.parseString(new String(body, StandardCharsets.UTF_8));
            if (!value.isJsonObject()) throw new ClientError(400, "JSON object required.");
            return value.getAsJsonObject();
        } catch (RuntimeException invalid) {
            throw new ClientError(400, "Invalid JSON request.");
        }
    }

    private static String string(JsonObject body, String key) {
        JsonElement value = body.get(key);
        return value == null || value.isJsonNull() ? "" : value.getAsString();
    }

    private boolean originAllowed(HttpExchange exchange) {
        String origin = exchange.getRequestHeaders().getFirst("Origin");
        if (origin == null || origin.isBlank()) return true;
        String allowed = plugin.getConfig().getString("web.public-origin", "https://selahmc.me");
        return origin.equalsIgnoreCase(allowed);
    }

    private static String remoteKey(HttpExchange exchange) {
        String forwarded = exchange.getRequestHeaders().getFirst("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) return forwarded.split(",", 2)[0].trim();
        return exchange.getRemoteAddress().getAddress().getHostAddress();
    }

    private static String cookie(HttpExchange exchange, String name) {
        List<String> headers = exchange.getRequestHeaders().getOrDefault("Cookie", List.of());
        for (String header : headers) {
            for (String part : header.split(";")) {
                String[] pair = part.trim().split("=", 2);
                if (pair.length == 2 && pair[0].equals(name)) return pair[1];
            }
        }
        return null;
    }

    private void setSessionCookie(HttpExchange exchange, String rawToken, long expiresAt) {
        long maxAge = Math.max(0, (expiresAt - System.currentTimeMillis()) / 1000L);
        exchange.getResponseHeaders().add("Set-Cookie",
            "selah_session=" + rawToken + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge);
    }

    private static Map<String, String> query(URI uri) {
        Map<String, String> result = new HashMap<>();
        String raw = uri.getRawQuery();
        if (raw == null || raw.isBlank()) return result;
        for (String pair : raw.split("&")) {
            String[] value = pair.split("=", 2);
            String key = URLDecoder.decode(value[0], StandardCharsets.UTF_8);
            String decoded = value.length == 2 ? URLDecoder.decode(value[1], StandardCharsets.UTF_8) : "";
            result.put(key, decoded);
        }
        return result;
    }

    private static void requireMethod(String actual, String expected) throws ClientError {
        if (!actual.equals(expected)) throw new ClientError(405, "Method not allowed.");
    }

    private void sendError(HttpExchange exchange, int status, String message) throws IOException {
        sendJson(exchange, status, Map.of("ok", false, "error", message));
    }

    private void sendJson(HttpExchange exchange, int status, Object value) throws IOException {
        byte[] data = gson.toJson(value).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, data.length);
        exchange.getResponseBody().write(data);
        exchange.close();
    }

    private static int clampInt(String value, int fallback, int minimum, int maximum) {
        try { return Math.max(minimum, Math.min(maximum, Integer.parseInt(value))); }
        catch (Exception ignored) { return fallback; }
    }

    private static long clampLong(String value, long fallback, long minimum, long maximum) {
        try { return Math.max(minimum, Math.min(maximum, Long.parseLong(value))); }
        catch (Exception ignored) { return fallback; }
    }

    private record SessionResult(String rawToken, String csrfToken, long expiresAt) {}
    private record AuthContext(Account account, Session session, String tokenHash) {}

    private static final class ClientError extends Exception {
        private final int status;
        private ClientError(int status, String message) { super(message); this.status = status; }
    }

    private static final class RateLimiter {
        private final Map<String, Deque<Long>> attempts = new ConcurrentHashMap<>();

        boolean allow(String key, int maximum, long windowMillis) {
            long now = System.currentTimeMillis();
            Deque<Long> times = attempts.computeIfAbsent(key, ignored -> new ArrayDeque<>());
            synchronized (times) {
                while (!times.isEmpty() && times.peekFirst() <= now - windowMillis) times.removeFirst();
                if (times.size() >= maximum) return false;
                times.addLast(now);
                return true;
            }
        }
    }

    private static final class MessageDigestSafe {
        static boolean equals(String first, String second) {
            if (first == null || second == null) return false;
            byte[] a = first.getBytes(StandardCharsets.UTF_8);
            byte[] b = second.getBytes(StandardCharsets.UTF_8);
            return java.security.MessageDigest.isEqual(a, b);
        }
    }
}
