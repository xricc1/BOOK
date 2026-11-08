// Lending books to friends: who has the book, since when, and when it should come back.

export const DEFAULT_LOAN_DAYS = 30;

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(days, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isLent(book) {
  return Boolean(book?.loan?.to);
}

/** Days past the agreed return date (0 when not late or no date was set). */
export function daysOverdue(book, now = new Date()) {
  const due = book?.loan?.due;
  if (!isLent(book) || !due) return 0;
  const end = new Date(`${due}T23:59:59`);
  return now > end ? Math.ceil((now - end) / (24 * 60 * 60 * 1000)) : 0;
}

export function isOverdue(book, now = new Date()) {
  return daysOverdue(book, now) > 0;
}

export function lendBook(book, { to, due }) {
  return {
    ...book,
    loan: { to: String(to).trim(), since: todayIso(), due: due || '' },
  };
}

export function returnBook(book) {
  if (!isLent(book)) return book;
  const { loan, ...rest } = book;
  const history = [{ ...loan, returned: todayIso() }, ...(book.loanHistory || [])].slice(0, 20);
  return { ...rest, loanHistory: history };
}

/** 1. 11. 2026 */
export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d}. ${m}. ${y}`;
}

/** Names already used for loans, newest first (for quick picking). */
export function knownBorrowers(books) {
  const names = [];
  const add = (n) => {
    const name = String(n || '').trim();
    if (name && !names.some(x => x.toLowerCase() === name.toLowerCase())) names.push(name);
  };
  books.forEach(b => add(b.loan?.to));
  books.forEach(b => (b.loanHistory || []).forEach(h => add(h.to)));
  return names;
}
