import React, { useMemo } from 'react';
import { ChartColumn, BookOpen, FileText, Users, HandHelping, TriangleAlert, Library } from 'lucide-react';
import { daysOverdue, formatDate } from '../services/loanService';
import { computeStats, knihLabel } from '../services/statsService';

function Tile({ icon: Icon, label, value, note }) {
  return (
    <div className="bg-black-card border border-black-border rounded-2xl p-3.5 sm:p-4 shadow-md">
      <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] uppercase tracking-wider text-zinc-500 font-medium">
        <Icon size={13} className="text-wine-500" />
        {label}
      </div>
      <div className="text-2xl sm:text-3xl font-extrabold text-white mt-1 tabular-nums">{value}</div>
      {note && <div className="text-[11px] text-zinc-500 mt-0.5 truncate">{note}</div>}
    </div>
  );
}

function Card({ title, children }) {
  return (
    <section className="bg-black-card border border-black-border rounded-2xl p-4 sm:p-5 shadow-md">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">{title}</h3>
      {children}
    </section>
  );
}

/** Horizontal ranked bars: label, bar, value. One hue - the bar length is the information. */
function RankBars({ rows }) {
  const max = Math.max(...rows.map(([, c]) => c), 1);
  return (
    <ul className="space-y-2">
      {rows.map(([label, count]) => (
        <li key={label} className="group" title={`${label}: ${knihLabel(count)}`}>
          <div className="flex justify-between text-xs mb-1 gap-2">
            <span className="text-zinc-200 truncate">{label}</span>
            <span className="text-zinc-400 tabular-nums shrink-0">{count}</span>
          </div>
          <div className="h-2.5 rounded-r-[4px] bg-zinc-900 overflow-hidden">
            <div
              className="h-full rounded-r-[4px] bg-wine-600 group-hover:bg-wine-500 transition-colors"
              style={{ width: `${Math.max((count / max) * 100, 2)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Vertical column chart for a time series (12 months, decades). */
function Columns({ data, valueLabel }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div>
      <div className="flex items-end gap-[2px] sm:gap-1 h-32 border-b border-zinc-800">
        {data.map(d => (
          <div key={d.key} className="flex-1 h-full flex flex-col justify-end items-center group relative" title={`${d.title}: ${valueLabel(d.value)}`}>
            {d.value > 0 && (
              <span className="text-[10px] text-zinc-400 tabular-nums mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity">{d.value}</span>
            )}
            <div
              className="w-full max-w-[28px] rounded-t-[4px] bg-wine-600 group-hover:bg-wine-500 transition-colors"
              style={{ height: d.value ? `${Math.max((d.value / max) * 100, 4)}%` : '0%' }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-[2px] sm:gap-1 mt-1">
        {data.map(d => (
          <div key={d.key} className="flex-1 text-center text-[9px] sm:text-[10px] text-zinc-500 truncate">{d.label}</div>
        ))}
      </div>
    </div>
  );
}

export function StatsTab({ books, onSwitchToScan, onOpenLibrary }) {
  const s = useMemo(() => computeStats(books), [books]);

  if (!books.length) {
    return (
      <div className="max-w-xl mx-auto text-center py-16 space-y-4">
        <ChartColumn size={40} className="text-wine-600 mx-auto" />
        <h1 className="text-2xl font-extrabold text-white">Zatím žádné statistiky</h1>
        <p className="text-sm text-zinc-400">Naskenuj pár knih a tady uvidíš, co máš v knihovně za poklady.</p>
        <button
          onClick={onSwitchToScan}
          className="bg-wine-700 hover:bg-wine-600 text-white font-semibold py-2.5 px-5 rounded-xl transition text-sm cursor-pointer min-h-[44px]"
        >
          Naskenovat knihu
        </button>
      </div>
    );
  }

  const addedThisYear = s.months.filter(m => m.year === new Date().getFullYear()).reduce((a, m) => a + m.count, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-5">
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-wine-700/50 bg-wine-900/20 text-wine-400 text-[11px] sm:text-xs font-medium tracking-wider uppercase mb-1">
          <ChartColumn size={13} className="text-wine-500" />
          Statistiky
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Tvoje knihovna v číslech</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <Tile icon={BookOpen} label="Knih" value={s.total} note={`letos přidáno ${addedThisYear}`} />
        <Tile icon={FileText} label="Stran celkem" value={s.pages.toLocaleString('cs-CZ')} note={s.pages ? `≈ ${Math.round(s.pages / 30).toLocaleString('cs-CZ')} dní čtení po 30 str.` : 'počet stran chybí'} />
        <Tile icon={Users} label="Autorů" value={s.authorCount} />
        <Tile
          icon={HandHelping}
          label="Půjčeno"
          value={s.lent.length}
          note={s.overdue ? `${s.overdue} po termínu` : s.lent.length ? 'vše v termínu' : 'nic není půjčené'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Přidané knihy za posledních 12 měsíců">
          <Columns
            data={s.months.map(m => ({ key: m.key, label: m.label, title: `${m.label} ${m.year}`, value: m.count }))}
            valueLabel={knihLabel}
          />
        </Card>

        <Card title="Žánry">
          <RankBars rows={s.genres} />
        </Card>

        {s.decades.length > 1 && (
          <Card title="Kdy knihy vyšly">
            <Columns
              data={s.decades.map(([decade, value]) => ({
                key: decade,
                // "'90" is clear within one century; otherwise show the full year (1820 vs 2020)
                label: s.decades[0][0] >= s.decades[s.decades.length - 1][0] - 90 ? `'${String(decade).slice(2)}` : String(decade),
                title: `${decade}–${decade + 9}`,
                value,
              }))}
              valueLabel={knihLabel}
            />
          </Card>
        )}

        {s.authors.length > 0 && (
          <Card title="Nejčastější autoři">
            <RankBars rows={s.authors} />
          </Card>
        )}

        {(s.thickest || s.oldest) && (
          <Card title="Rekordy">
            <ul className="space-y-3 text-sm">
              {s.thickest && (
                <li>
                  <span className="block text-[11px] uppercase tracking-wider text-zinc-500">Nejtlustší kniha</span>
                  <span className="text-white font-semibold">{s.thickest.title}</span>
                  <span className="text-zinc-400"> · {s.thickest.pageCount} stran</span>
                </li>
              )}
              {s.oldest && (
                <li>
                  <span className="block text-[11px] uppercase tracking-wider text-zinc-500">Nejstarší vydání</span>
                  <span className="text-white font-semibold">{s.oldest.title}</span>
                  <span className="text-zinc-400"> · {s.oldest.publishYear}</span>
                </li>
              )}
            </ul>
          </Card>
        )}

        {s.lent.length > 0 && (
          <Card title="Půjčené knihy">
            <ul className="space-y-2">
              {s.lent.map(b => {
                const late = daysOverdue(b);
                return (
                  <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <span className="block text-white truncate">{b.title}</span>
                      <span className="block text-xs text-zinc-400 truncate">
                        {b.loan.to} · od {formatDate(b.loan.since)}
                      </span>
                    </span>
                    {late > 0 ? (
                      <span className="shrink-0 flex items-center gap-1 text-xs font-medium text-red-300">
                        <TriangleAlert size={13} /> po termínu
                      </span>
                    ) : b.loan.due ? (
                      <span className="shrink-0 text-xs text-zinc-400">do {formatDate(b.loan.due)}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <button
              onClick={onOpenLibrary}
              className="mt-3 flex items-center gap-1.5 text-xs text-wine-300 hover:text-white cursor-pointer"
            >
              <Library size={14} /> Otevřít knihovnu
            </button>
          </Card>
        )}
      </div>
    </div>
  );
}
