package me.selahmc.account;

import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.EntityPickupItemEvent;
import org.bukkit.event.entity.FoodLevelChangeEvent;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryOpenEvent;
import org.bukkit.event.player.PlayerCommandPreprocessEvent;
import org.bukkit.event.player.PlayerDropItemEvent;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerItemConsumeEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.player.PlayerSwapHandItemsEvent;

import java.sql.SQLException;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;

/**
 * Login gate for SelahMC website accounts.
 *
 * The account is selected exclusively from the Minecraft name that joined the
 * server. A player cannot type another username into /login. The supplied
 * password is immediately replaced with a masked command and the command is
 * cancelled before Bukkit command dispatch.
 */
final class PasswordAuthGateListener implements Listener {
    private static final long ATTEMPT_WINDOW_MS = 10L * 60L * 1000L;
    private static final int DEFAULT_MAX_ATTEMPTS = 5;

    private final SelahAccountSocialPlugin plugin;
    private final Map<UUID, Deque<Long>> loginAttempts = new ConcurrentHashMap<>();

    PasswordAuthGateListener(SelahAccountSocialPlugin plugin) {
        this.plugin = plugin;
    }

    private boolean blocked(Player player) {
        return !plugin.isAuthenticated(player);
    }

    private void remind(Player player) {
        player.sendActionBar(Component.text(
            "Create your account at selahmc.me/social, then use /login <website-password>",
            NamedTextColor.LIGHT_PURPLE
        ));
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        plugin.unauthenticate(player);
        if (!blocked(player)) return;
        player.setInvulnerable(true);
        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            if (player.isOnline() && blocked(player)) remind(player);
        }, 20L);
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        loginAttempts.remove(event.getPlayer().getUniqueId());
        plugin.playerQuit(event.getPlayer());
    }

    /**
     * Consume /login before normal command handling so the real password is
     * never broadcast as chat or handed to the ordinary command executor.
     */
    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = false)
    public void onPasswordLogin(PlayerCommandPreprocessEvent event) {
        String original = event.getMessage();
        String lower = original.toLowerCase(Locale.ROOT);
        if (!lower.equals("/login") && !lower.startsWith("/login ")) return;

        // Replace the event payload immediately for later listeners/command-spy
        // plugins, then cancel normal dispatch.
        event.setMessage("/login ********");
        event.setCancelled(true);

        Player player = event.getPlayer();
        if (plugin.isAuthenticated(player)) {
            player.sendMessage(Component.text("You are already logged in.", NamedTextColor.GREEN));
            return;
        }

        String password = original.length() <= 7 ? "" : original.substring(7);
        if (password.isBlank()) {
            player.sendMessage(Component.text(
                "Usage: /login <the password you created on selahmc.me/social>",
                NamedTextColor.LIGHT_PURPLE
            ));
            return;
        }
        if (password.length() > 128) {
            player.sendMessage(Component.text("That password is too long.", NamedTextColor.RED));
            return;
        }
        attemptPasswordLogin(player, password);
    }

    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = false)
    public void onAuthStatus(PlayerCommandPreprocessEvent event) {
        String command = event.getMessage().trim().toLowerCase(Locale.ROOT);
        if (!command.equals("/authstatus")) return;
        event.setCancelled(true);
        Player player = event.getPlayer();
        if (plugin.isAuthenticated(player)) {
            String username = plugin.authenticatedAccount(player).map(Account::username).orElse("staff bypass");
            player.sendMessage(Component.text("Logged into SelahMC as " + username + ".", NamedTextColor.GREEN));
        } else {
            player.sendMessage(Component.text(
                "Not logged in. Create the matching website account, then use /login <website-password>.",
                NamedTextColor.RED
            ));
        }
    }

    private void attemptPasswordLogin(Player player, String password) {
        if (!recordAttempt(player)) {
            player.sendMessage(Component.text(
                "Too many incorrect login attempts. Wait a few minutes before trying again.",
                NamedTextColor.RED
            ));
            return;
        }

        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                Account account = plugin.database().findAccountByUsername(player.getName())
                    .orElseThrow(() -> new LoginError(
                        "No website account exists for " + player.getName() + ". Sign up at selahmc.me/social first."
                    ));

                if (account.disabled()) throw new LoginError("This SelahMC account is disabled.");
                if (!Security.verifyPassword(password, account.passwordHash())) {
                    throw new LoginError("Incorrect password for " + player.getName() + ".");
                }

                Optional<Account> uuidOwner = plugin.database().findAccountByMinecraftUuid(player.getUniqueId().toString());
                if (uuidOwner.isPresent() && uuidOwner.get().id() != account.id()) {
                    throw new LoginError("This Minecraft identity is already linked to another SelahMC account.");
                }
                if (account.minecraftUuid() != null
                    && !account.minecraftUuid().equalsIgnoreCase(player.getUniqueId().toString())) {
                    throw new LoginError(
                        "This account is linked to a different Minecraft identity. Ask staff to reset the account link."
                    );
                }

                plugin.database().bindMinecraftUuid(account.id(), player.getUniqueId().toString());
                plugin.database().markLastLogin(account.id(), System.currentTimeMillis());
                Account refreshed = plugin.database().findAccountById(account.id()).orElse(account);

                Bukkit.getScheduler().runTask(plugin, () -> {
                    if (!player.isOnline()) return;
                    loginAttempts.remove(player.getUniqueId());
                    plugin.authenticate(player, refreshed);
                });
            } catch (LoginError error) {
                Bukkit.getScheduler().runTask(plugin, () -> {
                    if (player.isOnline()) player.sendMessage(Component.text(error.getMessage(), NamedTextColor.RED));
                });
            } catch (Exception error) {
                plugin.getLogger().log(Level.WARNING, "Password login failed for " + player.getName(), error);
                Bukkit.getScheduler().runTask(plugin, () -> {
                    if (player.isOnline()) player.sendMessage(Component.text(
                        "The SelahMC login service is temporarily unavailable.",
                        NamedTextColor.RED
                    ));
                });
            }
        });
    }

    private boolean recordAttempt(Player player) {
        int maximum = Math.max(3, plugin.getConfig().getInt("auth.minecraft-login-attempts-per-10-minutes", DEFAULT_MAX_ATTEMPTS));
        long now = System.currentTimeMillis();
        Deque<Long> attempts = loginAttempts.computeIfAbsent(player.getUniqueId(), ignored -> new ArrayDeque<>());
        synchronized (attempts) {
            while (!attempts.isEmpty() && now - attempts.peekFirst() > ATTEMPT_WINDOW_MS) attempts.removeFirst();
            if (attempts.size() >= maximum) return false;
            attempts.addLast(now);
            return true;
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = false)
    public void onCommandGate(PlayerCommandPreprocessEvent event) {
        if (!blocked(event.getPlayer())) return;
        String command = event.getMessage().trim().toLowerCase(Locale.ROOT);
        if (command.equals("/login ********") || command.equals("/authstatus")) return;
        event.setCancelled(true);
        remind(event.getPlayer());
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = false)
    public void onMove(PlayerMoveEvent event) {
        if (!blocked(event.getPlayer()) || event.getTo() == null) return;
        Location from = event.getFrom();
        Location to = event.getTo();
        if (from.getWorld() != to.getWorld() || from.distanceSquared(to) > 0.0001D) {
            event.setTo(new Location(from.getWorld(), from.getX(), from.getY(), from.getZ(), to.getYaw(), to.getPitch()));
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = false)
    public void onChat(AsyncChatEvent event) {
        Player player = event.getPlayer();
        if (blocked(player)) {
            event.setCancelled(true);
            Bukkit.getScheduler().runTask(plugin, () -> remind(player));
            return;
        }

        Account account = plugin.authenticatedAccount(player).orElse(null);
        if (account == null) return;
        String message = PlainTextComponentSerializer.plainText().serialize(event.message());
        message = Security.cleanMessage(message, plugin.getConfig().getInt("chat.max-message-length", 500));
        if (message.isBlank()) {
            event.setCancelled(true);
            return;
        }
        if (!plugin.getConfig().getBoolean("chat.global-enabled", true)) return;

        event.setCancelled(true);
        String finalMessage = message;
        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                plugin.database().addMessage(account.id(), null, "global", finalMessage, System.currentTimeMillis());
                Bukkit.getScheduler().runTask(plugin, () -> plugin.sendGlobalMessage(account, finalMessage));
            } catch (SQLException error) {
                plugin.getLogger().log(Level.WARNING, "Could not save global chat message.", error);
                Bukkit.getScheduler().runTask(plugin, () -> player.sendMessage(Component.text(
                    "The chat database is temporarily unavailable.",
                    NamedTextColor.RED
                )));
            }
        });
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = false)
    public void onInteract(PlayerInteractEvent event) {
        if (blocked(event.getPlayer())) { event.setCancelled(true); remind(event.getPlayer()); }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = false)
    public void onInteractEntity(PlayerInteractEntityEvent event) {
        if (blocked(event.getPlayer())) { event.setCancelled(true); remind(event.getPlayer()); }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = false)
    public void onBreak(BlockBreakEvent event) {
        if (blocked(event.getPlayer())) { event.setCancelled(true); remind(event.getPlayer()); }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = false)
    public void onPlace(BlockPlaceEvent event) {
        if (blocked(event.getPlayer())) { event.setCancelled(true); remind(event.getPlayer()); }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = false)
    public void onDrop(PlayerDropItemEvent event) {
        if (blocked(event.getPlayer())) { event.setCancelled(true); remind(event.getPlayer()); }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = false)
    public void onPickup(EntityPickupItemEvent event) {
        if (event.getEntity() instanceof Player player && blocked(player)) event.setCancelled(true);
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = false)
    public void onInventoryOpen(InventoryOpenEvent event) {
        if (event.getPlayer() instanceof Player player && blocked(player)) {
            event.setCancelled(true);
            remind(player);
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = false)
    public void onInventoryClick(InventoryClickEvent event) {
        if (event.getWhoClicked() instanceof Player player && blocked(player)) event.setCancelled(true);
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = false)
    public void onConsume(PlayerItemConsumeEvent event) {
        if (blocked(event.getPlayer())) event.setCancelled(true);
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = false)
    public void onSwap(PlayerSwapHandItemsEvent event) {
        if (blocked(event.getPlayer())) event.setCancelled(true);
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = false)
    public void onDamage(EntityDamageEvent event) {
        if (event.getEntity() instanceof Player player && blocked(player)) event.setCancelled(true);
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = false)
    public void onDamageOther(EntityDamageByEntityEvent event) {
        if (event.getDamager() instanceof Player player && blocked(player)) event.setCancelled(true);
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = false)
    public void onHunger(FoodLevelChangeEvent event) {
        if (event.getEntity() instanceof Player player && blocked(player)) event.setCancelled(true);
    }

    private static final class LoginError extends Exception {
        LoginError(String message) {
            super(message);
        }
    }
}
