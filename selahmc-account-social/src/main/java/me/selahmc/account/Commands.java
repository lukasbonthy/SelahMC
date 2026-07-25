package me.selahmc.account;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.Callable;
import java.util.logging.Level;
import java.util.stream.Collectors;

final class Commands implements CommandExecutor, TabCompleter {
    private final SelahAccountSocialPlugin plugin;

    Commands(SelahAccountSocialPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        String name = command.getName().toLowerCase(Locale.ROOT);
        if (name.equals("accountadmin")) return admin(sender, args);
        if (!(sender instanceof Player player)) {
            sender.sendMessage("This command must be used by a player.");
            return true;
        }
        return switch (name) {
            case "login" -> login(player, args);
            case "authstatus" -> status(player);
            case "friend" -> friend(player, args);
            case "msg" -> message(player, args);
            case "reply" -> reply(player, args);
            case "friendchat" -> friendChat(player, args);
            case "globalchat" -> globalChat(player, args);
            default -> false;
        };
    }

    private boolean login(Player player, String[] args) {
        if (plugin.isAuthenticated(player)) {
            player.sendMessage(Component.text("You are already logged in.", NamedTextColor.GREEN));
            return true;
        }
        if (args.length != 1 || !args[0].matches("\\d{8}")) {
            player.sendMessage(Component.text("Open selahmc.me/social, log in, generate a Minecraft code, then use /login <8-digit-code>.", NamedTextColor.LIGHT_PURPLE));
            return true;
        }
        String codeHash = Security.sha256(args[0]);
        runAsync(player, () -> {
            long now = System.currentTimeMillis();
            MinecraftCode code = plugin.database().consumeMinecraftCode(codeHash, now)
                .orElseThrow(() -> new UserError("That login code is invalid, expired, or already used."));
            if (!code.username().equalsIgnoreCase(player.getName())) {
                throw new UserError("That code belongs to Minecraft username " + code.username() + ", not " + player.getName() + ".");
            }
            Account account = plugin.database().findAccountById(code.accountId())
                .orElseThrow(() -> new UserError("That website account no longer exists."));
            if (account.disabled()) throw new UserError("This SelahMC account is disabled.");

            Optional<Account> uuidOwner = plugin.database().findAccountByMinecraftUuid(player.getUniqueId().toString());
            if (uuidOwner.isPresent() && uuidOwner.get().id() != account.id()) {
                throw new UserError("This Minecraft identity is already linked to another SelahMC account.");
            }
            plugin.database().bindMinecraftUuid(account.id(), player.getUniqueId().toString());
            plugin.database().markLastLogin(account.id(), now);
            return plugin.database().findAccountById(account.id()).orElse(account);
        }, account -> plugin.authenticate(player, account));
        return true;
    }

    private boolean status(Player player) {
        if (plugin.isAuthenticated(player)) {
            String username = plugin.authenticatedAccount(player).map(Account::username).orElse("bypass account");
            player.sendMessage(Component.text("Logged in as " + username + ".", NamedTextColor.GREEN));
        } else {
            player.sendMessage(Component.text("Not logged in. Visit selahmc.me/social and generate a Minecraft login code.", NamedTextColor.RED));
        }
        return true;
    }

    private boolean friend(Player player, String[] args) {
        Account self = requireAccount(player);
        if (self == null) return true;
        if (args.length == 0 || args[0].equalsIgnoreCase("list")) {
            runAsync(player, () -> plugin.database().listFriends(self.id()), friends -> {
                if (friends.isEmpty()) {
                    player.sendMessage(Component.text("You do not have any friends yet. Browse everyone at selahmc.me/social.", NamedTextColor.GRAY));
                    return;
                }
                player.sendMessage(Component.text("Friends: ", NamedTextColor.LIGHT_PURPLE)
                    .append(Component.text(friends.stream().map(UserRow::username).collect(Collectors.joining(", ")), NamedTextColor.WHITE)));
            });
            return true;
        }
        if (args.length < 2) {
            player.sendMessage(Component.text("Usage: /friend <add|accept|decline|remove|list> [player]", NamedTextColor.RED));
            return true;
        }
        String action = args[0].toLowerCase(Locale.ROOT);
        String targetName = args[1];
        runAsync(player, () -> {
            Account target = plugin.database().findAccountByUsername(targetName)
                .orElseThrow(() -> new UserError("No registered SelahMC account was found for " + targetName + "."));
            if (target.id() == self.id()) throw new UserError("You cannot add yourself.");
            long now = System.currentTimeMillis();
            return switch (action) {
                case "add" -> {
                    String result = plugin.database().requestFriend(self.id(), target.id(), now);
                    if (result.equals("incoming")) throw new UserError(target.username() + " already sent you a request. Use /friend accept " + target.username());
                    if (!result.equals("sent")) throw new UserError(result);
                    yield "Friend request sent to " + target.username() + ".";
                }
                case "accept" -> {
                    if (!plugin.database().respondFriend(target.id(), self.id(), true, now)) throw new UserError("No incoming request from " + target.username() + ".");
                    yield "You and " + target.username() + " are now friends.";
                }
                case "decline" -> {
                    if (!plugin.database().respondFriend(target.id(), self.id(), false, now)) throw new UserError("No incoming request from " + target.username() + ".");
                    yield "Friend request declined.";
                }
                case "remove" -> {
                    plugin.database().removeFriend(self.id(), target.id());
                    yield "Removed " + target.username() + " from your friends.";
                }
                default -> throw new UserError("Unknown friend action: " + action);
            };
        }, result -> player.sendMessage(Component.text(result, NamedTextColor.LIGHT_PURPLE)));
        return true;
    }

