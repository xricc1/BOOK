import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { coverSources, isPlaceholderImage } from '../services/coverService';

/**
 * Book cover with fallbacks.
 * Tries every known cover source for the book (saved URL, obalkyknih.cz, Open Library)
 * and shows the placeholder only when none of them has a real image.
 */
export function CoverImage({ src, isbn, alt, iconSize = 24, label, className = '' }) {
  const sources = coverSources(src, isbn);
  const key = sources.join('|');

  // Remember how far down the list we got for this book, so a new book starts again from the top
  const [attempt, setAttempt] = useState({ key, index: 0 });
  const index = attempt.key === key ? attempt.index : 0;
  const current = sources[index];

  const tryNext = () => setAttempt({ key, index: index + 1 });

  if (!current) {
    return (
      <div className="text-center p-2">
        <BookOpen size={iconSize} className="text-wine-600 mx-auto" />
        {label && (
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
