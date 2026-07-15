"""Vercel serverless entry — routes all /api/* to the KAFI Python backend."""
import os
import sys
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from server import KAFIHandler  # noqa: E402


class handler(KAFIHandler):
    """API-only handler for Vercel (static HTML served by the CDN)."""

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if not path.startswith("/api"):
            self.send_error(404, "Not found")
            return
        super().do_GET()

    def log_message(self, format, *args):
        msg = format % args
        if "/api/" in msg or "POST" in msg:
            print(f"  → {msg}")
