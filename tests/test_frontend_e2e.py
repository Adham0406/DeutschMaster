"""Real-browser tests (Playwright + installed Edge/Chrome).

Run: python -m pytest tests/test_frontend_e2e.py
Skipped automatically when Playwright or a browser is not available.
"""
import json
import logging
import re
from pathlib import Path

import pytest

playwright_api = pytest.importorskip("playwright.sync_api")
from e2e_helpers import LiveServer, launch_browser  # noqa: E402

logging.getLogger("werkzeug").setLevel(logging.WARNING)
ROUTES = ["dashboard", "daily", "flashcards", "quiz", "writing", "matching", "revision",
          "dictionary", "favorites", "difficult", "statistics", "settings"]
WORDS = json.loads((Path(__file__).resolve().parent.parent / "data" / "words.json").read_text(encoding="utf-8"))["words"]
SPOKEN_TO_UZ = {(f"{w['article']} {w['german']}" if w["article"] else w["german"]): w["uzbek"] for w in WORDS}
UZ_TO_WORD = {w["uzbek"]: w for w in WORDS}
STATE_KEY = "deutschmaster:v1"


@pytest.fixture(scope="module")
def server():
    with LiveServer() as srv:
        yield srv


@pytest.fixture(scope="module")
def browser():
    with playwright_api.sync_playwright() as p:
        try:
            b = launch_browser(p)
        except RuntimeError as exc:
            pytest.skip(str(exc))
        yield b
        b.close()


class Page:
    """Wraps a Playwright page and records JS errors."""

    def __init__(self, page, base):
        self.p, self.base, self.errors = page, base, []
        page.on("pageerror", lambda e: self.errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: self.errors.append(f"console: {m.text}") if m.type == "error" and not self._external(m) else None)

    @staticmethod
    def _external(msg):
        # Google Fonts are optional (system font fallback); offline failures are not app errors.
        loc = (msg.location or {}).get("url", "")
        return "fonts.googleapis" in loc or "fonts.gstatic" in loc or "fonts.googleapis" in msg.text

    def go(self, route):
        self.p.goto(f"{self.base}/#/{route}")
        self.p.wait_for_selector("html[data-ready=true]", timeout=15000)
        self.p.wait_for_timeout(150)

    def state(self):
        return self.p.evaluate(f"JSON.parse(localStorage.getItem('{STATE_KEY}') || 'null')")

    def set_state(self, patch):
        self.p.evaluate("([k, patch]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({...s, ...patch})); }",
                        [STATE_KEY, patch])


@pytest.fixture()
def page(browser, server):
    ctx = browser.new_context(viewport={"width": 1366, "height": 900}, accept_downloads=True)
    # Speech synthesis is not needed in headless tests; stub it to count calls.
    ctx.add_init_script("window.__spoken=[]; if (window.speechSynthesis) { window.speechSynthesis.speak = (u) => window.__spoken.push(u.text); }")
    pg = Page(ctx.new_page(), server.url)
    pg.go("dashboard")
    yield pg
    errors = list(pg.errors)
    ctx.close()
    assert not errors, f"JavaScript xatolari: {errors}"


def answer_quiz_correctly(pg):
    q = pg.p.locator(".question").inner_text().strip()
    correct = SPOKEN_TO_UZ[q] if q in SPOKEN_TO_UZ else None
    if correct is None:  # uz->de direction
        w = UZ_TO_WORD[q]
        correct = f"{w['article']} {w['german']}" if w["article"] else w["german"]
    pg.p.locator(".option", has_text=re.compile(rf"^\d\s*{re.escape(correct)}$")).first.click()


# ---------------------------------------------------------------- pages & navigation
def test_all_pages_render(page):
    for route in ROUTES:
        page.go(route)
        assert page.p.locator("#view h2").count() >= 1, route
        assert page.p.locator(f'.nav-link[data-route="{route}"]').get_attribute("aria-current") == "page"
    page.go("unknown-page")
    assert page.p.locator("#page-title").inner_text() == "Dashboard"


def test_sidebar_navigation_clicks(page):
    for route in ROUTES:
        page.p.click(f'.nav-link[data-route="{route}"]')
        page.p.wait_for_selector(f'.nav-link.active[data-route="{route}"]', timeout=5000)
        assert page.p.locator(".nav-link.active").count() == 1
        assert page.p.evaluate("() => location.hash").startswith(f"#/{route}")
        assert page.p.locator("#view h2").count() >= 1


