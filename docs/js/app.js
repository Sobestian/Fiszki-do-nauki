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
function showScreen(screen) {
  ['menu-view', 'setup-view', 'session-view'].forEach((id) => {
    $(id).classList.toggle('hidden', id !== screen);
  });
  $('error-box').classList.add('hidden');
  $('reset-btn').classList.toggle('hidden', screen !== 'session-view');
  if (screen !== 'session-view') hideFooterActions();
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
  $('mode-caption').textContent = state.mode && inSession ? MODES[state.mode] : '';
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
function showMenu() {
  stopPending();
  state.lessonNode = null;
  state.lesson = null;
  state.mode = null;
  state.moduleNode = state.path.find((node) => node.kind === 'module') || null;
  const items = state.path.length ? state.path[state.path.length - 1].children : state.catalog.items;
  const container = $('menu-view');
  clear(container);
  const grid = el('div', null, 'menu-grid');
  for (const node of items) {
    const btn = el('button', null, 'menu-tile');
    btn.type = 'button';
    btn.append(el('strong', node.title), el('span', node.kind === 'module' ? 'Otwórz dział' : node.kind === 'folder' ? 'Otwórz kategorię' : 'Wybierz tryb nauki'));
    btn.addEventListener('click', () => {
      if (node.kind === 'lesson') {
        state.lessonNode = node;
        showSetup();
      } else {
        state.path.push(node);
        showMenu();
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
  const preferred = moduleNode.modes.includes(state.modePreferences[moduleNode.id])
    ? state.modePreferences[moduleNode.id] : moduleNode.modes[0];
  for (const [i, mode] of moduleNode.modes.entries()) {
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
  const start = el('button', 'Rozpocznij', 'primary');
  start.type = 'submit';
  form.append(modes, start);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const mode = form.elements.mode.value;
    if (!moduleNode.modes.includes(mode)) return;
    rememberMode(moduleNode.id, mode);
    await startSession(mode);
  });
  card.append(form); container.append(card);
  showScreen('setup-view'); setProgress('Wybór trybu', 0); renderHeader();
}
async function startSession(mode) {
  stopPending();
  try {
    const lessonUrl = new URL(`./data/${state.lessonNode.file}`, document.baseURI);
    const result = await fetch(lessonUrl, {cache: 'no-store'});
    if (!result.ok) throw new Error(`HTTP ${result.status}`);
    const lesson = await result.json();
    if (!Array.isArray(lesson.cards) || !lesson.cards.length) throw new Error('Lekcja jest pusta.');
    if (mode === 'abcd') {
      for (const card of lesson.cards) {
        if (buildOptions(card, lesson.cards).length !== 4) {
          throw new Error('Tryb ABCD wymaga czterech różnych odpowiedzi dla każdej karty. Uzupełnij quiz.distractors lub dodaj więcej kart.');
        }
      }
    }
    state.lesson = lesson; state.lessonUrl = lessonUrl; state.mode = mode;
    resetSession();
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

function renderBlocks(container, blocks) {
  for (const block of blocks || []) {
    if (block.type === 'text') {
      container.append(el('div', block.text, 'block-text'));
    } else if (block.type === 'image') {
      const img = el('img'); img.alt = block.alt || 'Ilustracja do fiszki';
      img.src = new URL(block.src, state.lessonUrl).href;
      adaptDiagramToDarkTheme(img);
      setResponsiveImageSize(img);
      img.addEventListener('error', () => { img.replaceWith(el('p', `Brak pliku: ${block.src}`, 'muted')); });
      container.append(img);
    } else if (block.type === 'formula') {
      const formula = el('div', null, 'formula');
      // Duże symbole jednostek konwertowanych z v1; reszta wzorów bez zmian.
      if (block.size === 'large') formula.classList.add('unit-formula-large');
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
  renderBlocks(question, card.question);
  const selfMode = state.mode === 'self_assess' || state.mode === 'review';
  const sideButtons = state.mode === 'self_assess';
  $('wrong-btn').classList.toggle('hidden', !sideButtons);
  $('correct-btn').classList.toggle('hidden', !sideButtons);
  $('workspace').classList.toggle('no-sides', !sideButtons);
  $('workspace').classList.toggle('learn-mode', state.mode === 'learn');
  $('workspace').classList.toggle('self-assess-mode', state.mode === 'self_assess');
  $('workspace').classList.toggle('review-mode', state.mode === 'review');
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
    const choices = buildOptions(card, state.lesson.cards);
    const wrap = el('div', null, 'answer-options');
    choices.forEach((choice, index) => {
      const btn = el('button', `${'ABCD'[index]}. ${choice}`, 'option');
      btn.type = 'button';
      btn.addEventListener('click', () => selectChoice(choice, btn, wrap));
      wrap.append(btn);
    });
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
  renderBlocks(answer,state.round[state.index].answer);
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
function selectChoice(choice, selected, wrap) {
  if (state.locked) return;
  state.locked = true;
  const correct = flashcardCorrect(state.round[state.index]);
  for (const btn of wrap.children) {
    const label = btn.textContent.substring(3);
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
  $('workspace').classList.remove('learn-mode', 'review-revealed', 'review-mode', 'self-assess-mode');
  $('wrong-btn').classList.add('hidden'); $('correct-btn').classList.add('hidden');
  const question=$('question-panel'),panel=$('interaction-panel');clear(question);clear(panel);
  question.onclick=null; panel.onclick=null;
  question.removeAttribute('tabindex'); question.removeAttribute('role'); question.removeAttribute('aria-label');
  question.append(el('div','✓','finish-mark'),el('h2',state.mode==='learn'?'Ukończono naukę!':'Wszystkie fiszki zaliczone!'));
  // Po zakończeniu wracamy do listy lekcji w bieżącym folderze, nie do wyboru trybu.
  const back=el('button','Wybór lekcji','primary');back.type='button';back.onclick=showMenu;
  panel.append(back);
  setProgress('Zakończono',1);
  renderHeader();
}
function back() {
  stopPending();
  if (!$('session-view').classList.contains('hidden')) {
    // W zakończonej sesji także przycisk Wstecz prowadzi do listy lekcji.
    if (state.finished) showMenu();
    else showSetup();
    return;
  }
  if (!$('setup-view').classList.contains('hidden')) {showMenu();return;}
  if (state.path.length) {state.path.pop();showMenu();}
}
function home() {stopPending();state.path=[];showMenu();}
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
    showMenu();
  } catch(err) {console.error(err);error(`Nie można odczytać menu.json: ${err.message}. Uruchom aplikację przez serwer HTTP.`);}
})();
