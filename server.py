#!/usr/bin/env python3
"""MCP Visor cinematic site — Tailscale-only static server.

Security posture:
- binds to a Tailscale IP, not 0.0.0.0
- path-traversal safe (resolve + contains-check)
- extension allowlist only
- no directory listing
- no deps beyond stdlib
"""
from __future__ import annotations

import os
import pathlib
import socketserver
import sys
import urllib.parse
from http.server import SimpleHTTPRequestHandler

ROOT = pathlib.Path("/datadisk/hermes/mcp-visor-site").resolve()
HOST = os.environ.get("MCP_VISOR_SITE_HOST", "100.82.251.122")
PORT = int(os.environ.get("MCP_VISOR_SITE_PORT", "8892"))

ROUTES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/doctrine": "doctrine.html",
    "/doctrine.html": "doctrine.html",
    "/research": "research.html",
    "/research.html": "research.html",
    "/install": "install.html",
    "/install.html": "install.html",
    "/favicon.svg": "favicon.svg",
}

ALLOWED_EXT = {
    ".html",
    ".js",
    ".css",
    ".woff2",
    ".woff",
    ".svg",
    ".ico",
    ".webmanifest",
}


def resolve_target(url_path: str) -> pathlib.Path | None:
    raw = urllib.parse.urlparse(url_path).path
    raw = urllib.parse.unquote(raw)
    if raw in ROUTES:
        candidate = (ROOT / ROUTES[raw]).resolve()
    else:
        if not raw.startswith("/assets/"):
            return None
        rel = pathlib.PurePosixPath(raw.lstrip("/"))
        if ".." in rel.parts or rel.is_absolute():
            return None
        candidate = (ROOT / rel).resolve()
    try:
        candidate.relative_to(ROOT)
    except ValueError:
        return None
    if not candidate.is_file():
        return None
    if candidate.suffix.lower() not in ALLOWED_EXT:
        return None
    return candidate


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        target = resolve_target(self.path)
        if target is None:
            self.send_error(404, "Not found")
            return
        data = target.read_bytes()
        ctype = self.guess_type(str(target))
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        if target.suffix.lower() == ".html":
            self.send_header("Cache-Control", "no-store")
        else:
            self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()
        self.wfile.write(data)

    def do_HEAD(self) -> None:
        target = resolve_target(self.path)
        if target is None:
            self.send_error(404, "Not found")
            return
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(str(target)))
        self.send_header("Content-Length", str(target.stat().st_size))
        self.end_headers()

    def log_message(self, fmt: str, *args: object) -> None:
        sys.stderr.write("[mcp-visor-site] %s %s\n" % (self.address_string(), fmt % args))


class ReusableTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    if not ROOT.is_dir():
        sys.stderr.write("[mcp-visor-site] missing root %s\n" % ROOT)
        sys.exit(1)
    server = ReusableTCPServer((HOST, PORT), Handler)
    print(f"[mcp-visor-site] serving {ROOT} on {HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
