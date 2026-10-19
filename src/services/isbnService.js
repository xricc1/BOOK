// Service for fetching book details by ISBN from Knihovny.cz, Google Books API, & Open Library API

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

// 1. Search Knihovny.cz (Primary)
async function searchKnihovnyCz(isbn) {
  const response = await fetch(`https://www.knihovny.cz/api/v1/search?lookfor=${isbn}&type=Isbn`, {
    headers: { 'Accept': 'application/json' }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = await response.json();
  if (data && data.records && data.records.length > 0) {
    const rec = data.records[0];
    const authorStr = rec.authors?.primary ? Object.keys(rec.authors.primary).join(', ') : (rec.authors?.secondary ? Object.keys(rec.authors.secondary).join(', ') : 'Neznámý autor');
    const pubYear = rec.publicationDates && rec.publicationDates.length > 0 ? rec.publicationDates[0] : '';
    const cover = rec.images && rec.images.length > 0 ? rec.images[0] : null;

    return {
      id: `book-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      isbn: isbn,
      title: rec.title || 'Neznámý název',
      author: authorStr,
      genre: rec.subjects && rec.subjects.length > 0 && rec.subjects[0].length > 0 ? rec.subjects[0][0] : 'Beletrie',
      publishYear: pubYear ? pubYear.substring(0, 4) : 'Neuvedeno',
      pageCount: rec.physical && rec.physical.length > 0 ? rec.physical[0] : 'Neuvedeno',
      publisher: rec.publishers && rec.publishers.length > 0 ? rec.publishers[0] : 'Neuvedeno',
      description: rec.summary && rec.summary.length > 0 ? rec.summary[0] : 'Kniha z katalogu Knihovny.cz.',
      coverUrl: cover,
      catalogSource: 'Knihovny.cz',
      addedAt: new Date().toISOString(),
    };
  }
  return null;
}

// 2. Search Google Books (Secondary)
async function searchGoogleBooks(isbn) {
  const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = await response.json();
  if (data.totalItems > 0 && data.items?.[0]?.volumeInfo) {
    const info = data.items[0].volumeInfo;

    let cover = info.imageLinks?.extraLarge ||
               info.imageLinks?.large ||
               info.imageLinks?.medium ||
               info.imageLinks?.thumbnail ||
               info.imageLinks?.smallThumbnail ||
               null;

    if (cover && cover.startsWith('http:')) {
      cover = cover.replace('http:', 'https:');
    }

    return {
      id: `book-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      isbn: isbn,
      title: info.title || 'Neznámý název',
      author: info.authors ? info.authors.join(', ') : 'Neznámý autor',
      genre: info.categories ? info.categories.join(', ') : 'Beletrie',
      publishYear: info.publishedDate ? info.publishedDate.substring(0, 4) : 'Neuvedeno',
      pageCount: info.pageCount ? info.pageCount.toString() : 'Neuvedeno',
      publisher: info.publisher || 'Neuvedeno',
      description: info.description || 'K této knize není k dispozici žádný popis.',
      coverUrl: cover || null,
      catalogSource: 'Google Books',
      addedAt: new Date().toISOString(),
    };
  }
  return null;
}

// 3. Search Open Library (Tertiary)
async function searchOpenLibrary(isbn) {
  const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = await response.json();
  const bookKey = `ISBN:${isbn}`;
  if (data && data[bookKey]) {
    const info = data[bookKey];
    const authors = info.authors ? info.authors.map(a => a.name).join(', ') : 'Neznámý autor';
    const subjects = info.subjects ? info.subjects.slice(0, 2).map(s => s.name).join(', ') : 'Beletrie';
    const cover = info.cover?.large || info.cover?.medium || info.cover?.small || null;

    return {
      id: `book-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      isbn: isbn,
      title: info.title || 'Neznámý název',
      author: authors,
      genre: subjects,
      publishYear: info.publish_date ? info.publish_date : 'Neuvedeno',
      pageCount: info.number_of_pages ? info.number_of_pages.toString() : 'Neuvedeno',
      publisher: info.publishers ? info.publishers.map(p => p.name).join(', ') : 'Neuvedeno',
      description: 'Naskenovaná kniha z Open Library.',
      coverUrl: cover,
      catalogSource: 'Open Library',
      addedAt: new Date().toISOString(),
    };
  }
  return null;
}

/**
 * Fetch book details by ISBN with catalog cascading: Knihovny.cz -> Google Books -> Open Library
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

  let networkSuccessCount = 0;

  // 1. Try Knihovny.cz
  try {
    const book = await searchKnihovnyCz(isbn);
    if (book) return book;
    networkSuccessCount++;
  } catch (err) {
    console.warn('Knihovny.cz catalog lookup unavailable:', err);
  }

  // 2. Try Google Books API
  try {
    const book = await searchGoogleBooks(isbn);
    if (book) return book;
    networkSuccessCount++;
  } catch (err) {
    console.warn('Google Books catalog lookup unavailable:', err);
  }

  // 3. Try Open Library API
  try {
    const book = await searchOpenLibrary(isbn);
    if (book) return book;
    networkSuccessCount++;
  } catch (err) {
    console.warn('Open Library catalog lookup unavailable:', err);
  }

  if (networkSuccessCount > 0) {
    throw new CatalogError('Knihu se nepodařilo najít v dostupných katalozích.', 'NOT_FOUND');
  } else {
    throw new CatalogError('Katalog je teď nedostupný. Zkus to prosím později.', 'SERVICE_UNAVAILABLE');
  }
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
