'use strict';

const $ = (id) => document.getElementById(id);
// Numer aktualnego wydania ustawiamy w docs/index.html (data-app-version).
const APP_VERSION = document.documentElement.dataset.appVersion || 'nieznana';
const MODES = {
  self_assess: 'WIEM / NIE WIEM',
  abcd: 'ABCD',
  learn: 'Nauka',
  review: 'Powtórzenie',
};
const state = {
  catalog: null, path: [], lessonNode: null, moduleNode: null,
  lesson: null, lessonUrl: null, mode: null,
  round: [], missed: [], index: 0, roundNumber: 1, locked: false,
  completed: 0, advanceTimer: null, finished: false,
  modePreferences: readModePreferences(),
  reversed: false, reversePreferences: readReversePreferences(),
  directSession: false, // Brak ekranu wyboru trybu w lekcji z jednym dostępnym trybem.
};

// Zapamiętujemy ostatni tryb osobno dla każdego modułu głównego.
function readModePreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem('fiszki-v2:last-modes') || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch (_) {
    return {};
  }
}
function rememberMode(moduleId, mode) {
  state.modePreferences[moduleId] = mode;
  try {
    localStorage.setItem('fiszki-v2:last-modes', JSON.stringify(state.modePreferences));
  } catch (_) {
    // W przeglądarkach blokujących zapis preferencja działa do odświeżenia strony.
  }
}


