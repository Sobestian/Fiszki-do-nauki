# Fiszki — wersja webowa

Skopiuj zawartość tej paczki do głównego katalogu projektu, obok `fiszki.py` i `dane/`.

Docelowo:

```text
fiszki/
├── fiszki.py
├── dane/
├── index.html
├── style.css
├── app.js
├── lessons.json
├── generate_lessons.py
├── manifest.webmanifest
├── service-worker.js
└── icons/
    └── icon-192.svg
```

## 1. Wygeneruj listę lekcji

Po skopiowaniu plików:

```fish
python generate_lessons.py
```

Skrypt przeskanuje folder `dane/` i zbuduje `lessons.json`.

Uruchamiaj go ponownie po każdej zmianie w `dane/`.

## 2. Test lokalny

W katalogu projektu:

```fish
python -m http.server 8000
```

Potem otwórz:

```text
http://localhost:8000
```

Zatrzymanie serwera:

```text
Ctrl+C
```

## 3. GitHub Pages

Po wysłaniu plików na GitHub:

1. Repozytorium → Settings
2. Pages
3. Build and deployment
4. Source: Deploy from a branch
5. Branch: main
6. Folder: /(root)
7. Save

Typowy adres dla repozytorium:

```text
https://sobestian.github.io/aplikacja-fiszki---python/
```

## Sterowanie

Komputer:
- kliknięcie symbolu — pokaż odpowiedź
- ↑ / ↓ — pokaż odpowiedź
- ← — NIE WIEM
- → — WIEM

Telefon:
- dotknięcie symbolu — pokaż odpowiedź
- przyciski NIE WIEM / WIEM

## PWA

Paczka zawiera manifest i service worker, więc aplikację można dodać do ekranu głównego w obsługiwanych przeglądarkach.
