package me.selahmc.account;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.title.Title;
import org.bukkit.Bukkit;
import org.bukkit.command.PluginCommand;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.nio.file.Path;
import java.sql.SQLException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;

public final class SelahAccountSocialPlugin extends JavaPlugin {
    private final Map<UUID, Account> authenticated = new ConcurrentHashMap<>();
    private final Map<Long, UUID> onlineAccounts = new ConcurrentHashMap<>();
    private final Map<UUID, String> replyTargets = new ConcurrentHashMap<>();

    private Database database;
    private WebApi webApi;
    private boolean requireLogin;
    private boolean bypassOps;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        requireLogin = getConfig().getBoolean("auth.require-login", true);
        bypassOps = getConfig().getBoolean("auth.bypass-ops", true);

        try {
            Path databaseFile = getDataFolder().toPath().resolve(getConfig().getString("storage.database-file", "accounts-social.db"));
            database = new Database(databaseFile);
            database.init();
        } catch (Exception error) {
            getLogger().log(Level.SEVERE, "Could not initialize SelahMC account storage.", error);
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        AuthGateListener listener = new AuthGateListener(this);
        getServer().getPluginManager().registerEvents(listener, this);

        Commands commands = new Commands(this);
        for (String name : List.of("login", "authstatus", "friend", "msg", "reply", "friendchat", "globalchat", "accountadmin")) {
            PluginCommand command = getCommand(name);
            if (command == null) {
                getLogger().severe("Command missing from plugin.yml: " + name);
                continue;
            }
            command.setExecutor(commands);
            command.setTabCompleter(commands);
        }

        try {
            webApi = new WebApi(this);
            webApi.start();
        } catch (Exception error) {
            getLogger().log(Level.SEVERE, "Could not start the SelahMC account website API.", error);
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        long reminderTicks = Math.max(40L, getConfig().getLong("auth.reminder-seconds", 4L) * 20L);
        Bukkit.getScheduler().runTaskTimer(this, this::sendLoginReminders, 20L, reminderTicks);
        Bukkit.getScheduler().runTaskTimerAsynchronously(this, () -> {
            try {
                database.cleanup(System.currentTimeMillis());
            } catch (SQLException error) {
                getLogger().log(Level.WARNING, "Could not clean expired account sessions.", error);
            }
        }, 20L * 60L, 20L * 300L);

        getLogger().info("SelahMC Account + Social v3.0.0 enabled.");
        getLogger().info("Website API listening on " + getConfig().getString("web.bind", "127.0.0.1") + ":" + getConfig().getInt("web.port", 8788));
        getLogger().info("Unauthenticated players are " + (requireLogin ? "blocked until login" : "allowed while enforcement is disabled") + ".");
    }

    @Override
    public void onDisable() {
        if (webApi != null) webApi.stop();
        authenticated.clear();
        onlineAccounts.clear();
        replyTargets.clear();
    }

    Database database() {
        return database;
    }

    boolean requiresLogin(Player player) {
        if (!requireLogin) return false;
        if (player.hasPermission("selahaccount.bypass")) return false;
        return !(bypassOps && player.isOp());
    }

    boolean isAuthenticated(Player player) {
        return !requiresLogin(player) || authenticated.containsKey(player.getUniqueId());
    }

    Optional<Account> authenticatedAccount(Player player) {
        return Optional.ofNullable(authenticated.get(player.getUniqueId()));
    }

    void authenticate(Player player, Account account) {
        authenticated.put(player.getUniqueId(), account);
        onlineAccounts.put(account.id(), player.getUniqueId());
        player.setInvulnerable(false);
        player.clearTitle();
        player.sendMessage(Component.text("✓ Logged into SelahMC as ", NamedTextColor.GREEN)
            .append(Component.text(account.username(), NamedTextColor.LIGHT_PURPLE)));
        player.sendMessage(Component.text("Your friends, direct messages, friends chat, and global chat are now available.", NamedTextColor.GRAY));
    }

    void unauthenticate(Player player) {
        Account removed = authenticated.remove(player.getUniqueId());
        if (removed != null) onlineAccounts.remove(removed.id(), player.getUniqueId());
        replyTargets.remove(player.getUniqueId());
        if (requiresLogin(player)) player.setInvulnerable(true);
    }

    void playerQuit(Player player) {
        unauthenticate(player);
    }

    boolean isAccountOnline(long accountId) {
        UUID playerId = onlineAccounts.get(accountId);
        return playerId != null && Bukkit.getPlayer(playerId) != null;
    }

    Optional<Player> onlinePlayer(long accountId) {
        UUID playerId = onlineAccounts.get(accountId);
        return Optional.ofNullable(playerId == null ? null : Bukkit.getPlayer(playerId));
    }

    Optional<Player> onlinePlayer(String username) {
        for (Map.Entry<UUID, Account> entry : authenticated.entrySet()) {
            if (entry.getValue().username().equalsIgnoreCase(username)) {
                Player player = Bukkit.getPlayer(entry.getKey());
                if (player != null) return Optional.of(player);
            }
        }
        return Optional.empty();
    }

    Set<Long> onlineAccountIds() {
        return Set.copyOf(onlineAccounts.keySet());
    }

    Collection<Player> authenticatedPlayers() {
        List<Player> players = new ArrayList<>();
        for (UUID id : authenticated.keySet()) {
            Player player = Bukkit.getPlayer(id);
            if (player != null) players.add(player);
        }
        return players;
    }

    void setReplyTarget(Player player, String username) {
        replyTargets.put(player.getUniqueId(), username);
    }

    Optional<String> replyTarget(Player player) {
        return Optional.ofNullable(replyTargets.get(player.getUniqueId()));
    }

    void sendDirectMessage(Account sender, Account recipient, String message) {
        Component formatted = Component.text("[DM] ", NamedTextColor.LIGHT_PURPLE)
            .append(Component.text(sender.username(), NamedTextColor.WHITE))
            .append(Component.text(" → ", NamedTextColor.DARK_GRAY))
            .append(Component.text(recipient.username() + ": ", NamedTextColor.WHITE))
            .append(Component.text(message, NamedTextColor.GRAY));
        onlinePlayer(sender.id()).ifPresent(player -> {
            player.sendMessage(formatted);
            setReplyTarget(player, recipient.username());
        });
        onlinePlayer(recipient.id()).ifPresent(player -> {
            player.sendMessage(formatted);
            setReplyTarget(player, sender.username());
        });
    }

    void sendGlobalMessage(Account sender, String message) {
        Component formatted = Component.text("[Global] ", NamedTextColor.AQUA)
            .append(Component.text(sender.username() + ": ", NamedTextColor.WHITE))
            .append(Component.text(message, NamedTextColor.GRAY));
        for (Player player : authenticatedPlayers()) player.sendMessage(formatted);
    }

    void sendFriendsMessage(Account sender, String message, Collection<Long> friendIds) {
        Component formatted = Component.text("[Friends] ", NamedTextColor.LIGHT_PURPLE)
            .append(Component.text(sender.username() + ": ", NamedTextColor.WHITE))
            .append(Component.text(message, NamedTextColor.GRAY));
        onlinePlayer(sender.id()).ifPresent(player -> player.sendMessage(formatted));
        for (long friendId : friendIds) onlinePlayer(friendId).ifPresent(player -> player.sendMessage(formatted));
    }

    private void sendLoginReminders() {
        for (Player player : Bukkit.getOnlinePlayers()) {
            if (isAuthenticated(player)) continue;
            player.setInvulnerable(true);
            player.sendActionBar(Component.text("Log in at selahmc.me/social, generate a code, then use /login <code>", NamedTextColor.LIGHT_PURPLE));
            player.showTitle(Title.title(
                Component.text("Log into SelahMC", NamedTextColor.LIGHT_PURPLE),
                Component.text("Create your account at selahmc.me/social", NamedTextColor.WHITE),
                Title.Times.times(Duration.ZERO, Duration.ofSeconds(2), Duration.ofMillis(350))
            ));
        }
    }
}
