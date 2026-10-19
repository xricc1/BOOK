// Service for fetching book details by ISBN from Knihovny.cz, Google Books & Open Library

export class CatalogError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'CatalogError';
    this.code = code; // 'INVALID_ISBN', 'NOT_FOUND', 'SERVICE_UNAVAILABLE'
  }
}

export const SAMPLE_BOOKS = {
  "9788020712349": {
    isbn: "9788020712349",
    title: "1984",
    author: "George Orwell",
    genre: "Antiutopie / Sci-Fi",
    publishYear: "1949",
    pageCount: "328",
    publisher: "Odeon",
    description: "Klasický román George Orwella popisuje svět pod diktaturou Velkého bratra, kde svoboda je myšlenkový zločin a minulost se neustále přepisuje.",
    coverUrl: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&q=80&w=400",
    catalogSource: "Ukázková data",
  },
  "9788073812348": {
    isbn: "9788073812348",
    title: "Válka s Mloky",
    author: "Karel Čapek",
    genre: "Sci-Fi / Satira",
    publishYear: "1936",
    pageCount: "280",
    publisher: "Fr. Borový",
    description: "Metaforické a varovné dílo Karla Čapka sledijící objev inteligencí obdařených mloků a jejich postupnou nadvládu nad lidstvem.",
    coverUrl: "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&q=80&w=400",
    catalogSource: "Ukázková data",
  },
  "9788020445674": {
    isbn: "9788020445674",
    title: "Království",
    author: "Jo Nesbø",
    genre: "Detektivka / Krimi",
    publishYear: "2020",
    pageCount: "560",
    publisher: "Knižní klub",
    description: "Temný norský thriller o dvou bratřích, temných rodinných tajemstvích a moci v odlehlém horském městečku.",
    coverUrl: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=400",
    catalogSource: "Ukázková data",
  },
  "9788074628887": {
    isbn: "9788074628887",
    title: "Sto roků samoty",
    author: "Gabriel García Márquez",
    genre: "Magický realismus",
    publishYear: "1967",
    pageCount: "416",
    publisher: "Odeon",
    description: "Monumentální rodinná sága rodu Buendíů fiktivního městečka Macondo od zakladatele magického realismu.",
    coverUrl: "https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&q=80&w=400",
    catalogSource: "Ukázková data",
  }
};

/**
 * Clean ISBN string (remove hyphens, spaces, normalize upper case)
 */
export function cleanIsbn(isbnStr) {
  if (!isbnStr) return '';
  return isbnStr.replace(/[^0-9X]/gi, '').toUpperCase();
}

/**
 * Validate ISBN-10 or ISBN-13 checksum
 */
export function isValidIsbn(isbnStr) {
  const clean = cleanIsbn(isbnStr);
  if (!clean) return false;

  if (clean.length === 10) {
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      const digit = parseInt(clean[i], 10);
      if (isNaN(digit)) return false;
      sum += (10 - i) * digit;
    }
    const last = clean[9];
    sum += last === 'X' ? 10 : parseInt(last, 10);
    return sum % 11 === 0;
  } else if (clean.length === 13) {
    if (!/^\d{13}$/.test(clean)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(clean[i], 10) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === parseInt(clean[12], 10);
  }
  return false;
}

/**
 * Convert a valid ISBN-10 to ISBN-13 (978 prefix). Other input is returned cleaned.
 * Used so the same book is recognised regardless of which ISBN form was scanned.
 */
export function normalizeIsbn(isbnStr) {
  const clean = cleanIsbn(isbnStr);
  if (clean.length === 10 && isValidIsbn(clean)) {
    const base = '978' + clean.substring(0, 9);
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(base[i], 10) * (i % 2 === 0 ? 1 : 3);
    }
    return base + ((10 - (sum % 10)) % 10);
  }
  return clean;
}

/**
 * True when a scanned barcode is a book barcode (EAN-13 with 978/979 prefix) or an ISBN-10.
 */
