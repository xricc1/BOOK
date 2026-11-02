/**
 * Book cover sources.
 *
 * A book can have a cover in several places, so the app tries them in order
 * and shows the first one that actually loads:
 *   1. a cover saved with the book that came from somewhere else than Google / Open Library
 *   2. Knihovny.cz cover service - Czech libraries' covers (from obalkyknih.cz), works from any website
 *   3. the Google Books cover saved with the book
 *   4. Google Books, looked up by ISBN only when everything above failed (it has a small daily limit)
 *   5. Open Library - good for foreign (mostly English) books
 * Everything is derived from the ISBN, so books saved earlier get covers too.
 */

const OPEN_LIBRARY_COVER_HOST = 'covers.openlibrary.org';
const GOOGLE_BOOKS_API_KEY = import.meta.env?.VITE_GOOGLE_BOOKS_API_KEY || '';

/** Marker in the source list: "ask Google Books for a cover now". */
export const GOOGLE_LOOKUP = 'google-lookup';

export function cleanCoverIsbn(isbn) {
  return String(isbn || '').replace(/[^0-9X]/gi, '').toUpperCase();
}

export function openLibraryCoverUrl(isbn) {
  // default=false makes a missing cover a 404, so the next source is tried
  return `https://${OPEN_LIBRARY_COVER_HOST}/b/isbn/${isbn}-L.jpg?default=false`;
}

export function knihovnyCoverUrl(isbn) {
  // Knihovny.cz is registered with obalkyknih.cz and passes its covers on to anyone
  return `https://www.knihovny.cz/Cover/Show?isbn=${isbn}&size=large`;
}

export function isGoogleCover(url) {
  return /books\.google|googleusercontent/.test(url || '');
}

/**
 * Ordered, de-duplicated list of cover sources to try for a book.
 * Entries are image URLs, plus the GOOGLE_LOOKUP marker.
 */
export function coverSources(coverUrl, isbn) {
  const clean = cleanCoverIsbn(isbn);
  const isOpenLibrary = (coverUrl || '').includes(OPEN_LIBRARY_COVER_HOST);
  const google = isGoogleCover(coverUrl);
  const custom = coverUrl && !isOpenLibrary && !google ? coverUrl : null;

  const list = [
    custom,
    clean ? knihovnyCoverUrl(clean) : null,
    google ? coverUrl : null,
    clean && !google ? GOOGLE_LOOKUP : null,
    clean ? openLibraryCoverUrl(clean) : coverUrl,
  ].filter(Boolean);

  return [...new Set(list)];
}

/**
 * Cover services often answer "no cover" with a small placeholder image (a 1x1 gif,
 * Knihovny.cz's 65x80 "no cover" icon) instead of an error. Real covers are much bigger,
 * so treat small images as missing and try the next source.
 */
export function isPlaceholderImage(img) {
  return !img || (img.naturalWidth < 100 && img.naturalHeight < 100);
}

// --- Google Books cover lookup -------------------------------------------------

const CACHE_KEY = 'obalky_google_cache_v1';
const MISS_RETRY_MS = 7 * 24 * 60 * 60 * 1000; // ask again for books without a cover after a week
const MAX_PARALLEL = 2; // don't fire dozens of requests at once when the library opens

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeCache(isbn, url) {
  try {
    const cache = readCache();
    cache[isbn] = { url: url || '', at: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // storage full or blocked - the cover still shows, it just isn't remembered
  }
}

/**
 * Cached answer for an ISBN: a URL, null (known to have no cover), or undefined (not asked yet).
 */
export function cachedGoogleCover(isbn) {
  const entry = readCache()[cleanCoverIsbn(isbn)];
  if (!entry) return undefined;
  if (entry.url) return entry.url;
  return Date.now() - entry.at < MISS_RETRY_MS ? null : undefined;
}

function bestGoogleImage(imageLinks) {
  const url = imageLinks?.extraLarge || imageLinks?.large || imageLinks?.medium ||
    imageLinks?.small || imageLinks?.thumbnail || imageLinks?.smallThumbnail;
  if (!url) return null;
  return url.replace(/^http:/, 'https:').replace(/&edge=curl/, '');
}

const inFlight = new Map();
const queue = [];
let running = 0;

function runQueue() {
  while (running < MAX_PARALLEL && queue.length) {
    const job = queue.shift();
    running++;
    job().finally(() => { running--; runQueue(); });
  }
}

async function requestGoogleCover(isbn) {
  const params = new URLSearchParams({ q: `isbn:${isbn}`, country: 'CZ' });
  if (GOOGLE_BOOKS_API_KEY) params.set('key', GOOGLE_BOOKS_API_KEY);
  const res = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`);
  if (!res.ok) throw new Error(`Google Books ${res.status}`);
  const data = await res.json();
  const withCover = (data.items || []).find(item => item.volumeInfo?.imageLinks);
  return bestGoogleImage(withCover?.volumeInfo?.imageLinks);
}

/**
 * Find a cover on Google Books by ISBN. Resolves to a URL or null. Results are cached;
 * network errors (e.g. quota exceeded) are not cached, so they are retried next time.
 */
export function findGoogleCover(isbnRaw) {
  const isbn = cleanCoverIsbn(isbnRaw);
  if (!isbn) return Promise.resolve(null);

  const cached = cachedGoogleCover(isbn);
  if (cached !== undefined) return Promise.resolve(cached);
  if (inFlight.has(isbn)) return inFlight.get(isbn);

  const promise = new Promise((resolve) => {
    queue.push(() => requestGoogleCover(isbn)
      .then((url) => { writeCache(isbn, url); resolve(url); })
      .catch(() => resolve(null))
      .finally(() => inFlight.delete(isbn)));
    runQueue();
  });
  inFlight.set(isbn, promise);
  return promise;
}
