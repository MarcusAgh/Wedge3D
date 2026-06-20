import * as XLSX from 'xlsx';

/* ----------------------------------------------------------------
   Category normalization: maps all known spellings → canonical key
   ---------------------------------------------------------------- */
const CATEGORY_MAP = {
  'geography':         'geo',
  'entertainment':     'ent',
  'history':           'his',
  'art & literature':  'art',
  'arts & literature': 'art',   // spelling used in the workbook
  'science & nature':  'sci',
  'sports & leisure':  'spo',
};

/* Sheet name → edition label */
const SHEET_TO_EDITION = {
  'Easy':      'Family',
  'Medium':    'Classic',
  'Difficult': 'Master',
};

export const CATEGORIES = [
  { key: 'geo', name: 'Geography',        color: '#2F73C9' },
  { key: 'ent', name: 'Entertainment',    color: '#D94E8A' },
  { key: 'his', name: 'History',          color: '#E8B11F' },
  { key: 'art', name: 'Art & Literature', color: '#8254C0' },
  { key: 'sci', name: 'Science & Nature', color: '#2EA15C' },
  { key: 'spo', name: 'Sports & Leisure', color: '#E2772E' },
];

function normalizeCategory(raw) {
  if (typeof raw !== 'string') return null;
  return CATEGORY_MAP[raw.trim().toLowerCase()] ?? null;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Parse one sheet into grouped question pools.
 * Returns { geo: [...], ent: [...], ... } — each array shuffled.
 */
function parseSheet(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) {
    const available = workbook.SheetNames.join(', ');
    throw new Error(`Sheet "${sheetName}" not found. Available sheets: [${available}]`);
  }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Build grouped, de-duped lists
  const grouped = { geo: [], ent: [], his: [], art: [], sci: [], spo: [] };
  const seen = new Set();
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {           // skip header row
    const [, rawCat, rawQ, rawA] = rows[i];

    const question = String(rawQ ?? '').trim();
    const answer   = String(rawA ?? '').trim();
    if (!question || !answer) continue;              // skip empty rows

    const key = normalizeCategory(rawCat);
    if (!key) {
      console.warn(`[questions] Row ${i + 1}: unknown category "${rawCat}" — skipped`);
      skipped++;
      continue;
    }

    if (seen.has(question)) continue;               // de-dupe by question text
    seen.add(question);

    grouped[key].push({ category: key, question, answer });
  }

  if (skipped > 0) console.warn(`[questions] ${sheetName}: ${skipped} rows skipped (unknown category)`);

  // Shuffle each pool once at load time
  for (const key of Object.keys(grouped)) grouped[key] = shuffle(grouped[key]);

  return grouped;
}

/**
 * Load /public/questions.xlsx and return all three editions.
 *
 * Returns:
 *   {
 *     Family:   { geo: [...], ent: [...], ... },
 *     Classic:  { ... },
 *     Master:   { ... },
 *   }
 */
export async function loadQuestions() {
  const res = await fetch('/questions.xlsx');
  if (!res.ok) throw new Error(`Failed to fetch questions.xlsx: ${res.status}`);

  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });

  const editions = {};
  for (const [sheetName, editionLabel] of Object.entries(SHEET_TO_EDITION)) {
    try {
      editions[editionLabel] = parseSheet(wb, sheetName);
    } catch (e) {
      console.warn(`[questions] Skipping edition "${editionLabel}": ${e.message}`);
    }
  }
  if (Object.keys(editions).length === 0) {
    throw new Error(`No sheets matched. File has: [${wb.SheetNames.join(', ')}]. Expected: [${Object.keys(SHEET_TO_EDITION).join(', ')}]`);
  }

  // Sanity-check log — counts per edition × category
  console.group('[Wedge] Question bank loaded');
  for (const [edition, groups] of Object.entries(editions)) {
    const totals = CATEGORIES.map(c => `${c.name}: ${groups[c.key].length}`).join(' | ');
    console.log(`${edition}  →  ${totals}`);
  }
  console.groupEnd();

  return editions;
}

/**
 * Returns a pool manager for a given edition's groups.
 * pool.draw(key) → next { category, question, answer }, cycling after exhaustion.
 */
export function createPoolManager(groups) {
  const state = {};
  for (const key of Object.keys(groups)) {
    state[key] = { list: [...groups[key]], idx: 0 };
  }

  return {
    draw(key) {
      const s = state[key];
      if (s.idx >= s.list.length) {
        s.list = shuffle(s.list);
        s.idx = 0;
      }
      return s.list[s.idx++];
    },
  };
}
