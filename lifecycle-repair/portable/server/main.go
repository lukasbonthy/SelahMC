package main

import (
	"errors"
	"flag"
	"fmt"
	"log"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

func newStaticHandler(root string) (http.Handler, error) {
	absoluteRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve client directory: %w", err)
	}
	info, err := os.Stat(absoluteRoot)
	if err != nil {
		return nil, fmt.Errorf("open client directory: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("client path is not a directory: %s", absoluteRoot)
	}

	fileServer := http.FileServer(http.Dir(absoluteRoot))
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet && request.Method != http.MethodHead {
			writer.Header().Set("Allow", "GET, HEAD")
			http.Error(writer, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		requestPath, err := url.PathUnescape(request.URL.EscapedPath())
		if err != nil || containsParentSegment(requestPath) {
			http.NotFound(writer, request)
			return
		}

		writer.Header().Set("Cache-Control", "no-store")
		writer.Header().Set("X-Content-Type-Options", "nosniff")
		switch strings.ToLower(filepath.Ext(requestPath)) {
		case ".epk":
			writer.Header().Set("Content-Type", "application/octet-stream")
		case ".wasm":
			writer.Header().Set("Content-Type", "application/wasm")
		}
		fileServer.ServeHTTP(writer, request)
	}), nil
}

func containsParentSegment(requestPath string) bool {
	normalized := strings.ReplaceAll(requestPath, "\\", "/")
	for _, segment := range strings.Split(normalized, "/") {
		if segment == ".." {
			return true
		}
	}
	return false
}

func browserCommand(goos string, targetURL string) (string, []string) {
	switch goos {
	case "windows":
		return "rundll32.exe", []string{"url.dll,FileProtocolHandler", targetURL}
	case "darwin":
		return "open", []string{targetURL}
	default:
		return "xdg-open", []string{targetURL}
	}
}

func openBrowser(targetURL string) error {
	name, arguments := browserCommand(runtime.GOOS, targetURL)
	return exec.Command(name, arguments...).Start()
}

// Bind the socket while selecting the port, avoiding a probe/bind race.
// Retry address-in-use only; permissions and other failures need their own error.
func listenPortable(firstPort, attempts int) (net.Listener, error) {
	if firstPort < 1 || firstPort > 65535 || attempts < 1 {
		return nil, fmt.Errorf("invalid port range: %d (%d attempts)", firstPort, attempts)
	}
	lastPort := firstPort + min(attempts, 65536-firstPort) - 1
	var lastError error
	for port := firstPort; port <= lastPort; port++ {
		listener, err := net.Listen("tcp4", fmt.Sprintf("127.0.0.1:%d", port))
		if err == nil {
			return listener, nil
		}
		if !errors.Is(err, syscall.EADDRINUSE) {
			return nil, fmt.Errorf("bind localhost port %d: %w", port, err)
		}
		lastError = err
	}
	return nil, fmt.Errorf("localhost ports %d-%d are occupied: %w", firstPort, lastPort, lastError)
}

func run() error {
	root := flag.String("root", "client", "directory containing the SelahMC client")
	port := flag.Int("port", 3001, "localhost TCP port")
	open := flag.Bool("open", true, "open the client in the default browser")
	flag.Parse()

	if *port < 1 || *port > 65535 {
		return fmt.Errorf("invalid port: %d", *port)
	}
	handler, err := newStaticHandler(*root)
	if err != nil {
		return err
	}
	if _, err := os.Stat(filepath.Join(*root, "index.html")); err != nil {
		return fmt.Errorf("client index is missing: %w", err)
	}

	listener, err := listenPortable(*port, 10)
	if err != nil {
		return fmt.Errorf("start localhost server: %w", err)
	}
	defer listener.Close()
	address := listener.Addr().String()

	targetURL := fmt.Sprintf("http://%s/?portable=v8.3.10", address)
	fmt.Println("SelahMC v8.3.10 Portable is running.")
	fmt.Println("Open:", targetURL)
	fmt.Println("Keep this window open while playing. Close it to stop SelahMC.")
	if *open {
		if err := openBrowser(targetURL); err != nil {
			fmt.Println("The browser did not open automatically. Open the URL above.")
		}
	}

	server := &http.Server{
		Handler:           handler,
		IdleTimeout:       90 * time.Second,
		ReadHeaderTimeout: 10 * time.Second,
	}
	err = server.Serve(listener)
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func main() {
	if err := run(); err != nil {
		log.SetFlags(0)
		log.Fatal("SelahMC portable launcher: ", err)
	}
}

func init() {
	_ = mime.AddExtensionType(".epk", "application/octet-stream")
	_ = mime.AddExtensionType(".wasm", "application/wasm")
}
