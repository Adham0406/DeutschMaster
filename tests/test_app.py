"""App-level tests: static frontend serving, security headers, file structure."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_index_served(client):
    r = client.get("/")
    assert r.status_code == 200 and b"DeutschMaster" in r.data


def test_static_assets_served(client):
    for path in ["/css/style.css", "/css/components.css", "/css/responsive.css", "/js/app.js",
                 "/js/storage.js", "/assets/vendor/chart.umd.min.js", "/assets/vendor/lucide.min.js"]:
        assert client.get(path).status_code == 200, path


def test_words_file_served_for_static_mode(client):
    r = client.get("/data/words.json")
    assert r.status_code == 200 and r.mimetype == "application/json"
    assert len(r.get_json()["words"]) >= 120


def test_frontend_uses_relative_urls():
    """GitHub Pages serves the site under /<repo>/, so no fetch may start with '/'."""
    import re
    for js in (ROOT / "frontend" / "js").glob("*.js"):
        text = js.read_text(encoding="utf-8")
        bad = re.findall(r"""fetchJson\(\s*[`'"]/""", text) + re.findall(r"""fetch\(\s*[`'"]/""", text)
        assert not bad, f"{js.name}: absolute URL {bad}"


def test_pages_workflow_ships_data():
    wf = (ROOT / ".github" / "workflows" / "deploy.yml").read_text(encoding="utf-8")
    assert "cp data/words.json _site/data/words.json" in wf and "path: _site" in wf


def test_path_traversal_blocked(client):
    assert client.get("/../app.py").status_code == 404
    assert client.get("/%2e%2e/app.py").status_code == 404


def test_security_headers(client):
    h = client.get("/").headers
    assert h["X-Content-Type-Options"] == "nosniff"
    assert "default-src 'self'" in h["Content-Security-Policy"]


def test_project_structure():
    for rel in ["app.py", "requirements.txt", "README.md", ".env.example", ".gitignore", "progress.md",
                "frontend/index.html", "data/words.json",
                *[f"frontend/js/{n}.js" for n in ["app", "api", "storage", "flashcards", "quiz", "matching",
                                                  "writing", "revision", "statistics"]]]:
        assert (ROOT / rel).exists(), rel


def test_all_js_modules_referenced_files_exist():
    """Every relative ES module import in frontend/js must resolve to a real file."""
    import re
    js_dir = ROOT / "frontend" / "js"
    for js in js_dir.glob("*.js"):
        for target in re.findall(r"from\s+['\"](\./[^'\"]+)['\"]", js.read_text(encoding="utf-8")):
            assert (js_dir / target).resolve().exists(), f"{js.name} -> {target}"