def test_translations_are_unique_for_tests():
    assert len(UZ_TO_WORD) == len(WORDS), "O‘zbekcha tarjimalar takrorlanmasligi kerak (testlar shunga tayanadi)"


# ---------------------------------------------------------------- daily words + storage
def test_daily_words_learn_and_persist(page):
    page.go("daily")
    cards = page.p.locator("#dw-list .word-card")
    assert cards.count() == 10
    page.p.locator("[data-action=learn]").first.click()
    page.p.wait_for_selector(".toast")
    s = page.state()
    assert len(s["learned"]) == 1 and s["xp"] == 5 and s["streak"]["current"] == 1
    assert "first_word" in s["achievements"]
    page.p.reload()
    page.p.wait_for_selector("html[data-ready=true]")
    assert len(page.state()["learned"]) == 1
    assert page.p.locator("#top-xp").inner_text().replace("\n", " ").count("5 XP") == 1
    # more words beyond the daily 10
    page.p.click("#dw-more")
    assert page.p.locator("#dw-list .word-card").count() == 15
    # filters regenerate unlearned suggestions
    page.p.select_option("#dw-level", "B2")
    ids = page.state()["dailyWords"]["ids"]
    levels = {w["level"] for w in WORDS if w["id"] in ids and str(w["id"]) not in page.state()["learned"]}
    assert levels == {"B2"}
    # no repeats on a new day: simulate yesterday's set
    yesterday_ids = ids
    page.set_state({"dailyWords": {"date": "2000-01-01", "ids": yesterday_ids, "filters": {"level": "", "topic": ""}}})
    page.go("dashboard"); page.p.reload(); page.p.wait_for_selector("html[data-ready=true]")
    page.go("daily")
    new_ids = page.state()["dailyWords"]["ids"]
    assert len(new_ids) == 10 and not set(new_ids) & set(yesterday_ids)


# ---------------------------------------------------------------- flashcards
def test_flashcards(page):
    page.go("flashcards?level=A1")
    card = page.p.locator("#flashcard")
    assert "1 / " in page.p.locator(".badge.blue").first.inner_text()
    card.click()
    assert "flipped" in card.get_attribute("class")
    page.p.click("#fc-next")
    assert "2 / " in page.p.locator(".badge.blue").first.inner_text()
    page.p.click("#fc-prev")
    assert "1 / " in page.p.locator(".badge.blue").first.inner_text()
    page.p.click("#fc-speak")
    assert page.p.evaluate("window.__spoken.length") == 1
    page.p.click("#fc-know")
    page.p.click("#fc-again")
    s = page.state()
    assert len(s["learned"]) == 1 and len(s["difficult"]) == 1
    page.p.keyboard.press("Space")
    assert "flipped" in page.p.locator("#flashcard").get_attribute("class")
    page.p.select_option("#pf-source", "favorites")
    assert page.p.locator(".empty").count() == 1


# ---------------------------------------------------------------- quiz
def test_quiz_perfect_and_history(page):
    page.go("quiz?count=5&level=A1")
    page.p.click("#quiz-start")
    for i in range(5):
        answer_quiz_correctly(page)
        assert page.p.locator(".explain.ok").count() == 1
        page.p.click("#quiz-next")
    assert page.p.locator(".score").inner_text().replace("\n", "").startswith("5")
    s = page.state()
    assert s["quizHistory"][-1]["correct"] == 5 and "perfect_quiz" in s["achievements"]
    assert s["xp"] >= 5 * 10 + 20 + 30


def test_quiz_wrong_answer_goes_to_difficult(page):
    page.go("quiz?count=5&dir=uz-de")
    page.p.click("#quiz-start")
    q = page.p.locator(".question").inner_text().strip()
    w = UZ_TO_WORD[q]
    right = f"{w['article']} {w['german']}" if w["article"] else w["german"]
    page.p.locator(".option").filter(has_not_text=right).first.click()
    assert page.p.locator(".explain.bad").count() == 1 and page.p.locator(".option.correct").count() == 1
    assert str(w["id"]) in page.state()["difficult"]
    page.go("difficult")
    assert page.p.locator(".list-item", has_text=w["german"]).count() == 1
    # mastering: answer the word right 3 times via the practice API
    page.p.click(f'[data-master="{w["id"]}"]')
    assert str(w["id"]) not in page.state()["difficult"]
    assert page.state()["mastered"][-1]["id"] == w["id"]


