# DeutschMaster — progress

_Yangilangan: 2026-11-10_

## Holat
Hozirgi bosqich: **barcha 8 bosqich yakunlandi.**

| Bosqich | Holat |
|---|---|
| 1. Arxitektura | ✅ Bajarildi |
| 2. UI/UX dizayn | ✅ Bajarildi (12 sahifa, dark/light, responsive) |
| 3. So‘zlar bazasi | ✅ 129 so‘z (A1 22, A2 21, B1 22, B2 22, C1 21, C2 21), 14 mavzu |
| 4. Flask backend | ✅ 8 endpoint, validatsiya, xatolar JSON, CSP, rate limit |
| 5. Frontend funksiyalar | ✅ Barcha sahifalar ishlaydi |
| 6. Gamification + storage | ✅ XP, level, 7 yutuq, streak, localStorage, eksport/import |
| 7. QA | ✅ Avtomatik testlar (natijalar pastda) |
| 8. Finalization | ✅ README, .env.example, .gitignore, ZIP |

## Muhim texnik qarorlar
- Workspace (`c:\Program Files\frontend`) ichida boshqa loyiha (`for_my_babe`: index.html, script.js, style.css) bor edi — u DeutschMaster'ga tegishli emas, shuning uchun **o‘chirilmadi**. DeutschMaster alohida `DeutschMaster/` papkada yaratildi va `for_my_babe` git reposiga tushmasligi uchun `.git/info/exclude` ga qo‘shildi.
- Tizimda `python` buyrug‘i yo‘q (Microsoft Store alias), `py` launcher (Python 3.14) ishlatildi. Loyiha ichida `venv/` yaratildi.
- Chart.js 4.4.1 va Lucide 0.344.0 `frontend/assets/vendor/` ga yuklab olindi — ilova CDN'siz ishlaydi, CSP `script-src 'self'`.
- Audio: Web Speech API (de-DE). `audio_url` maydoni bor, hozir bo‘sh; to‘ldirilsa frontend avval faylni ijro etadi.
- Lingva: kalit kerak emas, backend orqali chaqiriladi; ishlamasa lokal lug‘at. Botlarni tekshirishni chetlab o‘tish (soxta brauzer User-Agent) qilinmadi — faqat oddiy, halol so‘rov.
- Spaced repetition: soddalashtirilgan SM-2 (`frontend/js/revision.js`, `schedule()` — sof funksiya, testlangan).
- Qiyin so‘zlar: har bir xato → ro‘yxatga; ketma-ket 3 ta to‘g‘ri javob → “o‘zlashtirildi”.
- Storage: bitta versiyalangan kalit `deutschmaster:v1`; yuklash va import bir xil validator orqali o‘tadi.

## Aniqlangan va tuzatilgan xatolar
1. `GET /api/translate` 405 o‘rniga 404 qaytardi — catch-all static route ushlab qolgan. Tuzatildi (`backend/__init__.py`), test qo‘shildi.
2. Desktop'da hamburger tugma ko‘rinib turardi — `.icon-btn` CSS qoidasi `.menu-btn{display:none}` ni bosib ketgan. Specificity oshirildi.
3. Quiz/flashcard'da artikl so‘zga yopishib chiqardi (“dieBefindlichkeit”). `germanHtml()` ga bo‘sh joy qo‘shildi.
4. Mobil ekranda yopiq sidebar soyasi chap chetda ko‘rinardi — yopiq holatda `visibility:hidden`.
5. Takrorlashda “Qayta” bosilgan so‘z qayta navbatga qo‘shilganda hisoblagich noto‘g‘ri edi — birinchi urinishdagi natija alohida hisoblanadi.
6. Moslashtirish o‘yinida xato qilingan juftlik keyin to‘g‘ri topilganda ham “to‘g‘ri javob” sifatida hisoblanardi — tuzatildi.
7. Har bir sahifa o‘z event listener'larini umumiy `#view` ga qo‘shib, sahifa almashganda ikki marta ishlashi mumkin edi — router har sahifa uchun yangi konteyner yaratadi.
8. Test infratuzilmasi: CSP `unsafe-eval` ga ruxsat bermagani uchun Playwright `wait_for_function("expr")` ishlamadi — funksiya ko‘rinishiga o‘tkazildi (ilova xatosi emas, CSP to‘g‘ri ishlayapti).
9. Navigatsiya testida `hashchange` dan oldin tekshirish (race) — test active class'ni kutadigan qilindi.

## Test natijalari (yakuniy)
`python -m pytest tests` — **62 passed, 0 failed, 0 skipped** (Windows 10, Python 3.14, headless Microsoft Edge orqali Playwright 1.65).

| Fayl | Testlar | Nimani tekshiradi |
|---|---|---|
| `test_words.py` | 16 | ≥120 so‘z, har darajada ≥20, 14 mavzu, takrorlanmaslik, majburiy maydonlar, artikl, infinitiv, misollar |
| `test_api.py` | 15 | barcha 8 endpoint, noto‘g‘ri so‘rovlar (400/404/405/415/429), Lingva mock (muvaffaqiyat, timeout, 429, 403), fallback, CORS |
| `test_app.py` | 6 | index va statik fayllar, path traversal, CSP/xavfsizlik headerlari, tuzilma, JS importlar |
| `test_frontend_e2e.py` | 25 | 12 sahifa, sidebar navigatsiya, kunlik so‘zlar (+takrorlanmaslik), flashcards, quiz (100% va xato), yozish (artikl/umlaut), matching, takrorlash + SM-2, lug‘at (filtr, offline fallback, tarjima), sevimlilar, statistika grafiklari, dark/light saqlanishi, eksport/import/reset, import validatsiyasi, streak/level mantiqi, toast/modal, 1440/820/375 px da gorizontal overflow yo‘qligi va mobil menyu, server o‘chganda xabar. Har bir testda JS console/pageerror xatolari yo‘qligi tekshiriladi |

E2E to‘plami ikki marta ketma-ket yugurildi — ikkalasida ham hammasi o‘tdi.
Qo‘shimcha qo‘lda tekshiruv: `python app.py` real server, `/api/translate` real Lingva bilan → `lingva.ml: HTTP 403`, lokal fallback “it” qaytardi. Dashboard, Daily, Quiz, Flashcards, Statistics, Settings, Matching skrinshotlari (light/dark, 1366 va 375 px) ko‘rib chiqildi.

## Qolgan vazifalar / ma’lum cheklovlar
- Lingva public instance'lari hozir ishlamayapti (403/500) — onlayn tarjima amalda lokal fallback bilan ishlaydi.
- Audio Web Speech API'ga bog‘liq: nemischa ovoz brauzer/OS'da o‘rnatilmagan bo‘lsa, standart ovoz bilan o‘qiladi. Haqiqiy ovoz chiqishi headless testlarda tekshirilmagan (speechSynthesis stub qilingan, faqat chaqiruv tekshirildi).
- Testlar faqat Chromium asosidagi brauzerda (Edge) o‘tkazildi; Firefox/Safari'da tekshirilmagan.
- Inter shrifti Google Fonts'dan yuklanadi; internet bo‘lmasa tizim shrifti ishlatiladi.
