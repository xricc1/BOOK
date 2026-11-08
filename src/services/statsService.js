// Library statistics computed from the saved books.
import { isLent, daysOverdue } from './loanService';

const MONTHS = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];

const toNumber = (v) => {
  const n = parseInt(String(v || '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};

/** "Zdeněk Jirotka, Ondřej Sekora" -> two authors; "Rowling, J. K." stays one. */
export function splitAuthors(value) {
  const parts = String(value || '').split(/\s*[,;]\s*/).filter(Boolean);
  const out = [];
  parts.forEach(p => {
    if (out.length && /^([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-z]?\.\s*)+$/.test(p)) out[out.length - 1] += `, ${p}`;
    else out.push(p);
  });
  // Drop life dates ("1965-") and unknown authors
  return out.map(a => a.trim()).filter(a => /[A-Za-zÀ-ž]{2}/.test(a) && !/^neznámý/i.test(a));
}

export function knihLabel(n) {
  if (n === 1) return '1 kniha';
  if (n >= 2 && n <= 4) return `${n} knihy`;
  return `${n} knih`;
}

/** Count values and return the top entries, with the rest folded into "Ostatní". */
function topCounts(values, limit) {
  const map = new Map();
  values.forEach(v => { if (v) map.set(v, (map.get(v) || 0) + 1); });
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'cs'));
  if (sorted.length <= limit) return sorted;
  const rest = sorted.slice(limit - 1).reduce((s, [, c]) => s + c, 0);
  return [...sorted.slice(0, limit - 1), ['Ostatní', rest]];
}

export function computeStats(books, now = new Date()) {
  const pages = books.map(b => toNumber(b.pageCount)).filter(n => n && n < 10000);
  const years = books.map(b => toNumber(b.publishYear)).filter(n => n && n > 1400 && n <= now.getFullYear() + 1);
  const authors = books.flatMap(b => splitAuthors(b.author));

  // Books added in each of the last 12 months
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()], year: d.getFullYear(), count: 0 });
  }
  books.forEach(b => {
    if (!b.addedAt) return;
    const d = new Date(b.addedAt);
    const m = months.find(x => x.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (m) m.count++;
  });

  // Publication decades
  const decadeMap = new Map();
  years.forEach(y => { const d = Math.floor(y / 10) * 10; decadeMap.set(d, (decadeMap.get(d) || 0) + 1); });
  const decades = [...decadeMap.entries()].sort((a, b) => a[0] - b[0]);

  const thickest = books.reduce((best, b) => {
    const p = toNumber(b.pageCount);
    return p && p < 10000 && (!best || p > toNumber(best.pageCount)) ? b : best;
  }, null);
  const oldest = books.reduce((best, b) => {
    const y = toNumber(b.publishYear);
    return y && y > 1400 && (!best || y < toNumber(best.publishYear)) ? b : best;
  }, null);

  const lent = books.filter(isLent).sort((a, b) => daysOverdue(b, now) - daysOverdue(a, now));

  return {
    total: books.length,
    pages: pages.reduce((s, n) => s + n, 0),
    authorCount: new Set(authors.map(a => a.toLowerCase())).size,
    genres: topCounts(books.map(b => String(b.genre || '').trim() || 'Bez žánru'), 8),
    authors: topCounts(authors, Infinity).filter(([, c]) => c > 1).slice(0, 5),
    months,
    decades,
    thickest,
    oldest,
    lent,
    overdue: lent.filter(b => daysOverdue(b, now) > 0).length,
  };
}
