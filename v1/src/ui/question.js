import { CATEGORIES } from '../data/loadQuestions.js';

const CAT_META = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

export function initQuestion({ onCorrect, onMissed, onFinalCorrect, onFinalMissed, onFinalCategoryChosen }) {
  const overlayQ     = document.getElementById('overlay-question');
  const qcard        = document.getElementById('qcard');
  const qcardBar     = document.getElementById('qcardBar');
  const qcardSwatch  = document.getElementById('qcardSwatch');
  const qcardCatName = document.getElementById('qcardCatName');
  const qcardText    = document.getElementById('qcardQuestion');
  const qcardAnswer  = document.getElementById('qcardAnswer');
  const qcardAnsText = document.getElementById('qcardAnswerText');
  const qcardActions = document.getElementById('qcardActions');
  const qcardFeed    = document.getElementById('qcardFeedback');
  const revealBtn    = document.getElementById('revealBtn');

  const overlayCat   = document.getElementById('overlay-catpick');
  const catGrid      = document.getElementById('catpickGrid');

  function showQuestion({ question, space, team, isFinal }) {
    const cat = CAT_META[question.category];
    const color = cat?.color ?? '#888';

    qcardBar.style.background = color;
    qcardSwatch.style.background = color;
    qcardCatName.textContent = cat?.name ?? question.category;
    qcardText.textContent = question.question;
    qcardAnsText.textContent = question.answer;
    qcardAnswer.classList.remove('qcard-answer--visible');
    qcardFeed.innerHTML = '';

    qcardActions.innerHTML = '';
    const reveal = document.createElement('button');
    reveal.className = 'btn btn--reveal';
    reveal.textContent = 'Reveal answer';
    reveal.onclick = () => {
      qcardAnswer.classList.add('qcard-answer--visible');
      qcardAnsText.style.color = color;
      qcardActions.innerHTML = `
        <button class="btn btn--correct" id="qBtnCorrect">${isFinal ? 'Correct — we win!' : (space?.isHQ ? 'Correct — claim wedge' : 'Correct — roll again')}</button>
        <button class="btn btn--miss"    id="qBtnMissed">Missed it</button>
      `;
      document.getElementById('qBtnCorrect').onclick = () => {
        hide();
        isFinal ? onFinalCorrect() : onCorrect();
      };
      document.getElementById('qBtnMissed').onclick = () => {
        hide();
        isFinal ? onFinalMissed() : onMissed();
      };
    };
    qcardActions.appendChild(reveal);

    overlayQ.style.display = 'flex';
    requestAnimationFrame(() => qcard.classList.add('qcard--visible'));
  }

  function hide() {
    qcard.classList.remove('qcard--visible');
    setTimeout(() => { overlayQ.style.display = 'none'; }, 350);
  }

  function showCategoryPicker(onChoice) {
    catGrid.innerHTML = '';
    CATEGORIES.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'catpick-btn';
      btn.textContent = cat.name;
      btn.style.background = cat.color;
      btn.onclick = () => {
        overlayCat.style.display = 'none';
        onChoice(cat.key);
      };
      catGrid.appendChild(btn);
    });
    overlayCat.style.display = 'flex';
  }

  return { showQuestion, hide, showCategoryPicker };
}