    private boolean message(Player player, String[] args) {
        Account self = requireAccount(player);
        if (self == null) return true;
        if (args.length < 2) {
            player.sendMessage(Component.text("Usage: /msg <friend> <message>", NamedTextColor.RED));
            return true;
        }
        String targetName = args[0];
        String body = Security.cleanMessage(String.join(" ", java.util.Arrays.copyOfRange(args, 1, args.length)), maxMessageLength());
        sendDirect(player, self, targetName, body);
        return true;
    }

    private boolean reply(Player player, String[] args) {
        Account self = requireAccount(player);
        if (self == null) return true;
        if (args.length == 0) {
            player.sendMessage(Component.text("Usage: /reply <message>", NamedTextColor.RED));
            return true;
        }
        String target = plugin.replyTarget(player).orElse(null);
        if (target == null) {
            player.sendMessage(Component.text("There is nobody to reply to yet.", NamedTextColor.RED));
            return true;
        }
        String body = Security.cleanMessage(String.join(" ", args), maxMessageLength());
        sendDirect(player, self, target, body);
        return true;
    }

    private void sendDirect(Player player, Account self, String targetName, String body) {
        if (body.isBlank()) {
            player.sendMessage(Component.text("Message cannot be empty.", NamedTextColor.RED));
            return;
        }
        runAsync(player, () -> {
            Account target = plugin.database().findAccountByUsername(targetName)
                .orElseThrow(() -> new UserError("No registered user named " + targetName + "."));
            if (!plugin.database().isFriend(self.id(), target.id())) throw new UserError("You can only direct-message friends.");
            plugin.database().addMessage(self.id(), target.id(), "direct", body, System.currentTimeMillis());
            return target;
        }, target -> plugin.sendDirectMessage(self, target, body));
    }

    private boolean friendChat(Player player, String[] args) {
        Account self = requireAccount(player);
        if (self == null) return true;
        if (args.length == 0) {
            player.sendMessage(Component.text("Usage: /friendchat <message>", NamedTextColor.RED));
            return true;
        }
        if (!plugin.getConfig().getBoolean("chat.friends-feed-enabled", true)) {
            player.sendMessage(Component.text("Friends chat is disabled.", NamedTextColor.RED));
            return true;
        }
        String body = Security.cleanMessage(String.join(" ", args), maxMessageLength());
        runAsync(player, () -> {
            List<UserRow> friends = plugin.database().listFriends(self.id());
            plugin.database().addMessage(self.id(), null, "friends", body, System.currentTimeMillis());
            return friends.stream().map(UserRow::id).toList();
        }, friendIds -> plugin.sendFriendsMessage(self, body, friendIds));
        return true;
    }

    private boolean globalChat(Player player, String[] args) {
        Account self = requireAccount(player);
        if (self == null) return true;
        if (args.length == 0) {
            player.sendMessage(Component.text("Usage: /globalchat <message>", NamedTextColor.RED));
            return true;
        }
        if (!plugin.getConfig().getBoolean("chat.global-enabled", true)) {
            player.sendMessage(Component.text("Global chat is disabled.", NamedTextColor.RED));
            return true;
        }
        String body = Security.cleanMessage(String.join(" ", args), maxMessageLength());
        runAsync(player, () -> plugin.database().addMessage(self.id(), null, "global", body, System.currentTimeMillis()), ignored -> plugin.sendGlobalMessage(self, body));
        return true;
    }

