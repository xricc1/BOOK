// Backup of the library: export to a file (JSON for restoring, CSV for Excel) and import back.
import { normalizeIsbn } from './isbnService';

const BACKUP_APP = 'isbn-skener';
const BACKUP_VERSION = 1;
const LAST_BACKUP_KEY = 'knihovna_posledni_zaloha_v1';

const today = () => new Date().toISOString().slice(0, 10);

/** Offer a file to the user to save (works on desktop and mobile browsers). */
function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function getLastBackupDate() {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

function rememberBackup() {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  } catch {
    // not critical
  }
}

/** Full backup that can be imported again. */
export function exportLibraryJson(books) {
  const data = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    count: books.length,
    books,
  };
  downloadFile(JSON.stringify(data, null, 2), `knihovna-zaloha-${today()}.json`, 'application/json');
  rememberBackup();
}

const CSV_COLUMNS = [
  ['ISBN', 'isbn'],
  ['Název', 'title'],
  ['Autor', 'author'],
  ['Žánr', 'genre'],
  ['Rok vydání', 'publishYear'],
  ['Počet stran', 'pageCount'],
  ['Vydavatel', 'publisher'],
  ['Popis', 'description'],
  ['Zdroj', 'catalogSource'],
  ['Přidáno', 'addedAt'],
];

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Table for Excel (semicolons and a BOM, so Czech Excel opens it with diacritics right). */
export function buildLibraryCsv(books) {
  const header = CSV_COLUMNS.map(([label]) => csvCell(label)).join(';');
  const rows = books.map(book => CSV_COLUMNS.map(([, field]) => {
    const value = field === 'addedAt' && book.addedAt ? book.addedAt.slice(0, 10) : book[field];
    return csvCell(value);
  }).join(';'));
  return '﻿' + [header, ...rows].join('\r\n');
}

export function exportLibraryCsv(books) {
  downloadFile(buildLibraryCsv(books), `knihovna-${today()}.csv`, 'text/csv;charset=utf-8');
}

/**
 * Read books out of a backup file's text. Accepts this app's backup and a plain array of books.
 * Throws an Error with a Czech message when the file is not a usable backup.
 */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(String(text).replace(/^﻿/, ''));
  } catch {
    throw new Error('Soubor není záloha knihovny. Vyber soubor .json, který appka stáhla jako zálohu.');
  }
  const list = Array.isArray(data) ? data : data?.books;
  if (!Array.isArray(list)) {
    throw new Error('V souboru nejsou žádné knihy.');
  }
  const books = list.filter(b => b && typeof b === 'object' && (b.isbn || b.title));
  if (!books.length && list.length) {
    throw new Error('Záznamy v souboru nevypadají jako knihy.');
  }
  return books;
}

/**
 * Add books from a backup to the library. Nothing is deleted or overwritten:
 * a book whose ISBN is already in the library is skipped.
 */
export function mergeBooks(existing, incoming) {
  const keyOf = (b) => (b.isbn ? `isbn:${normalizeIsbn(b.isbn)}` : `title:${String(b.title).toLowerCase()}|${String(b.author || '').toLowerCase()}`);
  const seen = new Set(existing.map(keyOf));
  const ids = new Set(existing.map(b => b.id));
  const added = [];
  let skipped = 0;

  for (const book of incoming) {
    const key = keyOf(book);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    let id = book.id;
    if (!id || ids.has(id)) id = `book-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    ids.add(id);
    added.push({ ...book, id, addedAt: book.addedAt || new Date().toISOString() });
  }

  return { books: [...added, ...existing], added: added.length, skipped };
}
