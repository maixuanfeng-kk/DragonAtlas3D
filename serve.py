from __future__ import annotations

import argparse
import functools
import http.server
import mimetypes
import socketserver
from pathlib import Path


mimetypes.add_type("application/javascript; charset=UTF-8", ".js")
mimetypes.add_type("application/javascript; charset=UTF-8", ".mjs")
mimetypes.add_type("text/css; charset=UTF-8", ".css")
mimetypes.add_type("application/json; charset=UTF-8", ".json")


class ModuleFriendlyHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "application/javascript; charset=UTF-8",
        ".mjs": "application/javascript; charset=UTF-8",
        ".css": "text/css; charset=UTF-8",
        ".json": "application/json; charset=UTF-8",
    }

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument(
        "--directory",
        default=str(Path(__file__).resolve().parent),
    )
    args = parser.parse_args()

    handler = functools.partial(ModuleFriendlyHandler, directory=args.directory)

    class ReusableTCPServer(socketserver.TCPServer):
        allow_reuse_address = True

    with ReusableTCPServer((args.host, args.port), handler) as server:
        print(f"Serving DragonAtlas3D on http://{args.host}:{args.port}")
        server.serve_forever()


if __name__ == "__main__":
    main()
