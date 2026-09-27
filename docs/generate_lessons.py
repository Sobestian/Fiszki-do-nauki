from pathlib import Path
import json

SUPPORTED_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".bmp",
    ".gif",
    ".webp",
}

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "dane"
OUTPUT_FILE = BASE_DIR / "lessons.json"


def main():
    if not DATA_DIR.exists():
        raise SystemExit(
            f'Nie znaleziono katalogu: {DATA_DIR}\n'
            'Umieść folder "dane" obok generate_lessons.py.'
        )

    lessons = {}

    folders = sorted(
        (folder for folder in DATA_DIR.iterdir() if folder.is_dir()),
        key=lambda folder: folder.name.lower(),
    )

    for folder in folders:
        files = sorted(
            (
                file.name
                for file in folder.iterdir()
                if file.is_file()
                and file.suffix.lower() in SUPPORTED_EXTENSIONS
            ),
            key=str.lower,
        )

        if files:
            lessons[folder.name] = files

    OUTPUT_FILE.write_text(
        json.dumps(
            lessons,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    card_count = sum(len(files) for files in lessons.values())

    print(f"Gotowe: {OUTPUT_FILE}")
    print(f"Lekcje: {len(lessons)}")
    print(f"Fiszki: {card_count}")


if __name__ == "__main__":
    main()
