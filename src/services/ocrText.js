// Turning raw OCR text from a book spine or cover into catalog search queries.
// Pure functions (no browser APIs), so they are easy to test.

const LETTER = /[A-Za-zÀ-ž]/;
const WORD = /^[A-Za-zÀ-ž][A-Za-zÀ-ž'’.-]*$/;
// Words that are on many spines but say nothing about the book
const NOISE = new Set(['a', 'i', 'v', 've', 'na', 'se', 'z', 'ze', 'o', 'u', 'k', 'do', 'the', 'and', 'of', 'román', 'roman', 'kniha', 'vydání', 'nakladatelství']);

/** Words OCR read with reasonable certainty: letters only, at least 2 characters. */
export function cleanWords(text) {
  return String(text || '')
    .replace(/[|_~^*#=<>{}[\]\\/"“”„»«]+/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/^[^A-Za-zÀ-ž]+|[^A-Za-zÀ-ž.]+$/g, '').replace(/\.$/, ''))
    .filter(w => w.length >= 2 && WORD.test(w))
    .filter(w => {
      const letters = [...w].filter(ch => LETTER.test(ch)).length;
      return letters / w.length > 0.8;
    })
    // OCR noise often looks like "lIlI" or random case changes: keep normal-looking words
    .filter(w => !/[a-zà-ž][A-ZÀ-Ž].*[a-zà-ž][A-ZÀ-Ž]/.test(w))
    .filter(w => !NOISE.has(w.toLowerCase()));
}

/** How much usable text a recognition result contains (used to pick the right rotation). */
export function textScore(text, confidence) {
  const words = cleanWords(text);
  const letters = words.reduce((s, w) => s + w.length, 0);
  const longWords = words.filter(w => w.length >= 4).length;
  return letters * (Math.max(confidence, 1) / 100) + longWords * 3;
}

/** Pick the best of several recognitions of the same photo in different rotations. */
export function pickBest(results) {
  return results.reduce((best, r) => {
    const score = textScore(r.text, r.confidence);
    return !best || score > best.score ? { ...r, score } : best;
  }, null);
}

const titleCase = (w) => (w === w.toUpperCase() && w.length > 1 ? w.charAt(0) + w.slice(1).toLowerCase() : w);

/** The text shown to the user (and editable): cleaned words in reading order. */
export function readableQuery(text, maxWords = 8) {
  const seen = new Set();
  return cleanWords(text)
    .filter(w => {
      const k = w.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, maxWords)
    .map(titleCase)
    .join(' ');
}

const fold = (w) => String(w).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/**
 * Does a catalog record (its title and authors) contain at least one of the important words?
 * Tolerates OCR mistakes: "Aturnin" matches "Saturnin", "Exupéy" matches "Exupéry".
 */
export function makeMatcher(words) {
  const important = words.map(fold).filter(w => w.length >= 4);
  return (recordText) => {
    if (!important.length) return true;
    const tokens = fold(recordText).split(/[^a-z0-9]+/).filter(t => t.length >= 3);
    return important.some(w => tokens.some(t => t.includes(w) || w.includes(t) && t.length >= 5 ||
      editDistance(w, t) <= (w.length > 6 ? 2 : 1)));
  };
}

/**
 * Queries from the most exact to the most forgiving. The catalog's "~" makes a word
 * fuzzy, so OCR mistakes like "Aturnin" still find "Saturnin" (it is slower, so it comes later).
 * Returns [{ text, matches }].
 */
export function buildQueries(query) {
  const words = String(query || '').split(/[\s-]+/).map(w => w.replace(/[^A-Za-zÀ-ž0-9]/g, '')).filter(w => w.length >= 2);
  if (!words.length) return [];
  const longest = [...words].filter(w => w.length >= 3).sort((a, b) => b.length - a.length);
  const keepOrder = (list) => words.filter(w => list.includes(w));
  const fuzzy = (list) => list.map(w => (w.length >= 4 ? `${w}~` : w)).join(' ');

  const variants = [
    { text: words.join(' '), words },
    { text: fuzzy(keepOrder(longest.slice(0, 3))), words: keepOrder(longest.slice(0, 3)) },
    { text: fuzzy(keepOrder(longest.slice(0, 2))), words: keepOrder(longest.slice(0, 2)) },
  ];
  const seen = new Set();
  return variants
    .filter(v => v.words.length && !seen.has(v.text) && seen.add(v.text))
    .map(v => ({ text: v.text, matches: makeMatcher(v.words) }));
}