export function isBookBarcode(code) {
  const clean = cleanIsbn(code);
  if (clean.length === 13) return /^97[89]/.test(clean) && isValidIsbn(clean);
  if (clean.length === 10) return isValidIsbn(clean);
  return false;
}

/**
 * Fetch sample book explicitly for quick test buttons
 */
export function getSampleBook(isbnRaw) {
  const isbn = cleanIsbn(isbnRaw);
  if (SAMPLE_BOOKS[isbn]) {
    return {
      ...SAMPLE_BOOKS[isbn],
      id: `book-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      catalogSource: 'Ukázková data'
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Catalog lookup: Knihovny.cz first, then Google Books, then Open Library
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 8000;

// Optional Google Books API key, injected at build time (GitHub secret
// GOOGLE_BOOKS_API_KEY). Without a key Google shares one small daily quota
// between all keyless apps, so lookups often fail with HTTP 429.
const GOOGLE_BOOKS_API_KEY = import.meta.env?.VITE_GOOGLE_BOOKS_API_KEY || '';

const newBookId = () => `book-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

async function fetchJson(url, { retries = 0 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchJsonOnce(url);
    } catch (err) {
      // Retry server hiccups (5xx) and network errors, not "not found" style answers
      const retriable = !err.status || err.status >= 500;
      if (attempt >= retries || !retriable) throw err;
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
  }
}

async function fetchJsonOnce(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      const err = new Error(`HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** First four-digit year in a string like "2017", "c2017" or "March 2017". */
function extractYear(value) {
  const match = String(value || '').match(/\b(1[5-9]\d\d|20\d\d)\b/);
  return match ? match[1] : '';
}

/** Page count from a physical description like "237 stran : ilustrace ; 25 cm" or "223 s.". */
export function extractPages(value) {
  const match = String(value || '').match(/(\d+)\s*(?:stran|stránek|strana|str\.|s\.|pages|p\.)/i);
  return match ? match[1] : '';
}

/** "Zdeněk Jirotka, 1911-2003" -> "Zdeněk Jirotka" */
function cleanPersonName(name) {
  return String(name || '').replace(/,\s*[\d\s?.–-]+$/, '').trim();
}

/** "Albatros," -> "Albatros" */
function cleanPublisher(value) {
  return String(value || '').replace(/[\s,:;/]+$/, '').trim();
}

function capitalize(value) {
  const s = String(value || '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const nameList = (group) => (group && !Array.isArray(group) ? Object.keys(group) : []);

/**
 * Pick the record that really belongs to the ISBN.
 * Knihovny.cz sometimes returns several titles for one ISBN, e.g. every volume
 * of a box set lists the set's ISBN. The set itself says "7 svazků".
 */
function pickKnihovnyRecord(records, isbn) {
  const target = normalizeIsbn(isbn);
  const matching = records.filter(r =>
    (r.isbns || []).some(i => normalizeIsbn(i) === target) ||
    (r.cleanIsbn && normalizeIsbn(r.cleanIsbn) === target)
  );
  // The ISN search is fuzzy: for an unknown ISBN it can return an unrelated book
  if (!matching.length) return null;
  const pool = matching;
  const books = pool.filter(r => (r.formats || []).some(f => String(f).includes('BOOKS')));
  const candidates = books.length ? books : pool;

  const titles = new Set(candidates.map(r => String(r.title || '').toLowerCase()));
  if (titles.size > 1) {
    const set = candidates.find(r => (r.physicalDescriptions || []).some(p => /svazk|svazek|\bsv\./i.test(p)));
    if (set) return set;
  }

  // Prefer the most complete record
  const score = (r) =>
    (r.summary?.length ? 2 : 0) +
    (nameList(r.authors?.primary).length ? 2 : 0) +
    (r.publishers?.length ? 1 : 0) +
    (r.physicalDescriptions?.length ? 1 : 0) +
    (r.subjects?.length ? 1 : 0);
  return candidates.reduce((best, r) => (score(r) > score(best) ? r : best), candidates[0]);
}

const KNIHOVNY_FIELDS = [
  'id', 'title', 'isbns', 'cleanIsbn', 'formats', 'authors', 'publicationDates',
  'publishers', 'physicalDescriptions', 'summary', 'subjects',
];

// 1. Knihovny.cz (primary) - union catalog of Czech libraries
export function knihovnyRecordToBook(rec, isbn) {
  const authors = nameList(rec.authors?.primary);
  const fallbackAuthors = authors.length ? authors : nameList(rec.authors?.corporate);
  const subject = (rec.subjects || []).find(s => Array.isArray(s) && s.length);
  const summary = (rec.summary || []).find(Boolean);

  return {
    id: newBookId(),
    isbn,
    title: String(rec.title || '').replace(/\s*\/\s*$/, '') || 'Neznámý název',
    author: fallbackAuthors.map(cleanPersonName).filter(Boolean).join(', ') || 'Neznámý autor',
    genre: subject ? capitalize(subject[0]) : 'Beletrie',
    publishYear: extractYear((rec.publicationDates || [])[0]) || 'Neuvedeno',
    pageCount: extractPages((rec.physicalDescriptions || [])[0]) || 'Neuvedeno',
    publisher: cleanPublisher((rec.publishers || [])[0]) || 'Neuvedeno',
    description: summary || 'Kniha z katalogu Knihovny.cz.',
    // Knihovny.cz API has no covers; Open Library often has one for the ISBN
    coverUrl: openLibraryCoverUrl(isbn),
    catalogSource: 'Knihovny.cz',
    addedAt: new Date().toISOString(),
  };
}

async function searchKnihovnyCz(isbn) {
  const params = new URLSearchParams({ lookfor: isbn, type: 'ISN', limit: '10' });
  KNIHOVNY_FIELDS.forEach(f => params.append('field[]', f));
  // Knihovny.cz occasionally answers 500 for a valid query; one retry fixes it
  const data = await fetchJson(`https://www.knihovny.cz/api/v1/search?${params}`, { retries: 1 });
  if (data?.status && data.status !== 'OK') throw new Error(data.statusMessage || 'Knihovny.cz error');
  const records = data?.records || [];
  const record = records.length ? pickKnihovnyRecord(records, isbn) : null;
  return record ? knihovnyRecordToBook(record, isbn) : null;
}

function openLibraryCoverUrl(isbn) {
  // default=false makes a missing cover a 404, so the placeholder is shown instead
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
}

// 2. Google Books (secondary)
async function searchGoogleBooks(isbn) {
  const params = new URLSearchParams({ q: `isbn:${isbn}`, country: 'CZ' });
  if (GOOGLE_BOOKS_API_KEY) params.set('key', GOOGLE_BOOKS_API_KEY);
  const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?${params}`);
  const info = data?.totalItems > 0 ? data.items?.[0]?.volumeInfo : null;
  if (!info) return null;

  let cover = info.imageLinks?.extraLarge || info.imageLinks?.large || info.imageLinks?.medium ||
    info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null;
  if (cover) cover = cover.replace(/^http:/, 'https:');

  return {
    id: newBookId(),
    isbn,
    title: [info.title, info.subtitle].filter(Boolean).join(': ') || 'Neznámý název',
    author: info.authors ? info.authors.join(', ') : 'Neznámý autor',
    genre: info.categories ? info.categories.join(', ') : 'Beletrie',
    publishYear: extractYear(info.publishedDate) || 'Neuvedeno',
    pageCount: info.pageCount ? String(info.pageCount) : 'Neuvedeno',
    publisher: info.publisher || 'Neuvedeno',
    description: info.description || 'K této knize není k dispozici žádný popis.',
    coverUrl: cover || openLibraryCoverUrl(isbn),
    catalogSource: 'Google Books',
    addedAt: new Date().toISOString(),
  };
}

// 3. Open Library (last resort)
async function searchOpenLibrary(isbn) {
  const data = await fetchJson(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
  const info = data?.[`ISBN:${isbn}`];
  if (!info) return null;

  return {
    id: newBookId(),
    isbn,
    title: info.title || 'Neznámý název',
    author: info.authors ? info.authors.map(a => a.name).join(', ') : 'Neznámý autor',
    genre: info.subjects ? info.subjects.slice(0, 2).map(s => s.name).join(', ') : 'Beletrie',
    publishYear: extractYear(info.publish_date) || 'Neuvedeno',
    pageCount: info.number_of_pages ? String(info.number_of_pages) : 'Neuvedeno',
    publisher: info.publishers ? info.publishers.map(p => p.name).join(', ') : 'Neuvedeno',
    description: 'Kniha z katalogu Open Library.',
    coverUrl: info.cover?.large || info.cover?.medium || info.cover?.small || null,
    catalogSource: 'Open Library',
    addedAt: new Date().toISOString(),
  };
}

const CATALOGS = [
  { name: 'Knihovny.cz', search: searchKnihovnyCz },
  { name: 'Google Books', search: searchGoogleBooks },
  { name: 'Open Library', search: searchOpenLibrary },
];

/**
 * Fetch book details by ISBN: Knihovny.cz -> Google Books -> Open Library.
 * options.onProgress(catalogName) is called before each catalog is asked.
 */
export async function fetchBookByIsbn(isbnRaw, options = {}) {
  const isbn = cleanIsbn(isbnRaw);

  // Sample override is checked first so demo buttons always work
  if (options.isSample) {
    const sample = getSampleBook(isbn);
    if (sample) return sample;
  }

  if (!isValidIsbn(isbn)) {
    throw new CatalogError('Zadané ISBN není platné. Zkontroluj číslo a zkus to znovu.', 'INVALID_ISBN');
  }

  // Catalogs index books under ISBN-13; old books may only have ISBN-10
  const isbn13 = normalizeIsbn(isbn);

  let answeredCount = 0;
  for (const catalog of CATALOGS) {
    options.onProgress?.(catalog.name);
    try {
      const book = await catalog.search(isbn13);
      if (book) return book;
      answeredCount++;
    } catch (err) {
      console.warn(`${catalog.name} lookup unavailable:`, err);
    }
  }

  if (answeredCount > 0) {
    throw new CatalogError('Knihu se nepodařilo najít v Knihovny.cz ani v Google Books. Údaje můžeš doplnit ručně.', 'NOT_FOUND');
  }
  throw new CatalogError('Katalogy jsou teď nedostupné. Zkontroluj připojení k internetu a zkus to znovu.', 'SERVICE_UNAVAILABLE');
}

// Local storage management
const LOCAL_STORAGE_KEY = 'vytvorene_knihy_isbn_library_v1';

export function getSavedBooks() {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error reading books from localStorage', err);
    return [];
  }
}

export function isBookInLibrary(isbnRaw) {
  return findSavedBookByIsbn(isbnRaw) !== null;
}

export function findSavedBookByIsbn(isbnRaw) {
  const isbn = normalizeIsbn(isbnRaw);
  if (!isbn) return null;
  const books = getSavedBooks();
  return books.find(b => normalizeIsbn(b.isbn) === isbn) || null;
}

export function saveBookToLibrary(book) {
  const books = getSavedBooks();
  const normalizedBookIsbn = normalizeIsbn(book.isbn);

  const existingIndex = books.findIndex(b => normalizeIsbn(b.isbn) === normalizedBookIsbn);
  let updatedBooks;

  if (existingIndex >= 0) {
    updatedBooks = [...books];
    const existing = books[existingIndex];
    // Keep the original id and date added so the library entry stays stable
    updatedBooks[existingIndex] = {
      ...book,
      id: existing.id || book.id,
      addedAt: existing.addedAt || book.addedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } else {
    const newBook = {
      ...book,
      addedAt: book.addedAt || new Date().toISOString()
    };
    updatedBooks = [newBook, ...books];
  }

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedBooks));
  return updatedBooks;
}

export function removeBookFromLibrary(bookId) {
  const books = getSavedBooks();
  const filtered = books.filter(b => b.id !== bookId);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
  return filtered;
}

export function updateBookInLibrary(updatedBook) {
  const books = getSavedBooks();
  const updated = books.map(b => b.id === updatedBook.id ? updatedBook : b);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  return updated;
}
