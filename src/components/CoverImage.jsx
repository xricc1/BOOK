import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import {
  coverSources, isPlaceholderImage, cachedGoogleCover, findGoogleCover, cleanCoverIsbn, GOOGLE_LOOKUP,
} from '../services/coverService';

/**
 * Book cover with fallbacks.
 * Tries the book's cover sources in order (Knihovny.cz, saved cover, Google Books by ISBN,
 * Open Library) and shows the placeholder only when none of them has a real image.
 */
export function CoverImage({ src, isbn, alt, iconSize = 24, label, className = '' }) {
  const clean = cleanCoverIsbn(isbn);
  const sources = coverSources(src, isbn);
  const key = sources.join('|');

  // Remember how far down the list we got for this book, so a new book starts again from the top
  const [attempt, setAttempt] = useState({ key, index: 0 });
  const savedIndex = attempt.key === key ? attempt.index : 0;

  // Google lookup result for this ISBN: undefined = not known yet, null = none, string = URL
  const [lookup, setLookup] = useState({ isbn: null, url: undefined });
  const googleCover = lookup.isbn === clean ? lookup.url : cachedGoogleCover(clean);

  // When Google is known to have no cover, step over it straight away
  const skipGoogle = sources[savedIndex] === GOOGLE_LOOKUP && googleCover === null;
  const index = skipGoogle ? savedIndex + 1 : savedIndex;
  const entry = sources[index];
  const atGoogle = entry === GOOGLE_LOOKUP;
  const tryNext = () => setAttempt({ key, index: index + 1 });

  useEffect(() => {
    if (!atGoogle || cachedGoogleCover(clean) !== undefined) return undefined;
    let cancelled = false;
    findGoogleCover(clean).then((url) => {
      if (!cancelled) setLookup({ isbn: clean, url });
    });
    return () => { cancelled = true; };
  }, [atGoogle, clean]);

  const pending = atGoogle && googleCover === undefined;
  const current = atGoogle ? googleCover || null : entry;

  if (!current) {
    return (
      <div className="text-center p-2">
        <BookOpen size={iconSize} className={`text-wine-600 mx-auto ${pending ? 'animate-pulse' : ''}`} />
        {label && !pending && (
          <span className="block mt-1 text-[10px] text-zinc-500 font-mono">{label}</span>
        )}
      </div>
    );
  }

  return (
    <img
      key={current}
      src={current}
      alt={alt}
      loading="lazy"
      className={`w-full h-full object-cover ${className}`}
      onError={tryNext}
      onLoad={(e) => { if (isPlaceholderImage(e.currentTarget)) tryNext(); }}
    />
  );
}
