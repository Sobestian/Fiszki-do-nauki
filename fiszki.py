# ============================================================
# FISZKI
# ============================================================
#
# Prosta aplikacja do nauki metodą fiszek.
#
# Zasada działania:
# - folder w katalogu "dane" = lekcja
# - plik graficzny = symbol do rozpoznania
# - nazwa pliku bez rozszerzenia = odpowiedź
# - poprawna odpowiedź -> zielony przycisk / strzałka w prawo
# - błędna odpowiedź -> czerwony przycisk / strzałka w lewo
# - strzałka góra lub dół -> pokazanie odpowiedzi
# - błędne fiszki są powtarzane po zakończeniu serii
#
# ============================================================


# ============================================================
# IMPORTY
# ============================================================

# Moduły standardowej biblioteki Pythona
import random
import sys
import tkinter as tk
from pathlib import Path

# Biblioteki zewnętrzne
from PIL import Image, ImageTk


# ============================================================
# INFORMACJE O PROGRAMIE
# ============================================================

APP_NAME = "Fiszki"
APP_VERSION = "0.2.0"

WINDOW_TITLE = f"{APP_NAME} v{APP_VERSION}"


# ============================================================
# KONFIGURACJA OKNA
# ============================================================

WINDOW_WIDTH = 850
WINDOW_HEIGHT = 850


# ============================================================
# KONFIGURACJA OBRAZÓW
# ============================================================

IMAGE_WIDTH = 500
IMAGE_HEIGHT = 350


SUPPORTED_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".bmp",
    ".gif",
    ".webp",
}


# ============================================================
# KONFIGURACJA PRZYCISKÓW
# ============================================================

# Jak długo przycisk ma wyglądać na wciśnięty
# po użyciu strzałki na klawiaturze.
# Wartość podawana jest w milisekundach.

KEYBOARD_BUTTON_PRESS_TIME = 100


# Kolory przycisku NIE WIEM.
RED_BUTTON_COLOR = "#c62828"
RED_BUTTON_ACTIVE_COLOR = "#b71c1c"


# Kolory przycisku WIEM.
GREEN_BUTTON_COLOR = "#2e7d32"
GREEN_BUTTON_ACTIVE_COLOR = "#1b5e20"


# ============================================================
# ŚCIEŻKI PROGRAMU
# ============================================================

if getattr(sys, "frozen", False):

    # Program uruchomiony jako aplikacja PyInstaller.
    BASE_DIR = Path(sys.executable).resolve().parent

else:

    # Program uruchomiony jako zwykły plik .py.
    BASE_DIR = Path(__file__).resolve().parent


# Folder zawierający wszystkie lekcje.
DATA_DIR = BASE_DIR / "dane"


# ============================================================
# STAN PROGRAMU
# ============================================================

# Lista folderów znalezionych w katalogu "dane".
lesson_folders = []


# Fiszki aktualnie znajdujące się w wykonywanej serii.
current_cards = []


# Fiszki zaznaczone jako błędne.
missed_cards = []


# Numer aktualnej fiszki.
current_index = 0


# Aktualnie wyświetlany obraz.
current_photo = None


# Informacja, czy trwa animacja przycisku wywołana klawiaturą.
#
# Dzięki temu bardzo szybkie lub przytrzymane naciśnięcie
# klawisza nie uruchomi kilku odpowiedzi jednocześnie.
keyboard_button_animation_active = False


# ============================================================
# FUNKCJE - EKRAN STARTOWY
# ============================================================

def refresh_lessons():
    """
    Odczytuje folder DATA_DIR i wyświetla dostępne lekcje.

    Każdy podfolder katalogu "dane" jest traktowany
    jako osobna lekcja.
    """

    global lesson_folders

    # Usuń poprzednią zawartość listy lekcji.
    lesson_list.delete(0, tk.END)


    # --------------------------------------------------------
    # Sprawdzenie folderu "dane"
    # --------------------------------------------------------

    if not DATA_DIR.exists():

        menu_status.config(
            text="Nie znaleziono katalogu 'dane'."
        )

        lesson_folders = []

        return


    # --------------------------------------------------------
    # Wyszukanie lekcji
    # --------------------------------------------------------

    lesson_folders = [
        folder
        for folder in DATA_DIR.iterdir()
        if folder.is_dir()
    ]


    # --------------------------------------------------------
    # Sortowanie alfabetyczne
    # --------------------------------------------------------

    lesson_folders.sort(
        key=lambda folder: folder.name.lower()
    )


    # --------------------------------------------------------
    # Dodanie lekcji do interfejsu
    # --------------------------------------------------------

    for folder in lesson_folders:

        lesson_list.insert(
            tk.END,
            folder.name
        )


    # --------------------------------------------------------
    # Domyślne zaznaczenie pierwszej lekcji
    # --------------------------------------------------------

    if lesson_folders:

        lesson_list.selection_set(0)


