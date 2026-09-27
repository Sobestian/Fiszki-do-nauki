from pathlib import Path
import json


# ============================================================
# OBSŁUGIWANE FORMATY OBRAZÓW
# ============================================================

SUPPORTED_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".bmp",
    ".gif",
    ".webp",
}


# ============================================================
# ŚCIEŻKI
# ============================================================

# Folder, w którym znajduje się ten skrypt.
BASE_DIR = Path(__file__).resolve().parent


# Folder zawierający lekcje.
DATA_DIR = BASE_DIR / "dane"


# Plik, który zostanie wygenerowany dla wersji webowej.
OUTPUT_FILE = BASE_DIR / "lessons.json"


# ============================================================
# GENEROWANIE LISTY LEKCJI
# ============================================================

def main():

    # --------------------------------------------------------
    # Sprawdzenie, czy istnieje folder "dane"
    # --------------------------------------------------------

    if not DATA_DIR.exists():

        raise SystemExit(
            f"Nie znaleziono katalogu:\n{DATA_DIR}"
        )


    # Tutaj zostaną zapisane wszystkie znalezione lekcje.
    lessons = {}


    # --------------------------------------------------------
    # Pobranie folderów lekcji
    # --------------------------------------------------------

    lesson_folders = [
        folder
        for folder in DATA_DIR.iterdir()
        if folder.is_dir()
    ]


    # Sortowanie alfabetyczne.
    lesson_folders.sort(
        key=lambda folder: folder.name.lower()
    )


    # --------------------------------------------------------
    # Odczyt każdej lekcji
    # --------------------------------------------------------

    for folder in lesson_folders:

        files = [
            file.name
            for file in folder.iterdir()
            if (
                file.is_file()
                and file.suffix.lower() in SUPPORTED_EXTENSIONS
            )
        ]


        # Sortowanie plików alfabetycznie.
        files.sort(
            key=str.lower
        )


        # Dodaj lekcję tylko wtedy,
        # gdy zawiera przynajmniej jedną grafikę.
        if files:

            lessons[folder.name] = files


    # --------------------------------------------------------
    # Zapis lessons.json
    # --------------------------------------------------------

    OUTPUT_FILE.write_text(

        json.dumps(
            lessons,
            ensure_ascii=False,
            indent=2
        ),

        encoding="utf-8"
    )


    # --------------------------------------------------------
    # Informacja w terminalu
    # --------------------------------------------------------

    card_count = sum(
        len(files)
        for files in lessons.values()
    )


    print()
    print("Gotowe!")
    print()
    print(f"Liczba lekcji: {len(lessons)}")
    print(f"Liczba fiszek: {card_count}")
    print()
    print(f"Zapisano plik:")
    print(OUTPUT_FILE)
    print()


# ============================================================
# START
# ============================================================

if __name__ == "__main__":
    main()
