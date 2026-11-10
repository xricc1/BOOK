import React, { useRef, useState } from 'react';
import {
  ScanText, Camera, Images, Search, X, LoaderCircle, Info, ChevronRight, Crop, RotateCcw,
} from 'lucide-react';
import { readBookPhoto } from '../services/ocrService';
import { buildQueries } from '../services/ocrText';
import { searchBooksByText, fetchBookByIsbn, isBookBarcode } from '../services/isbnService';
import { decodeImageFile } from '../services/barcodeScanner';
import { CoverImage } from './CoverImage';

const MIN_CROP = 0.03; // a marked area smaller than this (fraction of the photo) is a tap, not a selection

/**
 * The photo with a rectangle the user can draw over the title with a finger or mouse.
 * onChange receives { x, y, w, h } as fractions of the photo, or null.
 */
function CropArea({ src, crop, onChange, disabled }) {
  const boxRef = useRef(null);
  const startRef = useRef(null);

  const point = (e) => {
    const r = boxRef.current.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1),
      y: Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1),
    };
  };

  const down = (e) => {
    if (disabled) return;
    e.preventDefault();
    boxRef.current.setPointerCapture?.(e.pointerId);
    startRef.current = point(e);
    onChange(null);
  };
  const move = (e) => {
    if (!startRef.current) return;
    const p = point(e);
    const s = startRef.current;
    onChange({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const up = () => {
    startRef.current = null;
    if (crop && (crop.w < MIN_CROP || crop.h < MIN_CROP)) onChange(null);
  };

  return (
    <div
      ref={boxRef}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className={`relative inline-block max-w-full select-none overflow-hidden rounded-lg align-top ${disabled ? '' : 'cursor-crosshair'}`}
      style={{ touchAction: 'none' }}
    >
      <img src={src} alt="Vyfocená kniha" draggable={false} className="block max-w-full max-h-72 w-auto rounded-lg border border-zinc-800" />
      {crop && (
        <div
          className="absolute border-2 border-wine-400 bg-wine-500/15 rounded-sm shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] pointer-events-none"
          style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
        />
      )}
    </div>
  );
}

/**
 * Find a book without a barcode: take a photo of its spine or cover. A barcode or a printed
 * ISBN on the photo is used directly; otherwise the title and author are read (OCR in the
 * browser) and searched in Knihovny.cz. If the photo is busy, the user marks the title with a
 * finger and only that part is read. The read text can be corrected, or typed directly.
 */
export function PhotoRecognize({ onPick, onClose }) {
  const [photoUrl, setPhotoUrl] = useState(null);
  const [stage, setStage] = useState(null); // null | 'barcode' | 'download' | 'read' | 'search'
  const [progress, setProgress] = useState(0);
  const [searchStep, setSearchStep] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [crop, setCrop] = useState(null);
  const [readWhole, setReadWhole] = useState(false); // the whole photo has been read (vs. a marked part)
  const cameraInput = useRef(null);
  const galleryInput = useRef(null);
  const fileRef = useRef(null);
  const runId = useRef(0);

  const isCurrent = (id) => id === runId.current;

  const search = async (text, id = ++runId.current) => {
    const queries = buildQueries(text);
    if (!queries.length) {
      setError(photoUrl || fileRef.current
        ? 'Na fotce se nepodařilo přečíst název. Označ ho na fotce prstem, nebo ho napiš ručně.'
        : 'Napiš název knihy, případně i autora.');
      setStage(null);
      setResults(null);
      return;
    }
    setStage('search');
    setSearchStep(0);
    setError(null);
    setResults(null);
    try {
      const books = await searchBooksByText(queries, { onStep: (i) => isCurrent(id) && setSearchStep(i) });
      if (!isCurrent(id)) return;
      setResults(books);
    } catch (err) {
      if (!isCurrent(id)) return;
      setError(err.message);
    } finally {
      if (isCurrent(id)) setStage(null);
    }
  };

  /** A barcode or ISBN was found on the photo: look the book up directly. */
  const showIsbn = async (isbn, id) => {
    setStage('search');
    setSearchStep(0);
    try {
      const book = await fetchBookByIsbn(isbn);
      if (!isCurrent(id)) return true;
      setResults([book]);
      setStage(null);
      return true;
    } catch {
      return false; // not in the catalogs - fall back to reading the title
    }
  };

  const read = async (cropArea) => {
    const file = fileRef.current;
    if (!file) return;
    const id = ++runId.current;
    setResults(null);
    setError(null);
    setStage('read');
    setProgress(0);
    try {
      const result = await readBookPhoto(file, {
        crop: cropArea,
        onProgress: ({ stage: s, progress: p }) => {
          if (!isCurrent(id)) return;
          setStage(s);
          setProgress(p);
        },
      });
      if (!isCurrent(id)) return;
      if (!cropArea) setReadWhole(true);
      if (result.isbn && await showIsbn(result.isbn, id)) return;
      if (!isCurrent(id)) return;
      setQuery(result.query);
      await search(result.query, id);
    } catch (err) {
      if (!isCurrent(id)) return;
      console.warn('OCR failed:', err);
      setStage(null);
      setError('Rozpoznávání textu se nepodařilo spustit. Zkontroluj připojení k internetu (poprvé se stahuje) a zkus to znovu.');
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    fileRef.current = file;
    const id = ++runId.current;
    setPhotoUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    setCrop(null);
    setReadWhole(false);
    setResults(null);
    setError(null);
    setQuery('');

    // A photo of the back cover: the barcode is the most reliable way
    setStage('barcode');
    try {
      const code = await decodeImageFile(file, isBookBarcode);
      if (code && isCurrent(id) && await showIsbn(code, id)) return;
    } catch {
      // no barcode - read the text
    }
    if (isCurrent(id)) await read(null);
  };

  const busy = stage !== null;
  const stageText = {
    barcode: 'Hledám na fotce čárový kód…',
    download: `Stahuji rozpoznávání textu (jen poprvé)… ${Math.round(progress * 100)} %`,
    read: `Čtu text z fotky… ${Math.round(progress * 100)} %`,
    search: searchStep === 0 ? 'Hledám v katalogu Knihovny.cz…' : 'Zkouším hledat s tolerancí překlepů…',
  }[stage] || '';

  const nothingFound = results && results.length === 0;

  return (
    <div className="space-y-4 max-w-xl mx-auto min-w-0 w-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <ScanText size={17} className="text-wine-500" />
            Rozpoznat knihu z fotky
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Vyfoť obálku nebo hřbet zblízka, ať je název přes většinu fotky. Zadní strana s čárovým kódem funguje taky.
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

      {photoUrl && (
        <div className="bg-black border border-black-border rounded-xl p-3 space-y-3">
          <div className="text-center">
            <CropArea src={photoUrl} crop={crop} onChange={(c) => { setCrop(c); if (c) setError(null); }} disabled={busy} />
          </div>

          {busy ? (
            <div>
              <p className="text-xs text-zinc-300 flex items-center gap-2">
                <LoaderCircle size={14} className="animate-spin text-wine-400 shrink-0" />
                {stageText}
              </p>
              {(stage === 'download' || stage === 'read') && (
                <div className="h-1.5 bg-zinc-900 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-wine-600 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
              )}
            </div>
          ) : crop ? (
            <div className="flex gap-2">
              <button
                onClick={() => read(crop)}
                className="flex-1 flex items-center justify-center gap-2 bg-wine-700 hover:bg-wine-600 text-white font-semibold py-2.5 rounded-xl text-sm cursor-pointer min-h-[44px]"
              >
                <Crop size={16} />
                Přečíst označenou část
              </button>
              <button
                onClick={() => setCrop(null)}
                className="px-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-sm cursor-pointer min-h-[44px] flex items-center gap-1.5"
              >
                <RotateCcw size={14} />
                Zrušit
              </button>
            </div>
          ) : (
            <p className={`text-xs flex items-start gap-2 ${nothingFound || error ? 'text-wine-300' : 'text-zinc-400'}`}>
              <Crop size={14} className="shrink-0 mt-0.5" />
              {readWhole
                ? 'Nesedí to? Táhni prstem přes název (a autora) na fotce a přečte se jen to.'
                : 'Táhni prstem přes název na fotce, ať se čte jen to.'}
            </p>
          )}
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

      {nothingFound && (
        <p className="text-xs text-zinc-400 bg-black border border-black-border rounded-xl px-3 py-2.5">
          V katalogu se nic nenašlo. Označ na fotce jen název, nebo oprav text výš (stačí název
          a příjmení autora) a dej Hledat.
        </p>
      )}

      {results && results.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">
            {results.length === 1 ? 'Nalezená kniha' : `Vyber svoje vydání (${results.length})`}
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