# ============================================================
# FUNKCJE - PRZYCISKI ODPOWIEDZI
# ============================================================

def hide_answer_buttons():
    """
    Ukrywa czerwony i zielony przycisk.
    """

    red_button.grid_remove()
    green_button.grid_remove()


def show_answer_buttons():
    """
    Ponownie pokazuje czerwony i zielony przycisk.

    Funkcja grid() bez parametrów przywraca poprzednie
    położenie zapamiętane przez grid_remove().
    """

    red_button.grid()
    green_button.grid()


# ============================================================
# FUNKCJE - EFEKT KLIKNIĘCIA Z KLAWIATURY
# ============================================================

def keyboard_button_press(
    button,
    normal_color,
    active_color,
    action
):
    """
    Pokazuje wizualny efekt wciśnięcia przycisku
    po użyciu klawiatury.

    button:
        przycisk, który ma zostać animowany

    normal_color:
        normalny kolor przycisku

    active_color:
        kolor przycisku podczas wciśnięcia

    action:
        funkcja, która ma zostać wykonana
        po krótkiej animacji
    """

    global keyboard_button_animation_active


    # Jeżeli nie jesteśmy na ekranie lekcji,
    # nic nie rób.
    if not lesson_frame.winfo_ismapped():
        return


    # Jeżeli lekcja została zakończona,
    # nic nie rób.
    if current_index >= len(current_cards):
        return


    # Jeżeli animacja już trwa, nie uruchamiaj kolejnej.
    if keyboard_button_animation_active:
        return


    keyboard_button_animation_active = True


    # --------------------------------------------------------
    # Wygląd wciśniętego przycisku
    # --------------------------------------------------------

    button.config(
        bg=active_color,
        relief="sunken"
    )


    # --------------------------------------------------------
    # Po krótkim czasie przywróć przycisk
    # i wykonaj odpowiednią akcję.
    # --------------------------------------------------------

    root.after(
        KEYBOARD_BUTTON_PRESS_TIME,
        lambda: finish_keyboard_button_press(
            button,
            normal_color,
            action
        )
    )


def finish_keyboard_button_press(
    button,
    normal_color,
    action
):
    """
    Kończy animację przycisku i wykonuje
    przypisaną do niego akcję.
    """

    global keyboard_button_animation_active


    # Przywróć normalny wygląd.
    button.config(
        bg=normal_color,
        relief="flat"
    )


    keyboard_button_animation_active = False


    # Wykonaj odpowiednią akcję:
    #
    # mark_wrong()
    #
    # albo:
    #
    # mark_correct()
    action()


def keyboard_mark_wrong(event=None):
    """
    Obsługa strzałki w lewo.

    Pokazuje efekt kliknięcia czerwonego przycisku,
    a następnie oznacza fiszkę jako błędną.
    """

    keyboard_button_press(
        red_button,
        RED_BUTTON_COLOR,
        RED_BUTTON_ACTIVE_COLOR,
        mark_wrong
    )


def keyboard_mark_correct(event=None):
    """
    Obsługa strzałki w prawo.

    Pokazuje efekt kliknięcia zielonego przycisku,
    a następnie oznacza fiszkę jako poprawną.
    """

    keyboard_button_press(
        green_button,
        GREEN_BUTTON_COLOR,
        GREEN_BUTTON_ACTIVE_COLOR,
        mark_correct
    )


# ============================================================
# FUNKCJE - URUCHAMIANIE LEKCJI
# ============================================================

