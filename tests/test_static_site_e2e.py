"""GitHub Pages simulation: the site built exactly like .github/workflows/deploy.yml,
served by a plain static file server under /DeutschMaster/ — no Flask, no /api.
MyMemory is mocked with page.route so the test does not depend on the internet.
"""
import functools
import json
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

playwright_api = pytest.importorskip("playwright.sync_api")
from e2e_helpers import free_port, launch_browser  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MYMEMORY = "https://api.mymemory.translated.net/**"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@pytest.fixture(scope="module")
def site(tmp_path_factory):
    root = tmp_path_factory.mktemp("pages")
    out = root / "DeutschMaster"          # served at /DeutschMaster/ like a project page
    shutil.copytree(ROOT / "frontend", out)
    (out / "data").mkdir()
    shutil.copy(ROOT / "data" / "words.json", out / "data" / "words.json")
    port = free_port()
    httpd = ThreadingHTTPServer(("127.0.0.1", port), functools.partial(QuietHandler, directory=str(root)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{port}/DeutschMaster/"
    httpd.shutdown()


@pytest.fixture(scope="module")
def browser():
    with playwright_api.sync_playwright() as p:
        try:
            b = launch_browser(p)
        except RuntimeError as exc:
            pytest.skip(str(exc))
        yield b
        b.close()


@pytest.fixture()
def page(browser, site):
    ctx = browser.new_context(viewport={"width": 1366, "height": 900})
    errors = []
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    # the API probe 404 is expected on GitHub Pages; anything else is a real error
    def on_console(m):
        url = str((m.location or {}).get("url") or "")
        external_font = "fonts.googleapis" in url or "fonts.gstatic" in url  # optional, may fail offline
        if m.type == "error" and not external_font and "404" not in m.text and "ERR_FAILED" not in m.text:
            errors.append(f"{m.text} @ {url}")
    pg.on("console", on_console)
    pg.errors = errors
    pg.goto(site)
    pg.wait_for_selector("html[data-ready=true]", timeout=15000)
    yield pg
    ctx.close()
    assert not errors, errors


def test_static_mode_loads_all_pages(page, site):
    assert page.evaluate("async () => (await import('./js/api.js')).api.mode()") == "static"
    for route in ["dashboard", "daily", "flashcards", "quiz", "writing", "matching", "revision",
                  "dictionary", "favorites", "difficult", "statistics", "settings"]:
        page.goto(f"{site}#/{route}")
        page.wait_for_selector("#view h2")
        assert "Ma’lumotlarni yuklab bo‘lmadi" not in page.inner_text("#view"), route


def test_static_mode_daily_and_quiz(page, site):
    page.goto(f"{site}#/daily")
    page.wait_for_selector("#dw-list .word-card")
    assert page.locator("#dw-list .word-card").count() == 10
    page.locator("[data-action=learn]").first.click()
    state = page.evaluate("() => JSON.parse(localStorage.getItem('deutschmaster:v1'))")
    assert len(state["learned"]) == 1
    page.goto(f"{site}#/quiz?count=5")
    page.click("#quiz-start")
    assert page.locator(".option").count() == 4


def test_static_mode_dictionary_search_and_topics(page, site):
    page.goto(f"{site}#/dictionary")
    words = json.loads((ROOT / "data" / "words.json").read_text(encoding="utf-8"))["words"]
    page.wait_for_selector(".dict-row")
    assert page.locator(".dict-row").count() == 100  # paged
    assert page.inner_text("#dc-count") == f"{len(words)} ta so‘z"
    assert page.locator("#dc-topic option").count() == 15  # "Barchasi" + 14 topics
    page.fill("#dc-q", "o'qituvchi")
    page.wait_for_function("() => document.querySelector('#dc-count').textContent.includes('qituvchi')")
    assert page.locator(".dict-row").first.inner_text().startswith("der Lehrer")
    assert page.locator("#dc-offline").is_hidden()


def test_static_mode_translation_mymemory(page):
    calls = []

    def handle(route):
        calls.append(route.request.url)
        route.fulfill(status=200, content_type="application/json",
                      headers={"Access-Control-Allow-Origin": "*"},
                      body=json.dumps({"responseStatus": 200, "responseData": {"translatedText": "Salom, do&#39;stim"}}))

    page.route(MYMEMORY, handle)
    page.goto(page.url.split("#")[0] + "#/dictionary")
    page.fill("#tr-text", "Hallo Freund")
    page.click("#tr-btn")
    page.wait_for_selector("#tr-result .badge")
    assert "MyMemory" in page.inner_text("#tr-result") and "Salom, do'stim" in page.inner_text("#tr-result")
    assert "langpair=de%7Cuz" in calls[0] and "q=Hallo+Freund" in calls[0]


def test_static_mode_translation_falls_back_to_local(page):
    page.route(MYMEMORY, lambda route: route.abort())
    page.goto(page.url.split("#")[0] + "#/dictionary")
    page.fill("#tr-text", "Hund")
    page.click("#tr-btn")
    page.wait_for_selector("#tr-result .badge")
    assert "Lokal" in page.inner_text("#tr-result") and page.inner_text("#tr-result .word-uz") == "it"
