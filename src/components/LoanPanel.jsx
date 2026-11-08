import React, { useState } from 'react';
import { HandHelping, Undo2, CalendarClock, History, TriangleAlert } from 'lucide-react';
import {
  isLent, daysOverdue, lendBook, returnBook, formatDate, addDaysIso, todayIso, knownBorrowers, DEFAULT_LOAN_DAYS,
} from '../services/loanService';

function dnyLabel(n) {
  if (n === 1) return '1 den';
  if (n >= 2 && n <= 4) return `${n} dny`;
  return `${n} dní`;
}

/**
 * Lending section of the book detail: lend the book to someone, mark it returned,
 * and see who had it before. onChange receives the updated book.
 */
export function LoanPanel({ book, books, onChange }) {
  const [formOpen, setFormOpen] = useState(false);
  const [to, setTo] = useState('');
  const [due, setDue] = useState(() => addDaysIso(DEFAULT_LOAN_DAYS));
  const borrowers = knownBorrowers(books).slice(0, 6);
  const late = daysOverdue(book);
  const history = book.loanHistory || [];

  const submit = (e) => {
    e.preventDefault();
    if (!to.trim()) return;
    onChange(lendBook(book, { to, due }));
    setFormOpen(false);
    setTo('');
  };

  return (
    <div className="border-t border-black-border pt-3.5 space-y-2.5">
      <h4 className="text-[11px] font-mono uppercase text-wine-400">Půjčování</h4>

      {isLent(book) ? (
        <div className={`rounded-xl border p-3 space-y-2.5 ${late ? 'bg-red-950/40 border-red-900/70' : 'bg-amber-950/30 border-amber-800/60'}`}>
          <div className="flex items-start gap-2.5">
            <HandHelping size={18} className={late ? 'text-red-400 mt-0.5' : 'text-amber-400 mt-0.5'} />
            <div className="text-xs sm:text-sm">
              <p className="text-white font-semibold">Půjčeno: {book.loan.to}</p>
              <p className="text-zinc-400 text-xs">
                od {formatDate(book.loan.since)}
                {book.loan.due && <> · vrátit do {formatDate(book.loan.due)}</>}
              </p>
              {late > 0 && (
                <p className="text-red-300 text-xs font-medium mt-1 flex items-center gap-1">
                  <TriangleAlert size={12} /> Po termínu {dnyLabel(late)}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => onChange(returnBook(book))}
            className="w-full bg-emerald-800 hover:bg-emerald-700 text-white font-medium py-2.5 rounded-xl transition flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer touch-manipulation min-h-[42px]"
          >
            <Undo2 size={15} />
            Kniha je vrácená
          </button>
        </div>
      ) : formOpen ? (
        <form onSubmit={submit} className="rounded-xl border border-black-border bg-black p-3 space-y-2.5">
          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1">Komu půjčuješ</label>
            <input
              type="text"
              autoFocus
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="Jméno"
              className="w-full bg-black-card border border-black-border focus:border-wine-500 text-white rounded-lg px-3 py-2 text-sm outline-none"
            />
            {borrowers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {borrowers.map(name => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setTo(name)}
                    className="text-[11px] px-2 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white cursor-pointer"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1">Vrátit do (nepovinné)</label>
            <input
              type="date"
              value={due}
              min={todayIso()}
              onChange={(e) => setDue(e.target.value)}
              className="w-full bg-black-card border border-black-border focus:border-wine-500 text-white rounded-lg px-3 py-2 text-sm outline-none [color-scheme:dark]"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!to.trim()}
              className="flex-1 bg-wine-700 hover:bg-wine-600 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition text-xs sm:text-sm cursor-pointer min-h-[42px]"
            >
              Půjčit
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-medium py-2.5 rounded-xl transition text-xs sm:text-sm cursor-pointer min-h-[42px]"
            >
              Zrušit
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => { setDue(addDaysIso(DEFAULT_LOAN_DAYS)); setFormOpen(true); }}
          className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-2.5 rounded-xl border border-zinc-800 transition flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer touch-manipulation min-h-[42px]"
        >
          <HandHelping size={15} className="text-wine-400" />
          Půjčit knihu
        </button>
      )}

      {history.length > 0 && (
        <details className="text-xs text-zinc-400">
          <summary className="cursor-pointer flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 select-none">
            <History size={13} /> Historie půjčování ({history.length})
          </summary>
          <ul className="mt-2 space-y-1 pl-1">
            {history.map((h, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <CalendarClock size={12} className="text-zinc-600 shrink-0" />
                <span className="text-zinc-300">{h.to}</span>
                <span className="text-zinc-500">{formatDate(h.since)} – {formatDate(h.returned)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
