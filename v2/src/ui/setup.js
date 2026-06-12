// The 6 board category colors — only these are valid pawn colors
const BOARD_COLORS = [
  '#2F73C9', // Geography   — blue
  '#D94E8A', // Entertainment — pink
  '#E8B11F', // History     — yellow
  '#8254C0', // Art & Lit   — purple
  '#2EA15C', // Science     — green
  '#E2772E', // Sports      — orange
];

export function initSetup({ onStart }) {
  let numTeams = 3;
  const names  = [];
  const colors = [...BOARD_COLORS];
  let selectedEdition   = 'Easy';
  let selectedBoardMode = 'medium';

  const teamCountEl = document.getElementById('teamCount');
  const nameList    = document.getElementById('nameList');
  const startBtn    = document.getElementById('startBtn');
  const loadStatus  = document.getElementById('loadStatus');

  // Edition picker
  document.getElementById('editionGrid').addEventListener('click', e => {
    const btn = e.target.closest('.edition-btn');
    if (!btn) return;
    document.querySelectorAll('#editionGrid .edition-btn').forEach(b => b.classList.remove('edition-btn--active'));
    btn.classList.add('edition-btn--active');
    selectedEdition = btn.dataset.edition;
  });

  // Board length picker
  document.getElementById('boardGrid').addEventListener('click', e => {
    const btn = e.target.closest('.edition-btn');
    if (!btn) return;
    document.querySelectorAll('#boardGrid .edition-btn').forEach(b => b.classList.remove('edition-btn--active'));
    btn.classList.add('edition-btn--active');
    selectedBoardMode = btn.dataset.board;
  });

  // Team stepper
  document.getElementById('teamMinus').onclick = () => {
    if (numTeams > 2) { numTeams--; teamCountEl.textContent = numTeams; renderNames(); }
  };
  document.getElementById('teamPlus').onclick = () => {
    if (numTeams < 6) { numTeams++; teamCountEl.textContent = numTeams; renderNames(); }
  };

  function closeAllPickers() {
    nameList.querySelectorAll('.color-options').forEach(el => el.classList.add('color-options--hidden'));
  }

  function renderNames() {
    nameList.innerHTML = '';
    for (let i = 0; i < numTeams; i++) {
      const row = document.createElement('div');
      row.className = 'name-row';

      const inp = document.createElement('input');
      inp.type = 'text';
      inp.placeholder = `Team ${i + 1}`;
      inp.value = names[i] || '';
      inp.addEventListener('input', e => { names[i] = e.target.value; });

      // Wrapper so the floating popup is positioned relative to the dot
      const wrap = document.createElement('div');
      wrap.className = 'color-picker-wrap';

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'color-trigger';
      trigger.style.background = colors[i];

      const popup = document.createElement('div');
      popup.className = 'color-options color-options--hidden';

      const dots = [];
      BOARD_COLORS.forEach(hex => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot._hex = hex;
        dot.className = 'color-option' + (colors[i] === hex ? ' color-option--active' : '');
        dot.style.background = hex;
        dot.addEventListener('click', e => {
          e.stopPropagation();
          if (dot.disabled) return;
          colors[i] = hex;
          trigger.style.background = hex;
          popup.querySelectorAll('.color-option').forEach(d => d.classList.remove('color-option--active'));
          dot.classList.add('color-option--active');
          popup.classList.add('color-options--hidden');
        });
        popup.appendChild(dot);
        dots.push(dot);
      });

      trigger.addEventListener('click', e => {
        e.stopPropagation();
        const wasOpen = !popup.classList.contains('color-options--hidden');
        closeAllPickers();
        if (!wasOpen) {
          // Mark colors taken by other active teams as disabled
          dots.forEach(dot => {
            const taken = colors.some((c, j) => j !== i && j < numTeams && c === dot._hex);
            dot.disabled = taken;
            dot.classList.toggle('color-option--taken', taken);
          });
          const r = trigger.getBoundingClientRect();
          popup.style.top  = `${r.top + r.height / 2}px`;
          popup.style.left = '';
          popup.style.right = `${window.innerWidth - r.left + 8}px`;
          popup.style.transform = 'translateY(-50%)';
          popup.classList.remove('color-options--hidden');
        }
      });

      wrap.appendChild(trigger);
      wrap.appendChild(popup);
      row.appendChild(inp);
      row.appendChild(wrap);
      nameList.appendChild(row);
    }
  }

  // Close all pickers when clicking outside
  document.addEventListener('click', closeAllPickers);
  renderNames();

  startBtn.onclick = () => {
    const teams = [];
    for (let i = 0; i < numTeams; i++) {
      teams.push({
        name:  (names[i] || `Team ${i + 1}`).trim() || `Team ${i + 1}`,
        color: colors[i],
      });
    }
    onStart({ teams, edition: selectedEdition, boardMode: selectedBoardMode });
  };

  return {
    setLoadStatus(msg, ok = false) {
      loadStatus.textContent = msg;
      loadStatus.style.color = ok ? 'var(--sci)' : 'var(--muted-2)';
      startBtn.disabled = !ok;
    },
    hide() {
      document.getElementById('overlay-setup').style.display = 'none';
    },
  };
}
