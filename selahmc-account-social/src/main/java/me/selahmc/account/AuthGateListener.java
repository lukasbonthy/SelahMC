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
import java.util.Locale;
import java.util.logging.Level;

final class AuthGateListener implements Listener {
    private final SelahAccountSocialPlugin plugin;

    AuthGateListener(SelahAccountSocialPlugin plugin) {
        this.plugin = plugin;
    }

    private boolean blocked(Player player) {
        return !plugin.isAuthenticated(player);
    }

    private void remind(Player player) {
        player.sendActionBar(Component.text("Create or log into your account at selahmc.me/social, then use /login <code>", NamedTextColor.LIGHT_PURPLE));
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        plugin.unauthenticate(player);
        if (blocked(player)) {
            player.setInvulnerable(true);
            Bukkit.getScheduler().runTaskLater(plugin, () -> {
                if (player.isOnline() && blocked(player)) remind(player);
            }, 20L);
        }
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        plugin.playerQuit(event.getPlayer());
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
    public void onCommand(PlayerCommandPreprocessEvent event) {
        if (!blocked(event.getPlayer())) return;
        String command = event.getMessage().trim().toLowerCase(Locale.ROOT);
        if (command.equals("/login") || command.startsWith("/login ") || command.equals("/authstatus")) return;
        event.setCancelled(true);
        remind(event.getPlayer());
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
                Bukkit.getScheduler().runTask(plugin, () -> player.sendMessage(Component.text("The chat database is temporarily unavailable.", NamedTextColor.RED)));
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
        if (event.getPlayer() instanceof Player player && blocked(player)) { event.setCancelled(true); remind(player); }
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
}
