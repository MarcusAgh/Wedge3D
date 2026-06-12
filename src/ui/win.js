import { pieSVG } from '../game/state.js';

export function initWin({ onNewGame }) {
  const overlay = document.getElementById('overlay-win');
  const winPie  = document.getElementById('winPie');
  const winName = document.getElementById('winName');
  const newGameBtn = document.getElementById('newGameBtn');

  newGameBtn.onclick = () => {
    stopConfetti();
    overlay.style.display = 'none';
    onNewGame();
  };

  function show(team) {
    winName.textContent = team.name;
    winPie.innerHTML = pieSVG(team.wedges, 140);
    overlay.style.display = 'flex';
    burstConfetti();
  }

  return { show };
}

/* ---- Confetti (carried over from the 2D prototype) ---- */
const cv  = document.getElementById('confetti-canvas');
const ctx = cv.getContext('2d');
let parts = [], anim = null;
const COLORS = ['#2F73C9','#D94E8A','#E8B11F','#8254C0','#2EA15C','#E2772E','#C9A35B'];

function sizeCanvas() { cv.width = innerWidth; cv.height = innerHeight; }
addEventListener('resize', sizeCanvas);
sizeCanvas();

function burstConfetti() {
  sizeCanvas(); parts = [];
  for (let i = 0; i < 130; i++) {
    parts.push({
      x: innerWidth / 2 + (Math.random() - .5) * 160,
      y: innerHeight * 0.35,
      vx: (Math.random() - .5) * 10,
      vy: Math.random() * -12 - 4,
      g: 0.28 + Math.random() * 0.14,
      s: 5 + Math.random() * 7,
      rot: Math.random() * 6.28,
      vr: (Math.random() - .5) * 0.3,
      col: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: 0,
    });
  }
  if (!anim) loopConfetti();
}

function loopConfetti() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  let alive = false;
  parts.forEach(p => {
    p.life++; p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    if (p.y < cv.height + 40 && p.life < 270) {
      alive = true;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - p.life / 270);
      ctx.fillStyle = p.col;
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
      ctx.restore();
    }
  });
  if (alive) { anim = requestAnimationFrame(loopConfetti); }
  else { stopConfetti(); }
}

function stopConfetti() {
  if (anim) { cancelAnimationFrame(anim); anim = null; }
  ctx.clearRect(0, 0, cv.width, cv.height);
}
