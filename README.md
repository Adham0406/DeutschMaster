# DeutschMaster

Nemis tili so‘zlarini (A1–C2) o‘rganish uchun web-ilova: kunlik so‘zlar, flashcards, quiz, so‘z yozish, moslashtirish o‘yini, spaced repetition, lug‘at, statistika.

- **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES modules), Chart.js 4.4.1, Lucide 0.344.0 (`frontend/assets/vendor/` ichida)
- **Backend:** Python + Flask
- **Ma’lumotlar:** `data/words.json` (2013 ta so‘z: A1 374 · A2 358 · B1 390 · B2 326 · C1 280 · C2 285), foydalanuvchi progressi brauzer `localStorage` da

## Lug‘atni kengaytirish

So‘zlar `tools/words/<DARAJA>_*.txt` fayllarida, har qatorda bitta so‘z:

```
german | article | pos | ipa | uzbek | example_de | example_uz | topic
Hund   | der     | N   | hʊnt| it    | Der Hund spielt im Garten. | It bog‘da o‘ynayapti. | Natur
```

`pos`: N ot, V fe’l, A sifat, D ravish, P predlog, K bog‘lovchi, R olmosh, X ibora. So‘z qo‘shgach yoki tuzatgach:

```
python tools/build_words.py --check   # faqat tekshirish
python tools/build_words.py           # data/words.json ni yangilash
```

Skript takrorlanishni, artikllarni, fe’l infinitivini, misollar formatini, o‘zbekcha matnda kirill harflari va ko‘rinmas belgilar yo‘qligini va tarjimalar takrorlanmasligini tekshiradi. Mavjud so‘zlar ID’sini saqlaydi (foydalanuvchi progressi buzilmaydi).

## Talablar

- Python 3.10 yoki undan yangi (3.13 / 3.14 da sinovdan o‘tgan)
- Zamonaviy brauzer (Edge, Chrome, Firefox)

## Windows + VS Code orqali ishga tushirish

1. **Loyihani ochish:** VS Code → *File → Open Folder…* → `DeutschMaster` papkasini tanlang.
2. **Terminalni ochish:** *Terminal → New Terminal* (yoki ``Ctrl+` ``).
3. **Virtual environment yaratish:**
   ```
   python -m venv venv
   ```
   > Agar `python` topilmasa, Windows'dagi `py` launcher'dan foydalaning: `py -m venv venv`
4. **Virtual environment'ni faollashtirish:**
   ```
   venv\Scripts\activate
   ```
   > PowerShell skriptlarni bloklasa: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` yoki `venv\Scripts\activate.bat` (cmd) dan foydalaning.
5. **Kutubxonalarni o‘rnatish:**
   ```
   pip install -r requirements.txt
   ```
6. **Serverni ishga tushirish:**
   ```
   python app.py
   ```
7. **Brauzerda ochish:** <http://127.0.0.1:5000>

Serverni to‘xtatish: terminalda `Ctrl+C`.

## PyCharm yoki boshqa muhitda

- Loyiha papkasini oching, *Settings → Project → Python Interpreter* da yangi virtualenv yarating.
- `requirements.txt` dagi paketlarni o‘rnating (PyCharm o‘zi taklif qiladi).
- `app.py` ni o‘ng tugma → *Run 'app'*.
- macOS / Linux: `python3 -m venv venv`, `source venv/bin/activate`, `pip install -r requirements.txt`, `python app.py`.

## Sozlamalar (`.env`)

`.env.example` ni `.env` ga nusxalang va kerak bo‘lsa o‘zgartiring. Hech qanday maxfiy kalit talab qilinmaydi.

| O‘zgaruvchi | Standart | Izoh |
|---|---|---|
| `HOST`, `PORT` | `127.0.0.1`, `5000` | Server manzili |
| `FLASK_DEBUG` | `0` | `1` — debug rejim (faqat lokal ishlab chiqish uchun) |
| `LINGVA_INSTANCES` | `https://lingva.ml` | Vergul bilan ajratilgan Lingva serverlari, tartib bo‘yicha sinab ko‘riladi |
| `LINGVA_TIMEOUT` | `6` | Har bir so‘rov uchun timeout (soniya) |
| `MYMEMORY_ENABLED` | `1` | `0` — MyMemory provayderini o‘chirish |
| `TRANSLATE_MAX_CHARS` | `300` | Tarjima matnining maksimal uzunligi |
| `TRANSLATE_RATE_LIMIT` | `30` | Bir IP uchun daqiqasiga tarjima so‘rovlari |
| `CORS_ORIGINS` | bo‘sh | Boshqa domendan API'ga ruxsat berish (frontend bir xil origin'da, kerak emas) |

## GitHub Pages (serversiz) rejim

Sayt: <https://adham0406.github.io/DeutschMaster/>

GitHub Pages faqat statik fayllarni beradi — Python/Flask u yerda ishlamaydi. Shuning uchun ilova ishga tushganda `api/health` ni tekshiradi:

| Rejim | Qachon | So‘zlar | Qidiruv | Tarjima |
|---|---|---|---|---|
| **server** | `python app.py` ishlayotganda | `/api/words` | `/api/search` | backend: Lingva → MyMemory → lokal |
| **static** | API yo‘q (GitHub Pages) | `data/words.json` | brauzerda (`js/search.js`) | brauzerdan MyMemory → lokal |