// Odwrócone fiszki: preferencja zapamiętana dla modułu Fiszki,
// nie modyfikuje danych ani plików lekcji.
function readReversePreferences() {
  try {
    const value = JSON.parse(localStorage.getItem('fiszki-v2:reverse-modes') || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (_) { return {}; }
}
function rememberReverse(moduleId, enabled) {
  state.reversePreferences[moduleId] = enabled;
  try { localStorage.setItem('fiszki-v2:reverse-modes', JSON.stringify(state.reversePreferences)); }
  catch (_) { /* W trybie prywatnym opcja działa do zamknięcia strony. */ }
}

// Wpisy w historii sprawiają, że systemowy gest Androida oraz przycisk
// Wstecz w przeglądarce działają jak nawigacja w aplikacji.
// Ścieżkę przechowujemy jako identyfikatory węzłów, nie obiekty JS.
let navigationGeneration = 0;
function currentScreen() {
  if (!$('session-view').classList.contains('hidden')) return 'session';
  if (!$('setup-view').classList.contains('hidden')) return 'setup';
  return 'menu';
}
function routeSnapshot(view = currentScreen()) {
  return {
    fiszkiV2: true, view,
    path: state.path.map(n => n.id),
    lesson: state.lessonNode?.id || null,
    mode: state.mode,
    reversed: state.reversed,
    directSession: state.directSession,
    depth: 0,
  };
}
function recordRoute(view, replace = false) {
  const prior = history.state;
  const depth = replace ? (prior?.fiszkiV2 ? prior.depth || 0 : 0)
    : (prior?.fiszkiV2 ? prior.depth || 0 : 0) + 1;
  const route = {...routeSnapshot(view), depth};
  try { history[replace ? 'replaceState' : 'pushState'](route, '', location.href); }
  catch (err) { console.warn('Historia aplikacji jest niedostępna:', err); }
}
function resolveHistoryRoute(route) {
  let children = state.catalog.items;
  const path = [];
  for (const id of route.path || []) {
    const node = children.find(item => item.id === id && item.kind !== 'lesson');
    if (!node) throw new Error(`Nie odnaleziono działu ${id}`);
    path.push(node);
    children = node.children || [];
  }
  const lesson = route.lesson ? children.find(item => item.kind === 'lesson' && item.id === route.lesson) : null;
  if (route.lesson && !lesson) throw new Error(`Nie odnaleziono lekcji ${route.lesson}`);
  return {path, lesson};
}
async function restoreRoute(route) {
  if (!state.catalog || !route?.fiszkiV2) return;
  const generation = ++navigationGeneration;
  try {
    const resolved = resolveHistoryRoute(route);
    stopPending();
    state.path = resolved.path;
    state.lessonNode = resolved.lesson;
    state.reversed = !!route.reversed;
    state.directSession = !!route.directSession;
    if (route.view === 'session' && state.lessonNode && route.mode) {
      await startSession(route.mode, true, generation);
    } else if (route.view === 'setup' && state.lessonNode) {
      // Po powrocie gestem odtwarzamy ograniczenia trybów konkretnej lekcji.
      if (state.path.find(n => n.kind === 'module')?.module_type === 'study') {
        const loaded = await fetchLessonDocument(state.lessonNode);
        if (generation !== navigationGeneration) return;
        state.lesson = loaded.lesson; state.lessonUrl = loaded.url;
      }
      showSetup();
    } else {
      showMenu();
    }
  } catch (err) {
    console.error('Nie udało się odtworzyć historii:', err);
    state.path = []; state.lessonNode = null; showMenu();
  }
}
window.addEventListener('popstate', (event) => {
  // Po ukończeniu sesji pomijamy ekran wyboru trybu i wracamy
  // do listy lekcji — tak samo jak przy przycisku „Wybór lekcji”.
  if (state.finished && currentScreen() === 'session' && event.state?.view === 'setup') {
    if (event.state?.depth > 0) { history.back(); return; }
    state.lessonNode = null; showMenu(); return;
  }
  if (event.state?.fiszkiV2) void restoreRoute(event.state);
});
function goToLessonList() {
  stopPending();
  const depth = history.state?.fiszkiV2 ? history.state.depth : 0;
  const steps = state.directSession ? 1 : 2;
  if (depth >= steps) history.go(-steps);
  else { state.lessonNode = null; showMenu(); recordRoute('menu', true); }
}


const clear = (elem) => elem.replaceChildren();
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function shuffled(items) {
  const output = [...items];
  for (let i = output.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}
function renderHomeComment(screen) {
  const bar = $('home-comment-bar');
  if (!bar) return;
  const comment = typeof state.catalog?.home_comment === 'string'
    ? state.catalog.home_comment.trim() : '';
  const visible = screen === 'menu-view' && state.path.length === 0 && !!comment;
  bar.classList.toggle('hidden', !visible);
  $('home-comment-text').textContent = visible ? comment : '';
}
function showScreen(screen) {
  ['menu-view', 'setup-view', 'session-view'].forEach((id) => {
    $(id).classList.toggle('hidden', id !== screen);
  });
  $('error-box').classList.add('hidden');
  $('reset-btn').classList.toggle('hidden', screen !== 'session-view');
  if (screen !== 'session-view') hideFooterActions();
  renderHomeComment(screen);
}
function error(message) {
  $('error-box').textContent = message;
  $('error-box').classList.remove('hidden');
}
function stopPending() {
  if (state.advanceTimer !== null) clearTimeout(state.advanceTimer);
  state.advanceTimer = null;
  state.locked = false;
}
function renderHeader() {
  const titles = state.path.map((n) => n.title);
  if (state.lessonNode) titles.push(state.lessonNode.title);
  $('breadcrumb').textContent = ['Fiszki v2', ...titles].join(' › ');
  document.querySelector('.app-header').classList.toggle('at-home', state.path.length === 0 && !state.lessonNode);
  $('back-btn').disabled = !state.path.length && !state.lessonNode;
  const inSession = !$('session-view').classList.contains('hidden');
  $('mode-caption').textContent = state.mode && inSession
    ? `${MODES[state.mode]}${state.reversed ? ' · Odwrócone' : ''}` : '';
  // Oznaczenie dotyczy wyłącznie aktualnie widocznej KARTY w trybie Nauka.
  const currentCard = state.round[state.index];
  const showImportant = inSession && !state.finished && state.mode === 'learn'
    && currentCard?.important === true;
  $('important-label').classList.toggle('hidden', !showImportant);
}
function setProgress(text, ratio) {
  $('status-text').textContent = text;
  $('progress-fill').style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`;
}
// Sterowanie Nauka i Powtórzenie znajduje się bezpośrednio w dolnym pasku.
// Przy wyjściu z sesji i po ukończeniu ukrywamy je, by nie pozostały na menu.
function hideFooterActions() {
  $('footer-actions').classList.add('hidden');
  document.querySelector('.status-bar').classList.remove('has-actions');
}
function configureFooterActions() {
  const learning = state.mode === 'learn';
  const reviewing = state.mode === 'review';
  const visible = !state.finished && (learning || reviewing);
  $('footer-actions').classList.toggle('hidden', !visible);
  document.querySelector('.status-bar').classList.toggle('has-actions', visible);
  $('footer-previous').classList.toggle('hidden', !learning);
  $('footer-next').classList.toggle('hidden', !learning);
  $('footer-wrong').classList.toggle('hidden', !reviewing);
  $('footer-correct').classList.toggle('hidden', !reviewing);
  if (learning) {
    $('footer-previous').disabled = state.index === 0;
    $('footer-next').textContent = state.index === state.round.length - 1
      ? '↻ Od początku' : 'Następna →';
  }
}
function previousStudyCard() {
  if (state.mode !== 'learn' || state.finished || state.index <= 0) return;
  state.index--;
  renderCard();
}
function nextStudyCard() {
  if (state.mode !== 'learn' || state.finished) return;
  if (state.index === state.round.length - 1) resetSession();
  else { state.index++; renderCard(); }
}
// Lekcje ELE.02 mogą mieć tylko Nauka, tylko Powtórzenie albo oba tryby.
// Stare lekcje bez available_modes dziedziczą ustawienia działu (zgodność wsteczna).
function lessonModes(moduleNode, lesson) {
  const moduleModes = Array.isArray(moduleNode?.modes) ? moduleNode.modes : [];
  if (moduleNode?.module_type !== 'study') return moduleModes;
  if (!Array.isArray(lesson?.available_modes)) return moduleModes;
  return moduleModes.filter(mode => lesson.available_modes.includes(mode));
}
async function fetchLessonDocument(node) {
  const url = new URL(`./data/${node.file}`, document.baseURI);
  const response = await fetch(url, {cache:'no-store'});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return {lesson:await response.json(), url};
}
// Z listy lekcji wchodzimy bezpośrednio do Nauk/iPowtórzenia,
// jeśli w Adminie dopuszczono tylko jeden tryb.
async function openLesson(node) {
  state.lessonNode = node;
  state.directSession = false;
  state.reversed = false;
  const moduleNode = state.path.find(n => n.kind === 'module');
  if (moduleNode?.module_type !== 'study') {
    showSetup(); recordRoute('setup'); return;
  }
  const generation = ++navigationGeneration;
  try {
    const loaded = await fetchLessonDocument(node);
    if (generation !== navigationGeneration || state.lessonNode !== node) return;
    state.lesson = loaded.lesson; state.lessonUrl = loaded.url;
    const modes = lessonModes(moduleNode, loaded.lesson);
    if (!modes.length) throw new Error('Ta lekcja nie ma żadnego dostępnego trybu.');
    if (modes.length === 1) {
      state.directSession = true;
      await startSession(modes[0], false, generation, loaded);
    } else {
      showSetup(); recordRoute('setup');
    }
  } catch (err) {
    if (generation === navigationGeneration) error(`Nie można otworzyć lekcji: ${err.message}`);
  }
}
function showMenu() {
  stopPending();
  state.lessonNode = null;
  state.lesson = null;
  state.mode = null;
  state.directSession = false;
  state.moduleNode = state.path.find((node) => node.kind === 'module') || null;
  const items = state.path.length ? state.path[state.path.length - 1].children : state.catalog.items;
  const container = $('menu-view');
  clear(container);
  const grid = el('div', null, 'menu-grid');
  const studyModule = state.path.find(n => n.kind === 'module' && n.module_type === 'study');
  for (const node of items) {
    const btn = el('button', null, 'menu-tile');
    btn.type = 'button';
    const detail = el('span', node.kind === 'module' ? 'Otwórz dział' : node.kind === 'folder' ? 'Otwórz kategorię' : 'Wybierz tryb nauki');
    btn.append(el('strong', node.title), detail);
    if (node.kind === 'lesson' && studyModule) {
      detail.textContent = 'Wczytywanie dostępnych trybów…';
      // Odczytujemy tylko widoczne lekcje. Nie modyfikujemy menu.json ani danych.
      fetchLessonDocument(node).then(({lesson}) => {
        if (!btn.isConnected) return;
        const modes = lessonModes(studyModule, lesson);
        detail.textContent = modes.length === 1
          ? `Tryb: ${MODES[modes[0]]}`
          : modes.length > 1 ? `Tryby: ${modes.map(m => MODES[m]).join(' / ')}` : 'Brak dostępnego trybu';
      }).catch(() => {
        if (btn.isConnected) detail.textContent = 'Nie udało się sprawdzić trybów';
      });
    }
    btn.addEventListener('click', () => {
      if (node.kind === 'lesson') {
        void openLesson(node);
      } else {
        ++navigationGeneration; // Spóźniony odczyt lekcji nie może otworzyć ekranu.
        state.path.push(node);
        showMenu();
        recordRoute('menu');
      }
    });
    grid.append(btn);
  }
  container.append(grid);
  showScreen('menu-view');
  setProgress(`Fiszki v2 · wersja ${APP_VERSION}`, 0);
  renderHeader();
}
function showSetup() {
  stopPending();
  const moduleNode = state.path.find((n) => n.kind === 'module');
  if (!moduleNode) return error('Lekcja musi należeć do modułu głównego.');
  state.moduleNode = moduleNode;
  const container = $('setup-view');
  clear(container);
  const card = el('div', null, 'setup-card');
  card.append(el('h2', state.lessonNode.title), el('p', 'Wybierz tryb pracy tej lekcji.', 'muted'));
  const form = el('form');
  const modes = el('div', null, 'mode-list');
  const modesForLesson = lessonModes(moduleNode, state.lesson);
  const preferred = modesForLesson.includes(state.modePreferences[moduleNode.id])
    ? state.modePreferences[moduleNode.id] : modesForLesson[0];
  for (const [i, mode] of modesForLesson.entries()) {
    const label = el('label', null, 'mode-item');
    const input = document.createElement('input');
    input.type = 'radio'; input.name = 'mode'; input.value = mode;
    if (mode === preferred) input.checked = true;
    input.addEventListener('change', () => {
      if (input.checked) rememberMode(moduleNode.id, mode);
    });
    label.append(input, el('span', MODES[mode] || mode));
    modes.append(label);
  }
  // Opcja dostępna wyłącznie w module Fiszki, nie w ELE.02.
  let reverseInput = null;
  if (moduleNode.module_type === 'flashcards') {
    const reverseLabel = el('label', null, 'reverse-option hidden');
    reverseInput = document.createElement('input');
    reverseInput.type = 'checkbox';
    reverseInput.name = 'reversed';
    reverseInput.checked = false;
    reverseInput.addEventListener('change', () => rememberReverse(state.lessonNode.id, reverseInput.checked));
    const reverseText = el('span');
    reverseText.append(el('strong', 'Odwrócone'), el('small', 'Najpierw odpowiedź — odgadnij pytanie (działa też w ABCD).'));
    reverseLabel.append(reverseInput, reverseText);
    form.append(modes, reverseLabel);
  }
  const start = el('button', 'Rozpocznij', 'primary');
  start.type = 'submit';
  if (!reverseInput) form.append(modes);
  form.append(start);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const mode = form.elements.mode.value;
    if (!modesForLesson.includes(mode)) return;
    rememberMode(moduleNode.id, mode);
    state.reversed = !!reverseInput?.checked && !reverseInput?.disabled;
    await startSession(mode);
  });
  card.append(form); container.append(card);
  showScreen('setup-view'); setProgress('Wybór trybu', 0); renderHeader();
  // Uprawnienie jest przechowywane w JSON lekcji, nie w menu.json.
  // Przed odczytem blokujemy Start, by na wolnym łączu nie uruchomić
  // przypadkiem poprzednio zapamiętanego ustawienia innej lekcji.
  if (reverseInput) {
    const selectedNode=state.lessonNode;
    const reverseLabel=reverseInput.closest('.reverse-option');
    const lessonUrl=new URL(`./data/${selectedNode.file}`,document.baseURI);
    start.disabled=true;
    reverseInput.disabled=true;
    state.reversed=false;
    fetch(lessonUrl,{cache:'no-store'}).then(async response=>{
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      return response.json();
    }).then(lesson=>{
      // Ignorujemy spóźnione wyniki, gdy użytkownik wyszedł z wyboru trybu.
      if (state.lessonNode!==selectedNode || currentScreen()!=='setup') return;
      state.lesson=lesson;
      state.lessonUrl=lessonUrl;
      const allowed=lesson.allow_reversed===true;
      reverseLabel.classList.toggle('hidden',!allowed);
      reverseInput.disabled=!allowed;
      reverseInput.checked=allowed && !!state.reversePreferences[selectedNode.id];
      start.disabled=false;
    }).catch(err=>{
      if(state.lessonNode!==selectedNode || currentScreen()!=='setup')return;
      error(`Nie można wczytać ustawień lekcji: ${err.message}`);
      start.disabled=true;
    });
  }
}
async function startSession(mode, restoring = false, expectedGeneration = null, preloaded = null) {
  stopPending();
  const generation = expectedGeneration ?? ++navigationGeneration;
  try {
    const loaded = preloaded || await fetchLessonDocument(state.lessonNode);
    if (generation !== navigationGeneration) return;
    const lessonUrl = loaded.url, lesson = loaded.lesson;
    const moduleNode = state.path.find(n => n.kind === 'module');
    if (!lessonModes(moduleNode, lesson).includes(mode)) throw new Error('Ten tryb nie jest dostępny dla tej lekcji.');
    // Odwrócenie nie może zostać wymuszone przez historię przeglądarki.
    if(lesson.allow_reversed!==true)state.reversed=false;
    if (!Array.isArray(lesson.cards) || !lesson.cards.length) throw new Error('Lekcja jest pusta.');
    if (mode === 'abcd') {
      for (const card of lesson.cards) {
        const valid = state.reversed
          ? buildReverseChoices(card, lesson.cards).length === 4
          : buildOptions(card, lesson.cards).length === 4;
        if (!valid) {
          throw new Error(state.reversed
            ? 'Odwrócone ABCD wymaga czterech różnych pytań. Dodaj karty z różnymi pytaniami lub wybierz WIEM / NIE WIEM.'
            : 'Tryb ABCD wymaga czterech różnych odpowiedzi dla każdej karty. Uzupełnij quiz.distractors lub dodaj więcej kart.');
        }
      }
    }
    state.lesson = lesson; state.lessonUrl = lessonUrl; state.mode = mode;
    resetSession();
    if (!restoring) recordRoute('session');
  } catch (err) { console.error(err); error(`Nie można uruchomić lekcji: ${err.message}`); }
}
// Reset nie przeładowuje danych: ponownie rozpoczyna bieżącą lekcję
// w wybranym trybie, czyszcząc błędy, licznik i oczekujące opóźnienia ABCD.
function resetSession() {
  if (!state.lesson || !state.mode) return;
  stopPending();
  state.round = state.mode === 'learn' ? [...state.lesson.cards] : shuffled(state.lesson.cards);
  state.missed = [];
  state.index = 0;
  state.completed = 0;
  state.roundNumber = 1;
  state.finished = false;
  showScreen('session-view');
  renderHeader();
  renderCard();
}
// KaTeX: podstawowe wpisy typu m^2 lub P = a * b działają bez dodatkowej składni.
// Osobne linie pola "Wzór" rysujemy jako osobne równania; środowiska
// \begin{aligned}...\end{aligned} pozostawiamy bez dzielenia na linie.
function renderLatex(container, source) {
  const latex = String(source ?? '').trim();
  const expressions = (latex.includes('\n') && !/\\begin\s*\{/.test(latex))
    ? latex.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    : [latex];
  for (const expression of expressions) {
    const row = el('div', null, 'formula-line');
    if (window.katex) {
      try {
        window.katex.render(expression, row, {
          displayMode: true, throwOnError: false, trust: false, output: 'htmlAndMathml',
        });
      } catch (err) {
        console.warn('Błąd renderowania wzoru:', err);
        row.textContent = expression;
      }
    } else {
      row.textContent = expression;
      row.classList.add('math-unavailable');
      row.title = 'Nie udało się załadować KaTeX. Sprawdź dostęp do internetu.';
    }
    container.append(row);
  }
}

// Rozpoznaj rysunki czarno-białe na białym tle (np. symbole i jednostki z v1).
// Zamiast białego prostokąta pokazujemy jasny symbol na tle panelu.
// Nie zmieniamy fotografii ani kolorowych ilustracji. Oryginalne pliki
// pozostają nietknięte. W razie braku canvas/CORS zachowujemy obraz bez zmian.
function adaptDiagramToDarkTheme(img) {
  const analyze = () => {
    if (!img.naturalWidth || !img.naturalHeight) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.clearRect(0, 0, 64, 64);
      ctx.drawImage(img, 0, 0, 64, 64);
      const pixels = ctx.getImageData(0, 0, 64, 64).data;
      let opaque = 0, white = 0, dark = 0, colored = 0;
      let edgeOpaque = 0, edgeWhite = 0, translucent = 0;
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          const i = (y * 64 + x) * 4;
          const r = pixels[i], g = pixels[i+1], b = pixels[i+2], a = pixels[i+3];
          if (a < 180) { translucent++; continue; }
          opaque++;
          const bright = (r + g + b) / 3;
          if (r > 224 && g > 224 && b > 224) white++;
          if (bright < 155) dark++;
          if (Math.max(r,g,b) - Math.min(r,g,b) > 42) colored++;
          if (x < 5 || x > 58 || y < 5 || y > 58) {
            edgeOpaque++;
            if (r > 224 && g > 224 && b > 224) edgeWhite++;
          }
        }
      }
      if (!opaque) return;
      const hasWhitePaper = white / opaque > 0.58 &&
        edgeOpaque > 0 && edgeWhite / edgeOpaque > 0.68;
      const hasTransparentBackground = translucent / 4096 > 0.32;
      const isMonochrome = colored / opaque < 0.035;
      const hasDrawing = dark / opaque > 0.004;
      if (isMonochrome && hasDrawing && (hasWhitePaper || hasTransparentBackground)) {
        img.classList.add('diagram-on-dark');
      }
    } catch (err) {
      // Canvas może być niedostępny lub blokowany — pokazujemy oryginał.
      console.debug('Nie sprawdzono tła ilustracji:', err);
    }
  };
  if (img.complete && img.naturalWidth) analyze();
  else img.addEventListener('load', analyze, { once: true });
}

// Obrazy wewnątrz odpowiedzi mogą być małymi plikami (np. 280 × 240 px).
// Powiększamy je najwyżej ~1,9 raza, maksymalnie do 760 px szerokości.
// Samo dopasowanie do ekranu/telefonu i zachowanie proporcji wykonuje CSS.
function setResponsiveImageSize(img) {
  const apply = () => {
    if (!img.naturalWidth || !img.naturalHeight) return;
    const targetWidth = Math.round(Math.min(760, img.naturalWidth * 1.9));
    img.style.setProperty('--content-image-width', `${targetWidth}px`);
    img.classList.add('responsive-image');
  };
  if (img.complete && img.naturalWidth) apply();
  else img.addEventListener('load', apply, { once: true });
}

function lessonDisplayFormat() {
  if (['study', 'flashcards'].includes(state.lesson?.display_format)) return state.lesson.display_format;
  // Starsze pliki bez pola display_format używają formatu działu.
  return state.moduleNode?.module_type === 'study' ? 'study' : 'flashcards';
}

function renderBlocks(container, blocks) {
  for (const block of blocks || []) {
    if (block.type === 'text') {
      const textNode = el('div', block.text, 'block-text');
      // Formatowanie jednego bloku tekstu; stary tekst bez "format" zachowuje style trybu.
      const format = block.format;
      if (format && typeof format === 'object' && !Array.isArray(format)) {
        if (['left','center','right'].includes(format.align)) textNode.style.textAlign = format.align;
        if (format.bold === true) textNode.style.fontWeight = '700';
        if (format.italic === true) textNode.style.fontStyle = 'italic';
        if (format.underline === true) textNode.style.textDecoration = 'underline';
        if (typeof format.color === 'string' && /^#[0-9a-f]{6}$/i.test(format.color))
          textNode.style.color = format.color;
      }
      container.append(textNode);
    } else if (block.type === 'image') {
      const img = el('img'); img.alt = block.alt || 'Ilustracja do fiszki';
      img.src = new URL(block.src, state.lessonUrl).href;
      // Domyślnie zachowujemy dotychczasowy wygląd starszych grafik.
      // W Adminie można wyłączyć filtr osobno dla każdego bloku obrazu.
      // Nowe obrazy mają remove_white_background: false (bez zmian kolorów).
      if (block.remove_white_background !== false) adaptDiagramToDarkTheme(img);
      setResponsiveImageSize(img);
      img.addEventListener('error', () => { img.replaceWith(el('p', `Brak pliku: ${block.src}`, 'muted')); });
      container.append(img);
    } else if (block.type === 'formula') {
      const formula = el('div', null, 'formula');
      // Duże symbole jednostek konwertowanych z v1; reszta wzorów bez zmian.
      if (block.size === 'large' && lessonDisplayFormat() === 'flashcards')
        formula.classList.add('unit-formula-large');
      renderLatex(formula, block.latex);
      container.append(formula);
    }
  }
}
function flashcardCorrect(card) {
  const explicit = card.quiz && card.quiz.correct;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const plain = (card.answer || []).find((block) => block.type === 'text');
  return plain ? plain.text.trim() : '';
}
function buildOptions(card, cards) {
  const correct = flashcardCorrect(card);
  if (!correct) return [];
  const manual = Array.isArray(card.quiz?.distractors) ? card.quiz.distractors : [];
  const others = cards.map(flashcardCorrect);
  const options = [...new Set([...manual, ...shuffled(others)].filter((txt) => typeof txt === 'string' && txt && txt !== correct))].slice(0, 3);
  if (options.length < 3) return [];
  return shuffled([correct, ...options]);
}
// Dla odwróconego ABCD proponujemy oryginalne pytania jako odpowiedzi.
// Dzięki temu działają również zestawy zdjęć, symboli i wzorów.
function questionSignature(card) {
  return JSON.stringify((card.question || []).map(block => {
    if (block.type === 'text') return ['text', block.text];
    if (block.type === 'image') return ['image', block.src];
    if (block.type === 'formula') return ['formula', block.latex];
    return [block.type];
  }));
}
function buildReverseChoices(card, cards) {
  const current = questionSignature(card);
  const unique = new Map();
  for (const candidate of shuffled(cards)) {
    const signature = questionSignature(candidate);
    if (signature !== current && !unique.has(signature)) unique.set(signature, candidate);
  }
  const alternatives = [...unique.values()].slice(0, 3);
  return alternatives.length === 3 ? shuffled([card, ...alternatives]) : [];
}
function questionBlocks(card) {
  return state.reversed && ['self_assess', 'abcd'].includes(state.mode) ? card.answer : card.question;
}
function answerBlocks(card) {
  return state.reversed && ['self_assess', 'abcd'].includes(state.mode) ? card.question : card.answer;
}
function renderCard() {
  state.locked = false;
  const question = $('question-panel'), interaction = $('interaction-panel');
  clear(question); clear(interaction);
  // Nowa karta zaczyna się od góry przewijanego pytania i odpowiedzi.
  question.scrollTop = 0;
  interaction.scrollTop = 0;
  const card = state.round[state.index];
  if (!card) return finishSession();
  renderHeader(); // Odśwież WAŻNE! po każdym przejściu do następnej/poprzedniej karty.
  renderBlocks(question, questionBlocks(card));
  const selfMode = state.mode === 'self_assess' || state.mode === 'review';
  const sideButtons = state.mode === 'self_assess';
  $('wrong-btn').classList.toggle('hidden', !sideButtons);
  $('correct-btn').classList.toggle('hidden', !sideButtons);
  $('workspace').classList.toggle('no-sides', !sideButtons);
  $('workspace').classList.toggle('learn-mode', state.mode === 'learn');
  $('workspace').classList.toggle('self-assess-mode', state.mode === 'self_assess');
  $('workspace').classList.toggle('reversed-mode', state.reversed && state.mode === 'self_assess');
  $('workspace').classList.toggle('review-mode', state.mode === 'review');
  $('workspace').classList.toggle('abcd-mode', state.mode === 'abcd');
  const layout = lessonDisplayFormat();
  $('workspace').classList.toggle('lesson-layout-study', layout === 'study');
  $('workspace').classList.toggle('lesson-layout-flashcards', layout === 'flashcards');
  $('workspace').classList.remove('review-revealed');
  if (selfMode) {
    interaction.append(el('div', 'Kliknij pytanie albo użyj ↑ / ↓, żeby zobaczyć odpowiedź.', 'muted'));
    question.tabIndex = 0; question.setAttribute('role','button'); question.setAttribute('aria-label','Odkryj odpowiedź');
    question.onclick = revealAnswer;
    interaction.onclick = revealAnswer;
  } else {
    question.removeAttribute('tabindex'); question.removeAttribute('role'); question.removeAttribute('aria-label');
    question.onclick = null; interaction.onclick = null;
  }
  if (state.mode === 'abcd') {
    const wrap = el('div', null, 'answer-options');
    if (state.reversed) {
      const choices = buildReverseChoices(card, state.lesson.cards);
      const correctSignature = questionSignature(card);
      choices.forEach((choice, index) => {
        const btn = el('button', null, 'option option-reverse');
        btn.type = 'button';
        const label = el('span', `${'ABCD'[index]}.`, 'choice-letter');
        const content = el('div', null, 'reverse-choice-content');
        renderBlocks(content, choice.question);
        btn.append(label, content);
        const signature = questionSignature(choice);
        btn.addEventListener('click', () => selectChoice(signature, btn, wrap, correctSignature));
        btn.dataset.choiceKey = signature;
        wrap.append(btn);
      });
    } else {
      const choices = buildOptions(card, state.lesson.cards);
      choices.forEach((choice, index) => {
        const btn = el('button', `${'ABCD'[index]}. ${choice}`, 'option');
        btn.type = 'button';
        btn.dataset.choiceKey = choice;
        btn.addEventListener('click', () => selectChoice(choice, btn, wrap));
        wrap.append(btn);
      });
    }
    interaction.append(wrap);
  }
  if (state.mode === 'learn') {
    const answer = el('div', null, 'answer-card');
    renderBlocks(answer, card.answer);
    interaction.append(answer);
  }
  configureFooterActions();
  const total = state.round.length;
  const roundTag = state.roundNumber === 1 ? 'Pierwsza seria' : `Powtórka błędnych (seria ${state.roundNumber})`;
  // Pasek pokazuje numer aktualnie wyświetlanego pytania: 1/N ... N/N.
  setProgress(`${state.mode === 'learn' ? 'Nauka' : roundTag} · ${state.index + 1} / ${total}`, (state.index + 1) / total);
}
function revealAnswer() {
  if (!['self_assess','review'].includes(state.mode) || state.locked || state.finished || !state.round[state.index]) return;
  const panel = $('interaction-panel'); clear(panel);
  if (state.mode === 'review') {
    $('workspace').classList.add('review-revealed');
  }
  // Po odsłonięciu odpowiedzi kliknięcie jej treści nie odrysowuje widoku.
  panel.onclick = null;
  const answer = el('div',null,'answer-card');
  renderBlocks(answer, answerBlocks(state.round[state.index]));
  panel.append(answer);
}
function mark(known) {
  if (state.locked || state.finished || !state.round[state.index] || !['self_assess','review','abcd'].includes(state.mode)) return;
  state.locked=true;
  if (!known) state.missed.push(state.round[state.index]);
  else state.completed++;
  state.index++;
  if (state.index >= state.round.length) {
    if (!state.missed.length) return finishSession();
    state.round = shuffled(state.missed); state.missed=[];state.index=0;state.roundNumber++;
  }
  renderCard();
}
function selectChoice(choice, selected, wrap, correct = flashcardCorrect(state.round[state.index])) {
  if (state.locked) return;
  state.locked = true;
  for (const btn of wrap.children) {
    const label = btn.dataset.choiceKey;
    if (label === correct) btn.classList.add('good');
    if (btn === selected && choice !== correct) btn.classList.add('bad');
    btn.disabled = true;
  }
  state.advanceTimer = setTimeout(() => {
    state.locked = false; state.advanceTimer=null;
    mark(choice === correct);
  }, 650);
}
function finishSession() {
  stopPending();
  state.finished = true;
  hideFooterActions();
  $('workspace').classList.add('no-sides');
  $('workspace').classList.remove('learn-mode', 'review-revealed', 'review-mode', 'self-assess-mode', 'abcd-mode', 'reversed-mode');
  $('wrong-btn').classList.add('hidden'); $('correct-btn').classList.add('hidden');
  const question=$('question-panel'),panel=$('interaction-panel');clear(question);clear(panel);
  question.onclick=null; panel.onclick=null;
  question.removeAttribute('tabindex'); question.removeAttribute('role'); question.removeAttribute('aria-label');
  question.append(el('div','✓','finish-mark'),el('h2',state.mode==='learn'?'Ukończono naukę!':'Wszystkie fiszki zaliczone!'));
  // Po zakończeniu wracamy do listy lekcji w bieżącym folderze, nie do wyboru trybu.
  const back=el('button','Wybór lekcji','primary');back.type='button';back.onclick=goToLessonList;
  panel.append(back);
  setProgress('Zakończono',1);
  renderHeader();
}
function back() {
  stopPending();
  // History API zapewnia identyczną ścieżkę dla przycisku i gestu telefonu.
  if (currentScreen() === 'session' && state.finished) { goToLessonList(); return; }
  if (history.state?.fiszkiV2 && history.state.depth > 0) {
    history.back(); return;
  }
  // Awaryjne cofanie przy zablokowanej historii przeglądarki.
  if (currentScreen() === 'session') {
    if (state.directSession) showMenu();
    else showSetup();
  }
  else if (currentScreen() === 'setup') showMenu();
  else if (state.path.length) { state.path.pop(); showMenu(); }
}
function home() {
  stopPending();
  if (currentScreen() === 'menu' && !state.path.length) return;
  state.path = [];
  showMenu();
  recordRoute('menu');
}
function animate(button) {
  button.classList.add('pressed');setTimeout(()=>button.classList.remove('pressed'),100);
}
document.addEventListener('keydown',(event)=>{
  if ($('session-view').classList.contains('hidden') || state.finished) return;
  const focused = document.activeElement;
  if (['INPUT','TEXTAREA','SELECT'].includes(focused?.tagName)) return;
  if (['self_assess','review'].includes(state.mode)) {
    if (event.key === 'ArrowLeft') {event.preventDefault();animate($(state.mode === 'review' ? 'footer-wrong' : 'wrong-btn'));mark(false);}
    if (event.key === 'ArrowRight') {event.preventDefault();animate($(state.mode === 'review' ? 'footer-correct' : 'correct-btn'));mark(true);}
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {event.preventDefault();revealAnswer();}
  } else if (state.mode === 'abcd') {
    const normalized=event.key.toUpperCase();const i=['1','2','3','4'].indexOf(normalized);
    const letter='ABCD'.indexOf(normalized);
    const idx=i!==-1?i:letter;
    if (idx >= 0) {
      const buttons=$('interaction-panel').querySelectorAll('.option');
      if (buttons[idx] && !buttons[idx].disabled) {event.preventDefault();buttons[idx].click();}
    }
  } else if (state.mode === 'learn') {
    if (event.key==='ArrowLeft' && state.index>0) {event.preventDefault();previousStudyCard();}
    if (event.key==='ArrowRight') {event.preventDefault();nextStudyCard();}
  }
});
$('wrong-btn').addEventListener('click',()=>mark(false));
$('correct-btn').addEventListener('click',()=>mark(true));
$('footer-wrong').addEventListener('click',()=>mark(false));
$('footer-correct').addEventListener('click',()=>mark(true));
$('footer-previous').addEventListener('click',previousStudyCard);
$('footer-next').addEventListener('click',nextStudyCard);
$('reset-btn').addEventListener('click', resetSession);
$('back-btn').addEventListener('click',back);
$('home-btn').addEventListener('click',home);
(async()=>{
  try {
    const resp=await fetch('./data/menu.json',{cache:'no-store'});
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    state.catalog=await resp.json();
    if (history.state?.fiszkiV2) void restoreRoute(history.state);
    else { showMenu(); recordRoute('menu', true); }
  } catch(err) {console.error(err);error(`Nie można odczytać menu.json: ${err.message}. Uruchom aplikację przez serwer HTTP.`);}
})();
