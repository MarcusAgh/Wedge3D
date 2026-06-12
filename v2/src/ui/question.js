import { CATEGORIES } from '../data/loadQuestions.js';

const CAT_META = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

let _timerEl   = null;
let _timerInt  = null;
let _timerSecs = 60;

function startTimer() {
  stopTimer();
  _timerSecs = 60;
  _renderTimer();
  _timerInt = setInterval(() => {
    if (_timerSecs > 0) { _timerSecs--; _renderTimer(); }
    else stopTimer();
  }, 1000);
}

function stopTimer() {
  if (_timerInt !== null) { clearInterval(_timerInt); _timerInt = null; }
}

function _renderTimer() {
  if (!_timerEl) return;
  const m = Math.floor(_timerSecs / 60);
  const s = _timerSecs % 60;
  _timerEl.textContent   = `${m}:${String(s).padStart(2, '0')}`;
  _timerEl.style.color   = _timerSecs <= 10 ? 'var(--ent)' : 'var(--muted)';
  _timerEl.style.display = 'block';
}

export function initQuestion({ onCorrect, onMissed, onFinalCorrect, onFinalMissed }) {
  const overlayQ      = document.getElementById('overlay-question');
  const qcardWrap     = document.getElementById('qcardWrap');
  const qcard3d       = document.getElementById('qcard3d');
  const qcardFront    = document.getElementById('qcardFront');
  const qcardBack     = document.getElementById('qcardBack');
  const qcardHeader   = document.getElementById('qcardHeader');
  const qcardHeaderB  = document.getElementById('qcardHeaderBack');
  const qcardCatName  = document.getElementById('qcardCatName');
  const qcardCatNameB = document.getElementById('qcardCatNameBack');
  const qcardText     = document.getElementById('qcardQuestion');
  const qcardAnsText  = document.getElementById('qcardAnswerText');
  const qcardActions  = document.getElementById('qcardActions');

  _timerEl = document.getElementById('roundTimer');

  const overlayCat = document.getElementById('overlay-catpick');
  const catGrid    = document.getElementById('catpickGrid');

  let _flipped = false;

  // Front → flip to back
  qcardFront.addEventListener('click', () => {
    if (_flipped) return;
    _flipped = true;
    qcard3d.classList.add('qcard-3d--flipped');
    stopTimer();
    if (_timerEl) _timerEl.style.display = 'none';
  });

  // Back header → flip back to front (buttons stop propagation)
  qcardHeaderB.addEventListener('click', () => {
    if (!_flipped) return;
    _flipped = false;
    qcard3d.classList.remove('qcard-3d--flipped');
  });

  function showQuestion({ question, space, team, isFinal }) {
    const cat   = CAT_META[question.category];
    const color = cat?.color ?? '#888';
    const name  = cat?.name  ?? question.category;

    // Reset flip — replay entrance animation
    _flipped = false;
    qcard3d.classList.remove('qcard-3d--flipped');
    qcardWrap.style.animation = 'none';
    qcardWrap.offsetHeight;
    qcardWrap.style.animation = '';

    // Front header
    qcardHeader.style.background = color;
    qcardCatName.textContent     = name;

    // Back header
    qcardHeaderB.style.background = color;
    qcardCatNameB.textContent     = name;

    // Question
    qcardText.textContent = question.question;

    // Answer
    qcardAnsText.textContent = question.answer;

    // Scoring buttons — stop propagation so clicking them doesn't trigger header flip-back
    const correctLabel = isFinal
      ? 'Correct — we win!'
      : (space?.isHQ ? 'Correct — claim wedge' : 'Correct — roll again');

    qcardActions.innerHTML = `
      <button class="qcard-btn qcard-btn--miss"    id="qBtnMissed">Missed it</button>
      <button class="qcard-btn qcard-btn--correct" id="qBtnCorrect">${correctLabel}</button>
    `;
    document.getElementById('qBtnCorrect').addEventListener('click', e => {
      e.stopPropagation(); hide(); isFinal ? onFinalCorrect() : onCorrect();
    });
    document.getElementById('qBtnMissed').addEventListener('click', e => {
      e.stopPropagation(); hide(); isFinal ? onFinalMissed() : onMissed();
    });

    overlayQ.style.display = 'flex';
    startTimer();
  }

  function hide() {
    stopTimer();
    if (_timerEl) _timerEl.style.display = 'none';
    qcardWrap.style.animation = 'cardExit .3s cubic-bezier(.4,0,1,1) both';
    setTimeout(() => {
      overlayQ.style.display    = 'none';
      qcardWrap.style.animation = '';
    }, 320);
  }

  function showCategoryPicker(onChoice) {
    catGrid.innerHTML = '';
    CATEGORIES.forEach(cat => {
      const btn = document.createElement('button');
      btn.className   = 'catpick-btn';
      btn.textContent = cat.name;
      btn.style.background = cat.color;
      btn.onclick = () => { overlayCat.style.display = 'none'; onChoice(cat.key); };
      catGrid.appendChild(btn);
    });
    overlayCat.style.display = 'flex';
  }

  return { showQuestion, hide, showCategoryPicker };
}
