import React, { useRef, useState } from 'react';
import { DatabaseBackup, Download, FileSpreadsheet, Upload, ChevronDown, TriangleAlert, ShieldCheck } from 'lucide-react';
import {
  exportLibraryJson, exportLibraryCsv, parseBackup, mergeBooks, getLastBackupDate,
} from '../services/backupService';
import { replaceLibrary } from '../services/isbnService';

const REMIND_AFTER_DAYS = 30;

function backupAgeDays(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

function knihyLabel(n) {
  if (n === 1) return '1 knihu';
  if (n >= 2 && n <= 4) return `${n} knihy`;
  return `${n} knih`;
}

/**
 * Library backup: download a backup file (JSON), a table for Excel (CSV),
 * and restore from a backup file. Restoring only adds books, it never deletes any.
 */
export function BackupPanel({ books, setBooks }) {
  const [open, setOpen] = useState(false);
  const [lastBackup, setLastBackup] = useState(() => getLastBackupDate());
  const [message, setMessage] = useState(null); // { type: 'ok' | 'error', text }
  const fileInput = useRef(null);

  const age = backupAgeDays(lastBackup);
  const needsBackup = books.length > 0 && (age === null || age >= REMIND_AFTER_DAYS);

  const handleExport = () => {
    exportLibraryJson(books);
    setLastBackup(getLastBackupDate());
    setMessage({ type: 'ok', text: `Záloha se stahuje (počet knih: ${books.length}). Ulož si ji třeba na Google Disk nebo do mailu.` });
  };

  const handleCsv = () => {
    exportLibraryCsv(books);
    setMessage({ type: 'ok', text: 'Tabulka pro Excel se stahuje.' });
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const incoming = parseBackup(await file.text());
      const result = mergeBooks(books, incoming);
      if (result.added) setBooks(replaceLibrary(result.books));
      const parts = [`Přidáno: ${knihyLabel(result.added)}.`];
      if (result.skipped) parts.push(`Přeskočeno ${knihyLabel(result.skipped)}, které už v knihovně máš.`);
      setMessage({ type: 'ok', text: parts.join(' ') });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Zálohu se nepodařilo načíst.' });
    }
  };

  const statusText = age === null
    ? 'Zatím žádná záloha'
    : age === 0 ? 'Poslední záloha: dnes' : `Poslední záloha: před ${age} ${age === 1 ? 'dnem' : 'dny'}`;

  return (
    <div className={`bg-black-card border rounded-2xl shadow-xl ${needsBackup ? 'border-wine-700/70' : 'border-black-border'}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 p-3.5 sm:p-4 text-left cursor-pointer touch-manipulation"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <DatabaseBackup size={18} className="text-wine-500 flex-shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-white">Záloha knihovny</span>
            <span className={`block text-[11px] sm:text-xs truncate ${needsBackup ? 'text-wine-400' : 'text-zinc-500'}`}>
              {needsBackup && <TriangleAlert size={11} className="inline mr-1 -mt-0.5" />}
              {statusText}
            </span>
          </span>
        </span>
        <ChevronDown size={18} className={`text-zinc-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-3.5 pb-4 sm:px-4 space-y-3 border-t border-black-border/60 pt-3">
          <p className="text-xs text-zinc-400 leading-relaxed">
            Knihy jsou uložené jen v tomhle prohlížeči. Když vymažeš data prohlížeče nebo změníš telefon,
            zmizí. Záloha je soubor, ze kterého je jde kdykoli obnovit, i na jiném zařízení.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={handleExport}
              disabled={!books.length}
              className="bg-wine-700 hover:bg-wine-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer touch-manipulation min-h-[42px]"
            >
              <Download size={16} />
              Stáhnout zálohu
            </button>
            <button
              onClick={() => fileInput.current?.click()}
              className="bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-medium py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer touch-manipulation min-h-[42px] border border-black-border"
            >
              <Upload size={16} />
              Obnovit ze zálohy
            </button>
            <button
              onClick={handleCsv}
              disabled={!books.length}
              className="bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-200 font-medium py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer touch-manipulation min-h-[42px] border border-black-border"
            >
              <FileSpreadsheet size={16} />
              Tabulka pro Excel
            </button>
          </div>
          <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={handleImport} />

          <p className="text-[11px] text-zinc-500">
            Obnovení jen přidá knihy, které v knihovně chybí. Nic nesmaže ani nepřepíše.
          </p>

          {message && (
            <div className={`flex items-start gap-2 text-xs rounded-xl px-3 py-2.5 border ${
              message.type === 'ok'
                ? 'bg-emerald-950/40 border-emerald-900/60 text-emerald-300'
                : 'bg-red-950/40 border-red-900/60 text-red-300'
            }`}>
              {message.type === 'ok' ? <ShieldCheck size={14} className="mt-0.5 flex-shrink-0" /> : <TriangleAlert size={14} className="mt-0.5 flex-shrink-0" />}
              <span>{message.text}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
