import React, { useRef, useState } from 'react';
import { ScanText, Camera, Images, Search, X, LoaderCircle, Info, ChevronRight } from 'lucide-react';
import { readBookPhoto } from '../services/ocrService';
import { buildQueries } from '../services/ocrText';
import { searchBooksByText } from '../services/isbnService';
import { CoverImage } from './CoverImage';

/**
 * Find a book without a barcode: take a photo of its spine or cover, the text is read
 * in the browser and searched in Knihovny.cz. The user picks the right edition.
 * The recognised text can be corrected, or a title / author can be typed directly.
 */
export function PhotoRecognize({ onPick, onClose }) {
  const [photoUrl, setPhotoUrl] = useState(null);
  const [stage, setStage] = useState(null); // null | 'download' | 'read' | 'search'
  const [progress, setProgress] = useState(0);
  const [searchStep, setSearchStep] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const cameraInput = useRef(null);
  const galleryInput = useRef(null);
  const runId = useRef(0);

  const search = async (text) => {
    const queries = buildQueries(text);
    if (!queries.length) {
      setError('Na fotce se nepodařilo přečíst žádný text. Zkus fotku zblízka a ostře, nebo napiš název ručně.');
      setStage(null);
      return;
    }
    const id = ++runId.current;
    setStage('search');
    setSearchStep(0);
    setError(null);
    setResults(null);
    try {
      const books = await searchBooksByText(queries, { onStep: (i) => setSearchStep(i) });
      if (id !== runId.current) return;
      setResults(books);
    } catch (err) {
      if (id !== runId.current) return;
      setError(err.message);
    } finally {
      if (id === runId.current) setStage(null);
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const id = ++runId.current;
    setPhotoUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    setResults(null);
    setError(null);
    setQuery('');
    setStage('read');
    setProgress(0);
    try {
      const result = await readBookPhoto(file, {
        onProgress: ({ stage: s, progress: p }) => {
          if (id !== runId.current) return;
          setStage(s);
          setProgress(p);
        },
      });
      if (id !== runId.current) return;
      setQuery(result.query);
      await search(result.query);
    } catch (err) {
      if (id !== runId.current) return;
      console.warn('OCR failed:', err);
      setStage(null);
      setError('Rozpoznávání textu se nepodařilo spustit. Zkontroluj připojení k internetu (poprvé se stahuje) a zkus to znovu.');
    }
  };

  const busy = stage !== null;
  const stageText = stage === 'download'
    ? `Stahuji rozpoznávání textu (jen poprvé)… ${Math.round(progress * 100)} %`
    : stage === 'read'
      ? 'Čtu text z fotky…'
      : stage === 'search'
        ? (searchStep === 0 ? 'Hledám v katalogu Knihovny.cz…' : 'Zkouším hledat s tolerancí překlepů…')
        : '';

  return (
    <div className="space-y-4 max-w-xl mx-auto min-w-0 w-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <ScanText size={17} className="text-wine-500" />
            Rozpoznat knihu z fotky
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Vyfoť hřbet nebo obálku tak, aby byl dobře vidět název a autor.
          </p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 text-zinc-400 hover:text-white bg-zinc-900 p-2 rounded-lg border border-zinc-800 cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
          aria-label="Zavřít rozpoznávání"
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => cameraInput.current?.click()}
          disabled={busy}
          className="flex items-center justify-center gap-2 bg-wine-700 hover:bg-wine-600 disabled:opacity-50 text-white font-medium py-3 px-3 rounded-xl transition cursor-pointer touch-manipulation min-h-[48px] text-sm"
        >
          <Camera size={18} />
          Vyfotit
        </button>
        <button
          onClick={() => galleryInput.current?.click()}
          disabled={busy}
          className="flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-zinc-200 border border-zinc-800 font-medium py-3 px-3 rounded-xl transition cursor-pointer touch-manipulation min-h-[48px] text-sm"
        >
          <Images size={18} className="text-wine-400" />
          Vybrat fotku
        </button>
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
        <input ref={galleryInput} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>

      {(photoUrl || busy) && (
        <div className="flex gap-3 items-center bg-black border border-black-border rounded-xl p-2.5">
          {photoUrl && (
            <img src={photoUrl} alt="Vyfocená kniha" className="w-14 h-20 object-cover rounded-md border border-zinc-800 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            {busy ? (
              <>
                <p className="text-xs text-zinc-300 flex items-center gap-2">
                  <LoaderCircle size={14} className="animate-spin text-wine-400 shrink-0" />
                  {stageText}
                </p>
                {stage === 'download' && (
                  <div className="h-1.5 bg-zinc-900 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-wine-600 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-zinc-400">Přečtený text můžeš níž opravit a hledat znovu.</p>
            )}
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); if (query.trim()) search(query); }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Název a autor, např. Saturnin Jirotka"
          className="flex-1 min-w-0 bg-black border border-black-border focus:border-wine-500 text-white rounded-xl px-3 py-2.5 text-sm placeholder-zinc-600 outline-none min-h-[44px]"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="bg-white text-black hover:bg-zinc-200 disabled:opacity-40 font-semibold px-4 rounded-xl text-sm cursor-pointer min-h-[44px] flex items-center gap-1.5"
        >
          <Search size={16} />
          Hledat
        </button>
      </form>

      {error && (
        <p className="text-xs text-wine-300 bg-wine-950/60 border border-wine-800/70 rounded-xl px-3 py-2.5 flex gap-2">
          <Info size={14} className="shrink-0 mt-0.5" />
          {error}
        </p>
      )}

      {results && results.length === 0 && (
        <p className="text-xs text-zinc-400 bg-black border border-black-border rounded-xl px-3 py-2.5">
          V katalogu se nic nenašlo. Oprav přečtený text (stačí název a příjmení autora) a dej Hledat,
          nebo knihu zapiš ručně.
        </p>
      )}

      {results && results.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">
            Vyber svoje vydání ({results.length})
          </p>
          {results.map((book) => (
            <button
              key={book.id}
              onClick={() => onPick(book)}
              className="w-full text-left bg-black-card border border-black-border hover:border-wine-700 rounded-xl p-2.5 flex items-center gap-3 transition cursor-pointer group"
            >
              <div className="w-10 h-14 bg-black border border-zinc-800 rounded-md flex-shrink-0 overflow-hidden flex items-center justify-center">
                <CoverImage src={book.coverUrl} isbn={book.isbn} alt={book.title} iconSize={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate group-hover:text-wine-300">{book.title}</p>
                <p className="text-xs text-zinc-400 truncate">{book.author}</p>
                <p className="text-[11px] text-zinc-500 truncate">
                  {[book.publishYear !== 'Neuvedeno' && book.publishYear, book.publisher !== 'Neuvedeno' && book.publisher, book.isbn ? `ISBN ${book.isbn}` : 'bez ISBN']
                    .filter(Boolean).join(' · ')}
                </p>
              </div>
              <ChevronRight size={18} className="text-zinc-600 group-hover:text-wine-500 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