`.github/workflows/deploy.yml` har bir `main` push'da `frontend/` + `data/words.json` ni yig‘ib Pages'ga joylaydi. Barcha URL'lar nisbiy, shuning uchun sayt `/DeutschMaster/` sub-path ostida ishlaydi.

## Tarjima haqida

Provayderlar tartibi: **Lingva → MyMemory → lokal lug‘at**. Hech biri API kalit talab qilmaydi.

- **Lingva** (`LINGVA_INSTANCES`): 2026-11-10 holatiga `lingva.ml` 403 qaytarmoqda, shuning uchun amalda keyingi provayderga o‘tiladi.
- **MyMemory** (`api.mymemory.translated.net`): ishlaydi, `de↔uz` ni qo‘llab-quvvatlaydi, brauzerdan to‘g‘ridan-to‘g‘ri chaqirsa bo‘ladi (CORS). Cheklov: anonim foydalanuvchiga kuniga taxminan 5000 belgi (IP bo‘yicha), bir so‘rovda 500 baytgacha. Limit tugasa yoki xizmat javob bermasa, natija lokal lug‘atdan olinadi.
- Tarjima sifati mashina tarjimasi darajasida — lug‘atdagi so‘zlar uchun misollar ham ko‘rsatiladi.

## API

| Metod | Yo‘l | Izoh |
|---|---|---|
| GET | `/api/health` | Server holati, so‘zlar soni, oxirgi tarjima holati |
| GET | `/api/words?level=&topic=&limit=&offset=` | So‘zlar ro‘yxati |
| GET | `/api/words/<id>` | Bitta so‘z (404 — topilmasa) |
| GET | `/api/levels` | A1–C2 va so‘zlar soni |
| GET | `/api/topics` | 14 ta mavzu (DE/UZ nomlari) |
| GET | `/api/search?q=&lang=all\|de\|uz&level=&topic=` | Nemischa/o‘zbekcha qidiruv (umlaut va apostrofga sezgir emas) |
| POST | `/api/translate` | `{"text": "Hund", "from": "de", "to": "uz"}` |
| GET | `/api/statistics` | Lug‘at statistikasi (daraja, mavzu, so‘z turkumi) |

Barcha xatolar JSON ko‘rinishida qaytadi: `{"ok": false, "error": "...", "status": 400}`.

## Testlar

```
pip install -r requirements-dev.txt
python -m pytest
```

- `tests/test_words.py` — lug‘at sifati (≥120 so‘z, har darajada ≥20, takrorlanmaslik, majburiy maydonlar, artikllar)
- `tests/test_api.py` — barcha endpointlar, validatsiya, Lingva mock, fallback, rate limit, CORS
- `tests/test_app.py` — statik fayllar, xavfsizlik headerlari, path traversal, loyiha tuzilmasi
- `tests/test_static_site_e2e.py` — GitHub Pages simulyatsiyasi: sayt workflow kabi yig‘iladi va Flask'siz, `/DeutschMaster/` ostida oddiy statik serverda tekshiriladi (MyMemory mock qilinadi)
- `tests/test_frontend_e2e.py` — haqiqiy brauzer testlari (Playwright). Kompyuterga o‘rnatilgan Edge yoki Chrome ishlatiladi; ular topilmasa `python -m playwright install chromium` buyrug‘ini bajaring. Playwright o‘rnatilmagan bo‘lsa, bu testlar avtomatik o‘tkazib yuboriladi (skip).

## Loyiha tuzilmasi

```
DeutschMaster/
├── app.py                  # kirish nuqtasi
├── backend/
│   ├── __init__.py         # create_app(), xatolar, xavfsizlik headerlari, statik fayllar
│   ├── config.py
│   ├── routes/api.py       # /api/* endpointlar
│   ├── services/word_service.py         # WordRepository (keyin SQLite bilan almashtirish oson)
│   ├── services/translation_service.py  # Lingva + lokal fallback
│   └── utils/validation.py
├── frontend/
│   ├── index.html
│   ├── css/  style.css · components.css · responsive.css
│   ├── js/   app.js (router) · api.js (server/static rejim) · search.js · storage.js · gamification.js · ui.js · theme.js · actions.js
│   │         dashboard · daily · flashcards · quiz · writing · matching · revision
│   │         dictionary · collections (sevimlilar, qiyin so‘zlar) · statistics · settings
│   └── assets/ icons · images · vendor (chart.js, lucide)
├── data/words.json
└── tests/
```

## Ma’lumotlar va maxfiylik

Progress (o‘rganilgan so‘zlar, XP, streak, takrorlash jadvali, sozlamalar) faqat sizning brauzeringizda saqlanadi (`localStorage`, kalit: `deutschmaster:v1`). Boshqa brauzerga o‘tkazish uchun *Sozlamalar → Eksport / Import* dan foydalaning.

## SQLite'ga o‘tish

Backend lug‘atga faqat `WordRepository` orqali murojaat qiladi (`all`, `get`, `filter`, `search`, `find_exact`, `statistics`). Xuddi shu metodlarga ega `SqliteWordRepository` yozib, `create_app()` ichida almashtirish kifoya. Frontend'da esa barcha progress `storage.js` orqali o‘tadi.