def start_selected_lesson():
    """
    Uruchamia lekcję zaznaczoną na ekranie startowym.
    """

    global current_cards
    global missed_cards
    global current_index


    # --------------------------------------------------------
    # Sprawdzenie wyboru użytkownika
    # --------------------------------------------------------

    selection = lesson_list.curselection()

    if not selection:

        menu_status.config(
            text="Najpierw wybierz lekcję."
        )

        return


    # --------------------------------------------------------
    # Wybrany folder lekcji
    # --------------------------------------------------------

    selected_index = selection[0]

    selected_folder = lesson_folders[selected_index]


    # --------------------------------------------------------
    # Wyszukanie grafik
    # --------------------------------------------------------

    cards = [
        file
        for file in selected_folder.iterdir()
        if (
            file.is_file()
            and file.suffix.lower() in SUPPORTED_EXTENSIONS
        )
    ]


    # --------------------------------------------------------
    # Sprawdzenie zawartości lekcji
    # --------------------------------------------------------

    if not cards:

        menu_status.config(
            text="Ta lekcja nie zawiera grafik."
        )

        return


    # --------------------------------------------------------
    # Przygotowanie nowej lekcji
    # --------------------------------------------------------

    random.shuffle(cards)

    current_cards = cards

    missed_cards = []

    current_index = 0


    # --------------------------------------------------------
    # Aktualizacja interfejsu
    # --------------------------------------------------------

    lesson_title.config(
        text=f"Lekcja: {selected_folder.name}"
    )

    round_label.config(
        text="Pierwsza seria"
    )


    # --------------------------------------------------------
    # Przywrócenie przycisków
    # --------------------------------------------------------

    show_answer_buttons()


    # --------------------------------------------------------
    # Zmiana ekranu
    # --------------------------------------------------------

    menu_frame.pack_forget()

    lesson_frame.pack(
        fill="both",
        expand=True
    )


    # Wyświetlenie pierwszej fiszki.
    show_card()


# ============================================================
# FUNKCJE - OBSŁUGA FISZEK
# ============================================================

def show_card():
    """
    Wyświetla aktualną fiszkę.

    Jeżeli seria została zakończona:

    - błędne fiszki trafiają do kolejnej rundy,
    - jeżeli błędnych fiszek już nie ma, lekcja się kończy.
    """

    global current_index
    global current_cards
    global missed_cards
    global current_photo


    # ========================================================
    # KONIEC AKTUALNEJ SERII
    # ========================================================

    if current_index >= len(current_cards):


        # ----------------------------------------------------
        # Są błędne odpowiedzi
        # ----------------------------------------------------

        if missed_cards:

            current_cards = missed_cards.copy()

            missed_cards.clear()

            # Ponownie losujemy kolejność błędnych fiszek.
            random.shuffle(current_cards)

            current_index = 0

            round_label.config(
                text="Powtórka błędnych"
            )


        # ----------------------------------------------------
        # Wszystkie fiszki zaliczone
        # ----------------------------------------------------

        else:

            image_label.config(
                image="",
                text="✓",
                font=("Sans", 100)
            )

            # Usuń referencję do poprzedniego obrazu.
            image_label.image = None

            answer_label.config(
                text="Wszystkie fiszki zaliczone!"
            )

            # Usuń licznik fiszek.
            counter_label.config(
                text=""
            )

            # Usuń napis:
            # "Pierwsza seria" lub "Powtórka błędnych".
            round_label.config(
                text=""
            )

            # Ukryj przyciski.
            hide_answer_buttons()

            return


    # ========================================================
    # AKTUALNA FISZKA
    # ========================================================

    current_file = current_cards[current_index]


    # ========================================================
    # WCZYTANIE OBRAZU
    # ========================================================

    with Image.open(current_file) as image:

        image.thumbnail(
            (
                IMAGE_WIDTH,
                IMAGE_HEIGHT
            ),
            Image.Resampling.LANCZOS
        )

        current_photo = ImageTk.PhotoImage(
            image.copy()
        )


    # ========================================================
    # WYŚWIETLENIE OBRAZU
    # ========================================================

    image_label.config(
        image=current_photo,
        text=""
    )

    # Tkinter musi zachować referencję do obrazu.
    image_label.image = current_photo


    # ========================================================
    # UKRYCIE ODPOWIEDZI
    # ========================================================

    answer_label.config(
        text="Kliknij symbol, aby zobaczyć odpowiedź lub strzałki ↑↓"
    )


    # ========================================================
    # LICZNIK FISZEK
    # ========================================================

    counter_label.config(
        text=(
            f"{current_index + 1} / "
            f"{len(current_cards)}"
        )
    )


