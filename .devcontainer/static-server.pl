#!/usr/bin/env perl
use strict;
use warnings;
use Cwd qw(abs_path);
use File::Spec;
use IO::Socket::INET;

my $root = abs_path(shift @ARGV // q{.});
my $port = shift @ARGV // 8000;
die "site root is not a directory\n" unless defined $root && -d $root;

my $server = IO::Socket::INET->new(
    LocalAddr => '0.0.0.0',
    LocalPort => $port,
    Listen    => 16,
    ReuseAddr => 1,
    Proto     => 'tcp',
) or die "cannot listen on port $port: $!\n";

$SIG{CHLD} = 'IGNORE';
print "Serving $root at http://0.0.0.0:$port\n";

while (my $client = $server->accept()) {
    my $pid = fork();
    if (!defined $pid) {
        close $client;
        next;
    }
    if ($pid) {
        close $client;
        next;
    }

    close $server;
    $client->autoflush(1);
    binmode $client;
    serve_request($client, $root);
    close $client;
    exit 0;
}

sub serve_request {
    my ($client, $site_root) = @_;
    my $request = <$client>;
    return unless defined $request;
    while (defined(my $header = <$client>)) {
        last if $header =~ /^\r?\n$/;
    }

    my ($method, $path) = $request =~ m{^(GET|HEAD)\s+([^\s]+)\s+HTTP/}i;
    return send_error($client, 405, 'Method Not Allowed') unless defined $method;
    $path =~ s/[?#].*\z//;
    $path =~ s/%([0-9A-Fa-f]{2})/chr(hex($1))/eg;
    $path =~ s{^/+}{};
    $path = 'index.html' if $path eq q{};
    $path .= 'index.html' if $path =~ m{/$};

    if ($path =~ m{(?:^|/)\.\.(?:/|$)} || $path =~ /[\\\0]/) {
        return send_error($client, 403, 'Forbidden');
    }

    my $candidate = File::Spec->catfile($site_root, split m{/}, $path);
    my $resolved = abs_path($candidate);
    if (!defined $resolved || !-f $resolved ||
        !($resolved eq $site_root || index($resolved, "$site_root/") == 0)) {
        return send_error($client, 404, 'Not Found');
    }

    open my $file, '<:raw', $resolved or return send_error($client, 500, 'Read Error');
    my $length = -s $file;
    my $mime = mime_type($resolved);
    print {$client} "HTTP/1.1 200 OK\r\n";
    print {$client} "Content-Type: $mime\r\n";
    print {$client} "Content-Length: $length\r\n";
    print {$client} "Cache-Control: no-store\r\n";
    print {$client} "Connection: close\r\n\r\n";

    if (uc($method) eq 'GET') {
        my $buffer;
        while (read($file, $buffer, 65_536)) {
            print {$client} $buffer;
        }
    }
    close $file;
}

sub send_error {
    my ($client, $status, $message) = @_;
    my $body = "$status $message\n";
    print {$client} "HTTP/1.1 $status $message\r\n";
    print {$client} "Content-Type: text/plain; charset=utf-8\r\n";
    print {$client} 'Content-Length: ' . length($body) . "\r\n";
    print {$client} "Cache-Control: no-store\r\n";
    print {$client} "Connection: close\r\n\r\n$body";
}

sub mime_type {
    my ($path) = @_;
    return 'text/html; charset=utf-8'       if $path =~ /\.html?\z/i;
    return 'text/javascript; charset=utf-8' if $path =~ /\.js\z/i;
    return 'text/css; charset=utf-8'        if $path =~ /\.css\z/i;
    return 'text/plain; charset=utf-8'      if $path =~ /\.(?:lang|txt|md)\z/i;
    return 'image/png'                      if $path =~ /\.png\z/i;
    return 'image/jpeg'                     if $path =~ /\.jpe?g\z/i;
    return 'image/gif'                      if $path =~ /\.gif\z/i;
    return 'application/zip'                if $path =~ /\.zip\z/i;
    return 'application/octet-stream';
}
