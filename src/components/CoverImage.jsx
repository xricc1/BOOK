import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';

/**
 * Book cover with a placeholder fallback.
 * Shows the placeholder when there is no URL or when the image fails to load.
 */
export function CoverImage({ src, alt, iconSize = 24, label, className = '' }) {
  // Remember which URL failed, so a new cover is tried again automatically
  const [failedSrc, setFailedSrc] = useState(null);
  const failed = failedSrc !== null && failedSrc === src;

  if (!src || failed) {
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
      src={src}
      alt={alt}
      className={`w-full h-full object-cover ${className}`}
      onError={() => setFailedSrc(src)}
    />
  );
}