# ============================================================

def reveal_answer(event=None):
    """
    Pokazuje odpowiedź dla aktualnej fiszki.

    Funkcja może być wywołana:
    - kliknięciem obrazu,
    - strzałką w górę,
    - strzałką w dół.
    """

    # Jeżeli ekran lekcji nie jest aktualnie wyświetlany,
    # klawisze nie powinny nic robić.
    if not lesson_frame.winfo_ismapped():
        return


    # Zabezpieczenie przed użyciem klawisza
    # po zakończeniu lekcji.
    if current_index >= len(current_cards):
        return


    current_file = current_cards[current_index]


    # Nazwa pliku bez rozszerzenia.
    answer = current_file.stem


    answer_label.config(
        text=answer
    )


# ============================================================

def mark_correct(event=None):
    """
    Oznacza aktualną fiszkę jako poprawną.

    Funkcja może być wywołana:
    - zielonym przyciskiem WIEM,
    - funkcją obsługującą strzałkę w prawo.
    """

    global current_index


    # Nie reaguj, jeżeli jesteśmy w menu.
    if not lesson_frame.winfo_ismapped():
        return


    # Zabezpieczenie przed kliknięciem po zakończeniu lekcji.
    if current_index >= len(current_cards):
        return


    current_index += 1

    show_card()


# ============================================================

def mark_wrong(event=None):
    """
    Oznacza aktualną fiszkę jako błędną.

    Funkcja może być wywołana:
    - czerwonym przyciskiem NIE WIEM,
    - funkcją obsługującą strzałkę w lewo.
    """

    global current_index


    # Nie reaguj, jeżeli jesteśmy w menu.
    if not lesson_frame.winfo_ismapped():
        return


    # Zabezpieczenie przed kliknięciem po zakończeniu lekcji.
    if current_index >= len(current_cards):
        return


    # Aktualna fiszka trafia do listy błędnych.
    missed_cards.append(
        current_cards[current_index]
    )


    current_index += 1

    show_card()


# ============================================================
# FUNKCJE - NAWIGACJA
# ============================================================

def return_to_menu():
    """
    Wraca z ekranu lekcji do listy dostępnych lekcji.
    """

    lesson_frame.pack_forget()

    menu_frame.pack(
        fill="both",
        expand=True
    )

    refresh_lessons()


# ============================================================
# TWORZENIE GŁÓWNEGO OKNA
# ============================================================

root = tk.Tk()


# Tytuł okna.
root.title(
    WINDOW_TITLE
)


# Początkowy rozmiar okna.
root.geometry(
    f"{WINDOW_WIDTH}x{WINDOW_HEIGHT}"
)


# ============================================================
# GUI - EKRAN STARTOWY
# ============================================================

menu_frame = tk.Frame(
    root
)

menu_frame.pack(
    fill="both",
    expand=True
)


# ------------------------------------------------------------
# Tytuł programu
# ------------------------------------------------------------

title_label = tk.Label(
    menu_frame,
    text="FISZKI",
    font=("Sans", 32, "bold")
)

title_label.pack(
    pady=30
)


# ------------------------------------------------------------
# Tekst nad listą
# ------------------------------------------------------------

choose_label = tk.Label(
    menu_frame,
    text="Wybierz lekcję:",
    font=("Sans", 16)
)

choose_label.pack(
    pady=10
)


# ------------------------------------------------------------
# Lista lekcji
# ------------------------------------------------------------

lesson_list = tk.Listbox(
    menu_frame,
    width=40,
    height=12,
    font=("Sans", 15)
)

lesson_list.pack(
    pady=10
)


# ------------------------------------------------------------
# Przycisk rozpoczęcia lekcji
# ------------------------------------------------------------

start_button = tk.Button(
    menu_frame,
    text="Rozpocznij lekcję",
    font=("Sans", 15),
    command=start_selected_lesson
)

start_button.pack(
    pady=15
)


# ------------------------------------------------------------
# Pole komunikatów
# ------------------------------------------------------------

menu_status = tk.Label(
    menu_frame,
    text=""
)

menu_status.pack(
    pady=10
)


# ============================================================
# GUI - EKRAN LEKCJI
# ============================================================

lesson_frame = tk.Frame(
    root
)


# ============================================================
# GUI - GÓRNY PASEK
# ============================================================

top_frame = tk.Frame(
    lesson_frame
)