# ---------------------------------------------------------------- writing
def test_writing_checks_answers(page):
    page.go("writing?level=A1")
    for attempt in ("correct", "wrong", "umlaut-free"):
        uz = page.p.locator(".question").inner_text().strip()
        w = UZ_TO_WORD[uz]
        if attempt == "correct":
            text = f"{w['article']} {w['german']}".strip()
        elif attempt == "wrong":
            text = "xyz"
        else:
            text = w["german"].replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
        page.p.fill("#wr-input", text)
        page.p.click("#wr-form button[type=submit]")
        expected = "bad" if attempt == "wrong" else "ok"
        assert page.p.locator(f".explain.{expected}").count() == 1, (attempt, w["german"])
        page.p.click("#wr-next")
    s = page.state()
    assert s["dailyProgress"][next(iter(s["dailyProgress"]))]["correct"] == 2


# ---------------------------------------------------------------- matching
def test_matching_game_complete(page):
    page.go("matching?level=A1")
    left = page.p.locator('.tile[data-side="de"]')
    assert left.count() == 6
    # one deliberate mistake
    first_de = left.first
    de_id = first_de.get_attribute("data-id")
    page.p.locator(f'.tile[data-side="de"][data-id="{de_id}"]').click()
    page.p.locator(f'.tile[data-side="uz"]:not([data-id="{de_id}"])').first.click()
    page.p.wait_for_timeout(450)
    assert "1" in page.p.locator(".pill").nth(1).inner_text()
    ids = [left.nth(i).get_attribute("data-id") for i in range(6)]
    for wid in ids:
        page.p.locator(f'.tile[data-side="de"][data-id="{wid}"]').click()
        page.p.locator(f'.tile[data-side="uz"][data-id="{wid}"]').click()
    page.p.wait_for_selector("#mt-again")
    h = page.state()["quizHistory"][-1]
    assert h["mode"] == "matching" and h["total"] == 6 and h["correct"] == 5


# ---------------------------------------------------------------- revision (spaced repetition)
def test_revision_flow(page):
    page.go("daily")
    page.p.locator("[data-action=learn]").first.click()
    page.p.locator("[data-action=learn]").first.click()
    s = page.state()
    assert len(s["revision"]) == 2 and all(c["due"] > s["learned"][k]["at"] for k, c in s["revision"].items())
    # make the cards due now
    rev = {k: {**c, "due": 0} for k, c in s["revision"].items()}
    page.set_state({"revision": rev})
    page.go("dashboard"); page.p.reload(); page.p.wait_for_selector("html[data-ready=true]")
    assert page.p.locator("#nav-due").inner_text() == "2"
    page.go("revision")
    page.p.click("#rev-show")
    page.p.click('[data-grade="3"]')   # easy
    page.p.keyboard.press("Space")
    page.p.keyboard.press("1")         # again -> requeued
    page.p.click("#rev-show")
    page.p.click('[data-grade="2"]')   # good
    assert page.p.locator(".empty h3").inner_text().startswith("Takrorlash yakunlandi")
    cards = page.state()["revision"]
    intervals = sorted(c["interval"] for c in cards.values())
    assert intervals == [1, 3]  # again then good -> 1 day; easy on new card -> 3 days


def test_spaced_repetition_algorithm(page):
    r = page.p.evaluate("""async () => {
      const m = await import('/js/revision.js');
      const now = 1_000_000_000_000, DAY = m.DAY;
      let c = m.newCard(now);
      const seq = [];
      for (const g of [2, 2, 2]) { c = m.schedule(c, g, now); seq.push(c.interval); }
      const easy = m.schedule(m.schedule(m.newCard(now), 3, now), 3, now).interval;
      const lapse = m.schedule(c, 0, now);
      const hard = m.schedule(c, 1, now);
      return { seq, easy, lapseDue: (lapse.due - now) / 60000, lapseEase: lapse.ease, reps: lapse.reps, hardInt: hard.interval, goodInt: m.schedule(c, 2, now).interval };
    }""")
    assert r["seq"] == [1, 3, 8]            # 1d -> 3d -> round(3*2.5)
    assert r["easy"] == 6 and r["lapseDue"] == 10 and r["reps"] == 0 and r["lapseEase"] == pytest.approx(2.3)
    assert r["hardInt"] < r["goodInt"]


