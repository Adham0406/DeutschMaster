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