    private boolean admin(CommandSender sender, String[] args) {
        if (!sender.hasPermission("selahaccount.admin")) {
            sender.sendMessage(Component.text("You do not have permission.", NamedTextColor.RED));
            return true;
        }
        if (args.length < 2) {
            sender.sendMessage(Component.text("Usage: /accountadmin <logout|disable|enable|reset-sessions> <player>", NamedTextColor.RED));
            return true;
        }
        String action = args[0].toLowerCase(Locale.ROOT), targetName = args[1];
        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                Account target = plugin.database().findAccountByUsername(targetName)
                    .orElseThrow(() -> new UserError("No account named " + targetName + "."));
                switch (action) {
                    case "disable" -> { plugin.database().setDisabled(target.id(), true); plugin.database().deleteSessionsForAccount(target.id()); }
                    case "enable" -> plugin.database().setDisabled(target.id(), false);
                    case "reset-sessions" -> plugin.database().deleteSessionsForAccount(target.id());
                    case "logout" -> { }
                    default -> throw new UserError("Unknown admin action: " + action);
                }
                Bukkit.getScheduler().runTask(plugin, () -> {
                    if (action.equals("logout") || action.equals("disable")) plugin.onlinePlayer(target.id()).ifPresent(plugin::unauthenticate);
                    sender.sendMessage(Component.text("Account action completed for " + target.username() + ".", NamedTextColor.GREEN));
                });
            } catch (UserError error) {
                Bukkit.getScheduler().runTask(plugin, () -> sender.sendMessage(Component.text(error.getMessage(), NamedTextColor.RED)));
            } catch (Exception error) {
                plugin.getLogger().log(Level.WARNING, "Account admin command failed.", error);
                Bukkit.getScheduler().runTask(plugin, () -> sender.sendMessage(Component.text("The account database is temporarily unavailable.", NamedTextColor.RED)));
            }
        });
        return true;
    }

    private Account requireAccount(Player player) {
        Account account = plugin.authenticatedAccount(player).orElse(null);
        if (account == null) {
            if (plugin.isAuthenticated(player)) {
                player.sendMessage(Component.text("Your operator bypass lets you play, but social features require a website account at selahmc.me/social.", NamedTextColor.YELLOW));
            } else {
                player.sendMessage(Component.text("Log in first with /login <code>.", NamedTextColor.RED));
            }
        }
        return account;
    }

    private int maxMessageLength() {
        return plugin.getConfig().getInt("chat.max-message-length", 500);
    }

    private <T> void runAsync(Player player, Callable<T> work, java.util.function.Consumer<T> success) {
        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                T result = work.call();
                Bukkit.getScheduler().runTask(plugin, () -> {
                    if (player.isOnline()) success.accept(result);
                });
            } catch (UserError error) {
                Bukkit.getScheduler().runTask(plugin, () -> {
                    if (player.isOnline()) player.sendMessage(Component.text(error.getMessage(), NamedTextColor.RED));
                });
            } catch (Exception error) {
                plugin.getLogger().log(Level.WARNING, "SelahMC account command failed.", error);
                Bukkit.getScheduler().runTask(plugin, () -> {
                    if (player.isOnline()) player.sendMessage(Component.text("The SelahMC account service is temporarily unavailable.", NamedTextColor.RED));
                });
            }
        });
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (command.getName().equalsIgnoreCase("friend") && args.length == 1) {
            return filter(List.of("add", "accept", "decline", "remove", "list"), args[0]);
        }
        if (command.getName().equalsIgnoreCase("accountadmin") && args.length == 1) {
            return filter(List.of("logout", "disable", "enable", "reset-sessions"), args[0]);
        }
        if ((command.getName().equalsIgnoreCase("friend") && args.length == 2)
            || (command.getName().equalsIgnoreCase("msg") && args.length == 1)
            || (command.getName().equalsIgnoreCase("accountadmin") && args.length == 2)) {
            List<String> names = Bukkit.getOnlinePlayers().stream().map(Player::getName).toList();
            return filter(names, args[args.length - 1]);
        }
        return List.of();
    }

    private static List<String> filter(Collection<String> values, String prefix) {
        String lower = prefix.toLowerCase(Locale.ROOT);
        return values.stream().filter(value -> value.toLowerCase(Locale.ROOT).startsWith(lower)).sorted().toList();
    }

    static final class UserError extends Exception {
        UserError(String message) { super(message); }
    }
}
