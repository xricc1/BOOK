/**
 * Book cover sources.
 *
 * A book can have a cover in several places, so the app tries them in order
 * and shows the first one that actually loads:
 *   1. the cover saved with the book, unless it is just the generic Open Library guess
 *   2. obalkyknih.cz - Czech cover database used by Czech libraries (best for Czech books)
 *   3. Open Library - good for foreign (mostly English) books
 * Everything is derived from the ISBN, so books saved earlier get covers too.
 */

const OPEN_LIBRARY_COVER_HOST = 'covers.openlibrary.org';

export function openLibraryCoverUrl(isbn) {
  // default=false makes a missing cover a 404, so the next source is tried
  return `https://${OPEN_LIBRARY_COVER_HOST}/b/isbn/${isbn}-L.jpg?default=false`;
}

export function obalkyKnihCoverUrl(isbn) {
  const multi = encodeURIComponent(JSON.stringify({ isbn }));
  return `https://cache.obalkyknih.cz/api/cover?multi=${multi}&type=medium`;
}

/**
 * Ordered, de-duplicated list of cover URLs to try for a book.
 */
export function coverSources(coverUrl, isbn) {
  const clean = String(isbn || '').replace(/[^0-9X]/gi, '').toUpperCase();
  const saved = coverUrl && !coverUrl.includes(OPEN_LIBRARY_COVER_HOST) ? coverUrl : null;

  const list = [
    saved,
    clean ? obalkyKnihCoverUrl(clean) : null,
    clean ? openLibraryCoverUrl(clean) : coverUrl,
  ].filter(Boolean);

  return [...new Set(list)];
}

/**
 * Some cover services answer "no cover" with a tiny placeholder image (e.g. a 1x1 gif)
 * instead of an error. Treat those as missing so the next source is tried.
 */
export function isPlaceholderImage(img) {
  return !img || img.naturalWidth < 20 || img.naturalHeight < 20;
}
