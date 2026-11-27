import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    from .log_parser import LogParser
except ImportError:
    from log_parser import LogParser

LOG_DIR = os.environ.get("SQUAD_LOG_DIR", "/logs")
parser = LogParser()
lock = threading.Lock()
cursor_path = None
cursor_inode = None
cursor_size = 0
partial = b""
bootstrap_size = None
bootstrap_parser = None


def poll_logs():
    global cursor_path, cursor_inode, cursor_size, partial, parser, bootstrap_size, bootstrap_parser
    path = os.path.join(LOG_DIR, "SquadGame.log")
    if not os.path.isfile(path):
        return
    try:
        stat = os.stat(path)
        inode = getattr(stat, "st_ino", None)
        replaced = path != cursor_path or inode != cursor_inode or stat.st_size < cursor_size
        if replaced:
            parser = LogParser()
            bootstrap_parser = LogParser() if path == os.path.join(LOG_DIR, "SquadGame.log") else None
            bootstrap_size = None
            cursor_path, cursor_inode, cursor_size, partial = path, inode, 0, b""
        with open(path, "rb") as log:
            log.seek(cursor_size)
            chunk = log.read()
            bytes_read = len(chunk)
        cursor_size += bytes_read
        lines = (partial + chunk).split(b"\n")
        partial = lines.pop()
        if bootstrap_parser is not None:
            for raw in lines:
                try:
                    bootstrap_parser.feed(raw.decode("utf-8", errors="ignore"))
                except Exception:
                    continue
            if bootstrap_size is None:
                bootstrap_size = cursor_size
            elif cursor_size > bootstrap_size:
                # Only trust replayed state after this canonical file demonstrably grew while watched.
                parser = bootstrap_parser
                bootstrap_parser = None
                bootstrap_size = None
            return
        for raw in lines:
            try:
                parser.feed(raw.decode("utf-8", errors="ignore"))
            except Exception:
                continue
    except (OSError, ValueError):
        return


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?", 1)[0] != "/status":
            self.send_error(404)
            return
        with lock:
            poll_logs()
            body = json.dumps(parser.snapshot(), separators=(",", ":")).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            pass

    def log_message(self, *_args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8081), Handler).serve_forever()