top_frame.pack(
    side="top",
    fill="x"
)


# ------------------------------------------------------------
# Przycisk powrotu - lewa strona
# ------------------------------------------------------------

back_button = tk.Button(
    top_frame,
    text="← Powrót do listy lekcji",
    command=return_to_menu
)

back_button.pack(
    side="left",
    padx=10,
    pady=10
)


# ------------------------------------------------------------
# Informacje o serii - prawa strona
# ------------------------------------------------------------

info_frame = tk.Frame(
    top_frame
)

info_frame.pack(
    side="right",
    padx=10,
    pady=5
)


round_label = tk.Label(
    info_frame,
    text="",
    font=("Sans", 12)
)

round_label.pack(
    anchor="e"
)


counter_label = tk.Label(
    info_frame,
    text="",
    font=("Sans", 12)
)

counter_label.pack(
    anchor="e"
)


# ============================================================
# GUI - TYTUŁ LEKCJI
# ============================================================

lesson_title = tk.Label(
    lesson_frame,
    text="",
    font=("Sans", 20, "bold")
)

lesson_title.pack(
    pady=10
)


# ============================================================
# GUI - FISZKA I PRZYCISKI
# ============================================================
#
# card_frame zawiera trzy kolumny:
#
#   0                1                2
#
# NIE WIEM         OBRAZ             WIEM
#
# ============================================================

card_frame = tk.Frame(
    lesson_frame
)

card_frame.pack(
    fill="x",
    padx=20,
    pady=20
)


# Lewa i prawa kolumna mogą zajmować wolne miejsce.
# Dzięki temu obraz pozostaje na środku.

card_frame.grid_columnconfigure(
    0,
    weight=1
)

card_frame.grid_columnconfigure(
    2,
    weight=1
)


# ------------------------------------------------------------
# Czerwony przycisk - lewa strona
# ------------------------------------------------------------

red_button = tk.Button(
    card_frame,
    text="← NIE WIEM",
    font=("Sans", 18, "bold"),
    bg=RED_BUTTON_COLOR,
    fg="white",
    activebackground=RED_BUTTON_ACTIVE_COLOR,
    activeforeground="white",
    width=10,
    pady=10,
    bd=0,
    relief="flat",
    cursor="hand2",
    command=mark_wrong
)

red_button.grid(
    row=0,
    column=0,
    padx=20
)


# ------------------------------------------------------------
# Obraz - środek
# ------------------------------------------------------------

image_label = tk.Label(
    card_frame,
    cursor="hand2"
)

image_label.grid(
    row=0,
    column=1,
    padx=20
)


# Kliknięcie obrazu pokazuje odpowiedź.
image_label.bind(
    "<Button-1>",
    reveal_answer
)


# ------------------------------------------------------------
# Zielony przycisk - prawa strona
# ------------------------------------------------------------

green_button = tk.Button(
    card_frame,
    text="WIEM →",
    font=("Sans", 18, "bold"),
    bg=GREEN_BUTTON_COLOR,
    fg="white",
    activebackground=GREEN_BUTTON_ACTIVE_COLOR,
    activeforeground="white",
    width=10,
    pady=10,
    bd=0,
    relief="flat",
    cursor="hand2",
    command=mark_correct
)

green_button.grid(
    row=0,
    column=2,
    padx=20
)


# ============================================================
# GUI - ODPOWIEDŹ
# ============================================================

answer_label = tk.Label(
    lesson_frame,
    text="",
    font=("Sans", 20),

    # Maksymalna szerokość tekstu przed zawinięciem.
    wraplength=850,

    # Wyśrodkowanie tekstu wieloliniowego.
    justify="center"
)

answer_label.pack(
    pady=15
)


# ============================================================
# OBSŁUGA KLAWIATURY
# ============================================================
#
# ←  NIE WIEM
# →  WIEM
# ↑  POKAŻ ODPOWIEDŹ
# ↓  POKAŻ ODPOWIEDŹ
#
# ============================================================

root.bind(
    "<Left>",
    keyboard_mark_wrong
)

root.bind(
    "<Right>",
    keyboard_mark_correct
)

root.bind(
    "<Up>",
    reveal_answer
)

root.bind(
    "<Down>",
    reveal_answer
)


# ============================================================
# START PROGRAMU
# ============================================================

refresh_lessons()

root.mainloop()
