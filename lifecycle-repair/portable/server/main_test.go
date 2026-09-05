package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
)

func TestBrowserCommandUsesTheBuiltInWindowsURLHandler(t *testing.T) {
	name, arguments := browserCommand("windows", "http://127.0.0.1:3001/")
	if name != "rundll32.exe" {
		t.Fatalf("Windows browser command = %q, want rundll32.exe", name)
	}
	wantArguments := []string{"url.dll,FileProtocolHandler", "http://127.0.0.1:3001/"}
	if len(arguments) != len(wantArguments) {
		t.Fatalf("Windows browser arguments = %#v, want %#v", arguments, wantArguments)
	}
	for index := range wantArguments {
		if arguments[index] != wantArguments[index] {
			t.Fatalf("Windows browser arguments = %#v, want %#v", arguments, wantArguments)
		}
	}
}

func TestStaticHandlerServesIndexAssetsAndRanges(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "index.html"), []byte("portable index"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "client.wasm"), []byte("wasm bytes"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "assets.epk"), []byte("0123456789"), 0o644); err != nil {
		t.Fatal(err)
	}

	handler, err := newStaticHandler(root)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(handler)
	defer server.Close()

	response, err := http.Get(server.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("GET / status = %d, want 200", response.StatusCode)
	}
	if string(body) != "portable index" {
		t.Fatalf("GET / body = %q, want portable index", body)
	}
	if got := response.Header.Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}
	if got := response.Header.Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("X-Content-Type-Options = %q, want nosniff", got)
	}

	wasmResponse, err := http.Get(server.URL + "/client.wasm")
	if err != nil {
		t.Fatal(err)
	}
	wasmResponse.Body.Close()
	if got := wasmResponse.Header.Get("Content-Type"); got != "application/wasm" {
		t.Fatalf("wasm Content-Type = %q, want application/wasm", got)
	}

	request, err := http.NewRequest(http.MethodGet, server.URL+"/assets.epk", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Range", "bytes=2-5")
	rangeResponse, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer rangeResponse.Body.Close()
	rangeBody, err := io.ReadAll(rangeResponse.Body)
	if err != nil {
		t.Fatal(err)
	}
	if rangeResponse.StatusCode != http.StatusPartialContent {
		t.Fatalf("range status = %d, want 206", rangeResponse.StatusCode)
	}
	if string(rangeBody) != "2345" {
		t.Fatalf("range body = %q, want 2345", rangeBody)
	}
	if got := rangeResponse.Header.Get("Content-Type"); got != "application/octet-stream" {
		t.Fatalf("epk Content-Type = %q, want application/octet-stream", got)
	}
}

func TestStaticHandlerRejectsTraversalAndWrites(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "index.html"), []byte("portable index"), 0o644); err != nil {
		t.Fatal(err)
	}
	handler, err := newStaticHandler(root)
	if err != nil {
		t.Fatal(err)
	}

	traversal := httptest.NewRequest(http.MethodGet, "http://localhost/", nil)
	traversal.URL = &url.URL{Path: "/../secret.txt", RawPath: "/%2e%2e/secret.txt"}
	traversalResult := httptest.NewRecorder()
	handler.ServeHTTP(traversalResult, traversal)
	if traversalResult.Code != http.StatusNotFound {
		t.Fatalf("traversal status = %d, want 404", traversalResult.Code)
	}

	writeRequest := httptest.NewRequest(http.MethodPost, "http://localhost/", nil)
	writeResult := httptest.NewRecorder()
	handler.ServeHTTP(writeResult, writeRequest)
	if writeResult.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST status = %d, want 405", writeResult.Code)
	}
}
