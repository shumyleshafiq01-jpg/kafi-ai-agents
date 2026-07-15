"""Shared data directory — local disk vs Vercel /tmp."""
import os

_BASE = os.path.dirname(os.path.abspath(__file__))


def data_dir():
    custom = os.environ.get("KAFI_DATA_DIR", "").strip()
    if custom:
        return custom
    if os.environ.get("VERCEL"):
        path = "/tmp/kafi-data"
        os.makedirs(path, exist_ok=True)
        return path
    return os.path.join(_BASE, "data")


def data_path(filename):
    return os.path.join(data_dir(), filename)


def base_url():
    return os.environ.get("KAFI_BASE_URL", "http://localhost:8000").rstrip("/")


def outlook_callback_url():
    return f"{base_url()}/api/outlook/callback"