# ---------------------------------------------------------------- dictionary + translate
def test_dictionary_search_and_translate(page):
    page.go("dictionary")
    assert page.p.locator(".dict-row").count() == len(WORDS)
    page.p.fill("#dc-q", "ona")
    page.p.wait_for_function("() => document.querySelector('#dc-count').textContent.includes('ona')")
    assert page.p.locator(".dict-row", has_text="Mutter").count() == 1
    page.p.fill("#dc-q", "")
    page.p.select_option("#dc-level", "C2")
    page.p.wait_for_function("() => document.querySelectorAll('.dict-row').length < 30")
    assert page.p.locator(".dict-row").count() == sum(1 for w in WORDS if w["level"] == "C2")
    page.p.select_option("#dc-level", "")
    page.p.select_option("#dc-topic", "Familie")
    page.p.wait_for_timeout(200)
    assert page.p.locator(".dict-row").count() == sum(1 for w in WORDS if w["topic"] == "Familie")
    row = page.p.locator(".dict-row").first
    row.locator(".dict-summary").click()
    assert "open" in row.get_attribute("class")
    row.locator("[data-action=speak]").click()
    assert page.p.evaluate("window.__spoken.length") == 1
    # translation: tests run without Lingva instances -> local fallback
    page.p.fill("#tr-text", "Hund")
    page.p.click("#tr-btn")
    page.p.wait_for_selector("#tr-result .badge")
    assert "Lokal" in page.p.locator("#tr-result").inner_text() and "it" in page.p.locator("#tr-result .word-uz").inner_text()
    page.p.click('[data-dir="uz"]')
    page.p.fill("#tr-text", "zzzz")
    page.p.click("#tr-btn")
    page.p.wait_for_selector("#tr-result .badge.red")


def test_dictionary_offline_fallback(page):
    page.go("dictionary")
    page.p.route("**/api/search**", lambda route: route.abort())
    page.p.fill("#dc-q", "kitob")
    page.p.wait_for_selector("#dc-offline:not([hidden])")
    assert page.p.locator(".dict-row", has_text="Buch").count() == 1
    # the aborted request itself is logged by the browser; that one is expected here
    page.errors[:] = [e for e in page.errors if "net::ERR_FAILED" not in e]


# ---------------------------------------------------------------- favorites
def test_favorites(page):
    page.go("dictionary")
    row = page.p.locator(".dict-row").first
    row.locator(".dict-summary").click()
    row.locator("[data-action=fav]").click()
    assert len(page.state()["favorites"]) == 1
    assert page.p.locator("#nav-fav").inner_text() == "1"
    page.go("favorites")
    assert page.p.locator(".word-card").count() == 1
    page.go("flashcards?source=favorites")
    assert "1 / 1" in page.p.locator(".badge.blue").first.inner_text()
    page.go("favorites")
    page.p.locator("[data-action=fav]").click()
    assert page.p.locator(".empty").count() == 1 and page.state()["favorites"] == []


# ---------------------------------------------------------------- statistics
def test_statistics_charts(page):
    page.go("quiz?count=5")
    page.p.click("#quiz-start")
    for _ in range(5):
        page.p.locator(".option").first.click()
        page.p.click("#quiz-next")
    page.go("statistics")
    assert page.p.evaluate("['ch-daily','ch-weekly','ch-quiz'].every(id => window.Chart.getChart(id))")
    assert page.p.locator(".ach").count() == 7
    assert page.p.locator(".table tbody tr").count() >= 1


