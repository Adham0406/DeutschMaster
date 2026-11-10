"""Shared helpers for the browser (Playwright) tests: a live Flask server in a thread."""
import socket
import threading

from werkzeug.serving import make_server

from backend import create_app
from backend.config import TestConfig


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class LiveServer:
    def __init__(self):
        self.port = free_port()
        self.app = create_app(TestConfig)
        self.server = make_server("127.0.0.1", self.port, self.app, threaded=True)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *exc):
        self.server.shutdown()


def launch_browser(playwright):
    """Prefer an installed Edge/Chrome (no extra download); fall back to bundled Chromium."""
    errors = []
    for kwargs in ({"channel": "msedge"}, {"channel": "chrome"}, {}):
        try:
            return playwright.chromium.launch(headless=True, **kwargs)
        except Exception as exc:  # noqa: BLE001 - try the next option
            errors.append(f"{kwargs or 'chromium'}: {exc.__class__.__name__}")
    raise RuntimeError("Brauzer topilmadi: " + "; ".join(errors))
