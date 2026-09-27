const SUPPORTED_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".bmp",
  ".gif",
  ".webp",
];

const menuScreen = document.querySelector("#menu-screen");
const lessonScreen = document.querySelector("#lesson-screen");

const lessonSelect = document.querySelector("#lesson-select");
const startButton = document.querySelector("#start-button");
const menuStatus = document.querySelector("#menu-status");

const backButton = document.querySelector("#back-button");
const lessonTitle = document.querySelector("#lesson-title");
const roundLabel = document.querySelector("#round-label");
const counterLabel = document.querySelector("#counter-label");

const wrongButton = document.querySelector("#wrong-button");
const correctButton = document.querySelector("#correct-button");

const imageButton = document.querySelector("#image-button");
const cardImage = document.querySelector("#card-image");
const finishMark = document.querySelector("#finish-mark");

const answerLabel = document.querySelector("#answer-label");

let lessons = {};
let currentLessonName = "";
let currentCards = [];
let missedCards = [];
let currentIndex = 0;
let lessonActive = false;

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}

function encodePathSegment(value) {
  return encodeURIComponent(value);
}

function getCardPath(lessonName, fileName) {
  return `./dane/${encodePathSegment(lessonName)}/${encodePathSegment(fileName)}`;
}

function getAnswerFromFileName(fileName) {
  const lastDot = fileName.lastIndexOf(".");

  if (lastDot === -1) {
    return fileName;
  }

  return fileName.slice(0, lastDot);
}

function pressEffect(button) {
  button.classList.add("keyboard-pressed");

  window.setTimeout(() => {
    button.classList.remove("keyboard-pressed");
  }, 100);
}

async function loadLessons() {
  menuStatus.textContent = "";

  try {
    const response = await fetch("./lessons.json", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    lessons = await response.json();

    const names = Object.keys(lessons).sort((a, b) =>
      a.localeCompare(b, "pl", { sensitivity: "base" })
    );

    lessonSelect.innerHTML = "";

    if (names.length === 0) {
      menuStatus.textContent = "Nie znaleziono żadnych lekcji.";
      startButton.disabled = true;
      return;
    }

    for (const name of names) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      lessonSelect.appendChild(option);
    }

    startButton.disabled = false;
  } catch (error) {
    console.error(error);

    menuStatus.textContent =
      "Nie udało się wczytać lessons.json. Uruchom generate_lessons.py.";
    startButton.disabled = true;
  }
}

function startSelectedLesson() {
  const selectedName = lessonSelect.value;

  if (!selectedName || !lessons[selectedName]) {
    menuStatus.textContent = "Najpierw wybierz lekcję.";
    return;
  }

  const files = lessons[selectedName].filter((fileName) =>
    SUPPORTED_EXTENSIONS.some((extension) =>
      fileName.toLowerCase().endsWith(extension)
    )
  );

  if (files.length === 0) {
    menuStatus.textContent = "Ta lekcja nie zawiera grafik.";
    return;
  }

  currentLessonName = selectedName;
  currentCards = shuffle([...files]);
  missedCards = [];
  currentIndex = 0;
  lessonActive = true;

  lessonTitle.textContent = `Lekcja: ${currentLessonName}`;
  roundLabel.textContent = "Pierwsza seria";

  wrongButton.classList.remove("hidden");
  correctButton.classList.remove("hidden");

  finishMark.classList.add("hidden");
  cardImage.classList.remove("hidden");

  menuScreen.classList.add("hidden");
  lessonScreen.classList.remove("hidden");

  showCard();
}

function showCard() {
  if (currentIndex >= currentCards.length) {
    if (missedCards.length > 0) {
      currentCards = shuffle([...missedCards]);
      missedCards = [];
      currentIndex = 0;

      roundLabel.textContent = "Powtórka błędnych";
    } else {
      finishLesson();
      return;
    }
  }

  const currentFile = currentCards[currentIndex];

  cardImage.src = getCardPath(currentLessonName, currentFile);
  cardImage.alt = `Fiszka ${currentIndex + 1}`;

  answerLabel.textContent =
    "Kliknij symbol, aby zobaczyć odpowiedź lub użyj strzałek ↑↓";

  counterLabel.textContent = `${currentIndex + 1} / ${currentCards.length}`;
}

function revealAnswer() {
  if (!lessonActive || currentIndex >= currentCards.length) {
    return;
  }

  const currentFile = currentCards[currentIndex];

  answerLabel.textContent = getAnswerFromFileName(currentFile);
}

function markCorrect() {
  if (!lessonActive || currentIndex >= currentCards.length) {
    return;
  }

  currentIndex += 1;
  showCard();
}

function markWrong() {
  if (!lessonActive || currentIndex >= currentCards.length) {
    return;
  }

  missedCards.push(currentCards[currentIndex]);

  currentIndex += 1;
  showCard();
}

function finishLesson() {
  lessonActive = false;

  cardImage.src = "";
  cardImage.classList.add("hidden");

  finishMark.classList.remove("hidden");

  answerLabel.textContent = "Wszystkie fiszki zaliczone!";

  roundLabel.textContent = "";
  counterLabel.textContent = "";

  wrongButton.classList.add("hidden");
  correctButton.classList.add("hidden");
}

function returnToMenu() {
  lessonActive = false;

  lessonScreen.classList.add("hidden");
  menuScreen.classList.remove("hidden");

  loadLessons();
}

function handleKeyboard(event) {
  if (!lessonActive) {
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    pressEffect(wrongButton);
    markWrong();
    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    pressEffect(correctButton);
    markCorrect();
    return;
  }

  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    revealAnswer();
  }
}

startButton.addEventListener("click", startSelectedLesson);
backButton.addEventListener("click", returnToMenu);

wrongButton.addEventListener("click", markWrong);
correctButton.addEventListener("click", markCorrect);

imageButton.addEventListener("click", revealAnswer);

document.addEventListener("keydown", handleKeyboard);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .catch((error) => {
        console.error("Service Worker:", error);
      });
  });
}

loadLessons();