# ---------------------------------------------------------------- settings
def test_theme_toggle_persists(page):
    page.p.evaluate("document.documentElement.setAttribute('data-theme','light')")
    page.set_state({"settings": {"theme": "light", "volume": 0.9, "rate": 0.9, "dailyGoal": 10}})
    page.p.reload(); page.p.wait_for_selector("html[data-ready=true]")
    page.p.click("#theme-btn")
    assert page.p.get_attribute("html", "data-theme") == "dark"
    page.p.reload(); page.p.wait_for_selector("html[data-ready=true]")
    assert page.p.get_attribute("html", "data-theme") == "dark"
    bg = page.p.evaluate("getComputedStyle(document.body).backgroundColor")
    assert bg == "rgb(11, 18, 32)"
    page.go("settings")
    page.p.click('[data-theme-opt="light"]')
    assert page.p.get_attribute("html", "data-theme") == "light"


def test_settings_goal_volume_export_import_reset(page, tmp_path):
    page.go("daily")
    page.p.locator("[data-action=learn]").first.click()
    page.go("settings")
    page.p.fill("#set-goal", "25")
    page.p.click("#goal-form button")
    assert page.state()["settings"]["dailyGoal"] == 25
    page.p.fill("#set-goal", "0")
    page.p.click("#goal-form button")
    assert page.state()["settings"]["dailyGoal"] == 25
    page.p.locator("#set-volume").fill("0.5")
    page.p.locator("#set-volume").dispatch_event("change")
    assert page.state()["settings"]["volume"] == 0.5
    with page.p.expect_download() as dl:
        page.p.click("#set-export")
    exported = tmp_path / "export.json"
    dl.value.save_as(exported)
    data = json.loads(exported.read_text(encoding="utf-8"))
    assert data["app"] == "DeutschMaster" and len(data["data"]["learned"]) == 1
    # reset with confirmation modal
    page.p.click("#set-reset")
    page.p.click(".modal-actions .btn-danger")
    assert page.state()["learned"] == {} and page.state()["xp"] == 0
    # invalid import shows an error modal and changes nothing
    bad = tmp_path / "bad.json"
    bad.write_text('{"hello": 1}', encoding="utf-8")
    page.p.set_input_files("#set-import", str(bad))
    page.p.wait_for_selector(".modal")
    assert "DeutschMaster eksport fayli emas" in page.p.locator(".modal").inner_text()
    page.p.click(".modal-actions .btn")
    # valid import restores progress
    page.p.set_input_files("#set-import", str(exported))
    page.p.wait_for_selector(".modal")
    page.p.click(".modal-actions .btn-primary")
    assert len(page.state()["learned"]) == 1 and page.state()["settings"]["dailyGoal"] == 25


def test_import_validation_rejects_bad_structures(page):
    r = page.p.evaluate("""async () => {
      const m = await import('/js/storage.js');
      const wrap = (data, extra = {}) => JSON.stringify({ app: 'DeutschMaster', version: 1, data, ...extra });
      return {
        notJson: m.parseImport('{oops').ok,
        wrongVersion: m.parseImport(wrap({}, { version: 99 })).ok,
        badXp: m.parseImport(wrap({ xp: -5 })).errors.length,
        badLearned: m.parseImport(wrap({ learned: { abc: { at: 1 } } })).errors.length,
        good: m.parseImport(wrap({ xp: 120, learned: { '3': { at: 1 } }, favorites: [1, 1, 'x'] })),
      };
    }""")
    assert r["notJson"] is False and r["wrongVersion"] is False and r["badXp"] == 1 and r["badLearned"] == 1
    assert r["good"]["ok"] is True and r["good"]["data"]["favorites"] == [1]


# ---------------------------------------------------------------- gamification logic
def test_streak_logic(page):
    r = page.p.evaluate("""async () => {
      const st = await import('/js/storage.js');
      const g = await import('/js/gamification.js');
      const today = st.todayKey(), y = st.addDays(today, -1), old = st.addDays(today, -3);
      const res = {};
      st.replaceState({ ...st.defaultState(), streak: { current: 4, best: 4, lastActive: y } });
      g.learnWord({ id: 1, german: 'Mutter', article: 'die' });
      res.continued = st.getState().streak.current;
      g.learnWord({ id: 2, german: 'Vater', article: 'der' });
      res.sameDay = st.getState().streak.current;
      st.replaceState({ ...st.defaultState(), streak: { current: 6, best: 6, lastActive: old } });
      g.refreshStreak();
      res.missed = st.getState().streak.current; res.best = st.getState().streak.best;
      g.learnWord({ id: 3, german: 'Bruder', article: 'der' });
      res.restart = st.getState().streak.current;
      res.levels = [0, 99, 100, 249, 250].map((x) => g.levelInfo(x).level);
      st.replaceState({ ...st.defaultState(), streak: { current: 6, best: 6, lastActive: y } });
      g.learnWord({ id: 4, german: 'Schwester', article: 'die' });
      res.ach7 = Boolean(st.getState().achievements.streak_7);
      st.resetAll();
      return res;
    }""")
    assert r["continued"] == 5 and r["sameDay"] == 5
    assert r["missed"] == 0 and r["best"] == 6 and r["restart"] == 1
    assert r["levels"] == [1, 1, 2, 2, 3]
    assert r["ach7"] is True


def test_writing_checker_unit(page):
    r = page.p.evaluate("""async () => {
      const m = await import('/js/writing.js');
      const hund = { german: 'Hund', article: 'der' }, mude = { german: 'müde', article: '' };
      return [m.checkAnswer('der Hund', hund), m.checkAnswer('hund', hund), m.checkAnswer('die Hund', hund),
              m.checkAnswer('muede', mude), m.checkAnswer('mude', mude), m.checkAnswer('  MÜDE ', mude)].map(x => x.reason + ':' + x.ok);
    }""")
    assert r == ["exact:true", "no-article:true", "article:false", "exact:true", "wrong:false", "exact:true"]


# ---------------------------------------------------------------- UI components & responsive
def test_toast_and_modal(page):
    page.go("settings")
    page.p.click("#set-reset")
    assert page.p.locator(".modal").is_visible()
    page.p.keyboard.press("Escape")
    assert page.p.locator(".modal").count() == 0
    page.p.click("#set-test")
    page.go("daily")
    page.p.locator("[data-action=fav]").first.click()
    assert page.p.locator(".toast").first.is_visible()


@pytest.mark.parametrize("width,height", [(1440, 900), (820, 1180), (375, 812)])
def test_responsive_no_horizontal_overflow(browser, server, width, height):
    ctx = browser.new_context(viewport={"width": width, "height": height})
    pg = Page(ctx.new_page(), server.url)
    pg.go("dashboard")
    try:
        for route in ROUTES:
            pg.go(route)
            overflow = pg.p.evaluate("document.documentElement.scrollWidth - window.innerWidth")
            assert overflow <= 0, f"{route} @ {width}px: {overflow}px gorizontal overflow"
            clipped = pg.p.evaluate("""() => [...document.querySelectorAll('#view h2, #view h3, .btn, .badge')]
              .filter(e => e.offsetParent && e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.textContent.trim()).slice(0, 3)""")
            assert not clipped, f"{route} @ {width}px: ekrandan chiqib ketgan elementlar {clipped}"
        menu = pg.p.locator("#menu-btn")
        if width <= 1024:
            assert menu.is_visible()
            assert not pg.p.locator("#sidebar").is_visible()
            menu.click()
            pg.p.wait_for_timeout(300)
            assert pg.p.locator("#sidebar").is_visible()
            pg.p.click('.nav-link[data-route="quiz"]')
            pg.p.wait_for_timeout(300)
            assert "open" not in (pg.p.locator("#sidebar").get_attribute("class") or "")
        else:
            assert not menu.is_visible() and pg.p.locator("#sidebar").is_visible()
        assert not pg.errors, pg.errors
    finally:
        ctx.close()


def test_api_down_falls_back_to_static_mode(browser, server):
    ctx = browser.new_context()
    page = ctx.new_page()
    page.route("**/api/**", lambda route: route.abort())
    page.goto(server.url + "/#/daily")
    page.wait_for_selector("#dw-list .word-card", timeout=15000)
    assert page.evaluate("async () => (await import('/js/api.js')).api.mode()") == "static"
    ctx.close()


def test_data_unavailable_message(browser, server):
    ctx = browser.new_context()
    page = ctx.new_page()
    page.route("**/api/**", lambda route: route.abort())
    page.route("**/data/words.json", lambda route: route.abort())
    page.goto(server.url + "/")
    page.wait_for_selector("#retry")
    assert "Ma’lumotlarni yuklab bo‘lmadi" in page.inner_text("#view")
    ctx.close()
