import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ScanBarcode, X, Zap, ZapOff, Volume2, VolumeX, CircleCheck, CircleX, CopyCheck, LoaderCircle,
  RotateCw, Keyboard, Library, Save, Info,
} from 'lucide-react';
import {
  fetchBookByIsbn, cleanIsbn, isValidIsbn, isBookBarcode, normalizeIsbn, findSavedBookByIsbn,
} from '../services/isbnService';
import { openCamera, stopStream, startScanLoop, GUIDE } from '../services/barcodeScanner';
import { CoverImage } from './CoverImage';

// The same code seen again within this time is ignored (the camera keeps seeing it while you move on)
const SAME_CODE_PAUSE_MS = 2500;
// Short pause after every code, so the next book is not read while still moving
const AFTER_SCAN_PAUSE_MS = 600;

/** Short beeps for feedback without looking at the screen. */
function createBeeper() {
  let ctx = null;
  const ensure = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };
  const tone = (freq, start, length) => {
    const c = ensure();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = c.currentTime + start;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + length + 0.02);
  };
  return {
    unlock: ensure,
    ok: () => tone(1320, 0, 0.12),
    repeat: () => { tone(880, 0, 0.08); tone(880, 0.12, 0.08); },
    bad: () => tone(220, 0, 0.3),
    close: () => { if (ctx) ctx.close().catch(() => {}); ctx = null; },
  };
}

const STATUS = {
  searching: { label: 'Hledám…', className: 'text-zinc-400', Icon: LoaderCircle, spin: true },
  saved: { label: 'Uloženo', className: 'text-emerald-400', Icon: CircleCheck },
  duplicate: { label: 'Už v knihovně', className: 'text-amber-400', Icon: CopyCheck },
  notFound: { label: 'Nenalezeno', className: 'text-wine-400', Icon: CircleX },
  error: { label: 'Chyba připojení', className: 'text-wine-400', Icon: CircleX },
  placeholder: { label: 'Uloženo k doplnění', className: 'text-sky-400', Icon: Save },
};

/**
 * Fast scanning for many books in a row: the camera stays on, every book barcode
 * is looked up in the background and saved to the library straight away.
 * Also works with USB / Bluetooth barcode readers (they type the code and press Enter).
 */
export function BatchScanner({ onBookSaved, onClose, onSwitchToLibrary }) {
  const [items, setItems] = useState([]); // newest first: { isbn, status, book, message }
  const [cameraOn, setCameraOn] = useState(true);
  const [cameraError, setCameraError] = useState(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [flash, setFlash] = useState(null); // { kind, text }
  const [typed, setTyped] = useState('');

  const videoRef = useRef(null);
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const [beeper] = useState(createBeeper);
  const beeperRef = useRef(beeper);
  const soundOnRef = useRef(true);
  const seenRef = useRef(new Set()); // ISBNs handled in this session
  const lastCodeRef = useRef({ code: null, at: 0 });
  const queueRef = useRef([]);
  const workingRef = useRef(false);
  const flashTimerRef = useRef(null);

  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);
  useEffect(() => () => {
    beeperRef.current?.close();
    clearTimeout(flashTimerRef.current);
  }, []);

  const feedback = useCallback((kind, text) => {
    if (soundOnRef.current) beeperRef.current?.[kind === 'ok' ? 'ok' : kind === 'repeat' ? 'repeat' : 'bad']();
    navigator.vibrate?.(kind === 'ok' ? 60 : [60, 60, 60]);
    clearTimeout(flashTimerRef.current);
    setFlash({ kind, text, id: Date.now() });
    flashTimerRef.current = setTimeout(() => setFlash(null), 1400);
  }, []);

  const updateItem = (isbn, patch) => {
    setItems(list => list.map(it => (it.isbn === isbn ? { ...it, ...patch } : it)));
  };

  // Look books up one after another, so the catalogs are not flooded
  const runQueue = useCallback(async () => {
    if (workingRef.current) return;
    workingRef.current = true;
    while (queueRef.current.length) {
      const isbn = queueRef.current.shift();
      try {
        const book = await fetchBookByIsbn(isbn);
        onBookSaved({ ...book, isbn: book.isbn || isbn });
        updateItem(isbn, { status: 'saved', book });
      } catch (err) {
        updateItem(isbn, {
          status: err.code === 'NOT_FOUND' ? 'notFound' : 'error',
          message: err.message,
        });
      }
    }
    workingRef.current = false;
  }, [onBookSaved]);

  const enqueue = useCallback((isbn) => {
    queueRef.current.push(isbn);
    runQueue();
  }, [runQueue]);

  /** A code arrived from the camera or a reader. Returns true when it was a book code. */
  const handleCode = useCallback((raw, { fromCamera = false } = {}) => {
    const code = cleanIsbn(raw);
    if (!code) return false;

    const now = Date.now();
    if (fromCamera && lastCodeRef.current.code === code && now - lastCodeRef.current.at < SAME_CODE_PAUSE_MS) {
      return false;
    }
    lastCodeRef.current = { code, at: now };

    if (!isBookBarcode(code) && !(code.length === 10 && isValidIsbn(code))) {
      feedback('bad', 'Tohle není kód knihy (978 / 979)');
      return false;
    }

    const isbn = normalizeIsbn(code);
    if (seenRef.current.has(isbn)) {
      feedback('repeat', 'Tuhle knihu už jsi naskenoval');
      return true;
    }
    seenRef.current.add(isbn);

    const saved = findSavedBookByIsbn(isbn);
    if (saved) {
      setItems(list => [{ isbn, status: 'duplicate', book: saved }, ...list]);
      feedback('repeat', `Už v knihovně: ${saved.title}`);
      return true;
    }

    setItems(list => [{ isbn, status: 'searching' }, ...list]);
    feedback('ok', `Načteno ${isbn}`);
    enqueue(isbn);
    return true;
  }, [enqueue, feedback]);

  const handleCodeRef = useRef(handleCode);
  useEffect(() => { handleCodeRef.current = handleCode; }, [handleCode]);

  // Camera: keep scanning, restart the loop after every detected code
  useEffect(() => {
    if (!cameraOn) return undefined;
    let cancelled = false;
    let stopLoop = null;
    let restartTimer = null;
    let stream = null;
    let wakeLock = null;
    const videoEl = videoRef.current;

    const loop = () => {
      if (cancelled || !videoEl) return;
      stopLoop = startScanLoop(videoEl, {
        isAccepted: () => true, // every code is judged in handleCode (and gets feedback there)
        getViewSize: () => {
          const box = viewportRef.current;
          return box ? { w: box.clientWidth, h: box.clientHeight } : null;
        },
        onDetected: (code) => {
          if (cancelled) return;
          const wasBook = handleCodeRef.current(code, { fromCamera: true });
          restartTimer = setTimeout(loop, wasBook ? AFTER_SCAN_PAUSE_MS : 150);
        },
      });
    };

    const start = async () => {
      try {
        const cam = await openCamera();
        if (cancelled) {
          stopStream(cam.stream);
          return;
        }
        stream = cam.stream;
        trackRef.current = cam.track;
        if (!videoEl) return;
        videoEl.srcObject = stream;
        await videoEl.play().catch(() => {});
        setTorchSupported(Boolean(cam.capabilities?.torch));
        setCameraError(null);
        // Keep the screen on while scanning a whole shelf
        wakeLock = await navigator.wakeLock?.request('screen').catch(() => null);
        loop();
      } catch (err) {
        if (cancelled) return;
        const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
        setCameraError(denied
          ? 'Aplikace nemá přístup ke kameře. Povol ho v nastavení prohlížeče, nebo použij čtečku kódů.'
          : 'Kameru se nepodařilo spustit. Můžeš použít čtečku kódů nebo psát ISBN.');
        setCameraOn(false);
      }
    };

    start();

    return () => {
      cancelled = true;
      clearTimeout(restartTimer);
      stopLoop?.();
      stopStream(stream);
      trackRef.current = null;
      wakeLock?.release?.().catch(() => {});
      if (videoEl) videoEl.srcObject = null;
      setTorchSupported(false);
      setTorchOn(false);
    };
  }, [cameraOn]);

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(!torchOn);
    } catch {
      // torch not available after all
    }
  };

  // USB / Bluetooth readers type the code and press Enter; typing by hand works the same way
  const submitTyped = (e) => {
    e.preventDefault();
    beeperRef.current?.unlock();
    if (typed.trim()) handleCode(typed);
    setTyped('');
  };

  const retry = (isbn) => {
    updateItem(isbn, { status: 'searching', message: null });
    enqueue(isbn);
  };

  const notFound = items.filter(it => it.status === 'notFound');
  const saveNotFound = () => {
    for (const it of notFound) {
      onBookSaved({
        id: `book-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        isbn: it.isbn,
        title: `Nenalezená kniha (ISBN ${it.isbn})`,
        author: '',
        genre: 'K doplnění',
        publishYear: '',
        pageCount: '',
        publisher: '',
        description: 'Kniha se nenašla v katalozích. Doplň údaje v knihovně.',
        coverUrl: null,
        catalogSource: 'Rychlé skenování – k doplnění',
        addedAt: new Date().toISOString(),
      });
      updateItem(it.isbn, { status: 'placeholder' });
    }
  };

  const count = (status) => items.filter(it => it.status === status).length;
  const savedCount = count('saved') + count('placeholder');
  const searching = count('searching');

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-wine-700/50 bg-wine-900/20 text-wine-400 text-[11px] sm:text-xs font-medium tracking-wider uppercase mb-1">
            <ScanBarcode size={13} className="text-wine-500" />
            Rychlé skenování
          </div>
          <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight text-white">Projížděj kódy za sebou</h1>
          <p className="text-zinc-400 text-xs sm:text-sm">
            Každá nalezená kniha se rovnou uloží do knihovny. Pípnutí = načteno.
          </p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white px-3 py-2 bg-zinc-900 hover:bg-zinc-800 rounded-lg border border-zinc-800 transition cursor-pointer touch-manipulation min-h-[40px]"
        >
          <X size={14} />
          Hotovo
        </button>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ['Naskenováno', items.length, 'text-white'],
          ['Uloženo', savedCount, 'text-emerald-400'],
          ['Už v knihovně', count('duplicate'), 'text-amber-400'],
          ['Nenalezeno', notFound.length + count('error'), 'text-wine-400'],
        ].map(([label, value, color]) => (
          <div key={label} className="bg-black-card border border-black-border rounded-xl py-2 px-1">
            <div className={`text-lg sm:text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-[9px] sm:text-[11px] text-zinc-500 uppercase tracking-wide leading-tight">{label}</div>
          </div>
        ))}
      </div>

      {/* Camera */}
      <div className="bg-black-card border border-black-border rounded-2xl p-3 sm:p-4 space-y-3 shadow-xl">
        {cameraOn ? (
          <div ref={viewportRef} className="relative overflow-hidden rounded-xl border border-wine-700/60 bg-black aspect-[4/3] w-full">
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay muted playsInline />
            <div className="absolute inset-0 pointer-events-none">
              <div
                className={`absolute border-2 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] transition-colors duration-150 ${
                  flash?.kind === 'ok' ? 'border-emerald-400' : flash?.kind === 'repeat' ? 'border-amber-400' : flash ? 'border-red-500' : 'border-white/90'
                }`}
                style={{
                  left: `${GUIDE.left * 100}%`,
                  right: `${(1 - GUIDE.right) * 100}%`,
                  top: `${GUIDE.top * 100}%`,
                  bottom: `${(1 - GUIDE.bottom) * 100}%`,
                }}
              >
                <div className="absolute left-2 right-2 top-1/2 h-0.5 -translate-y-1/2 bg-wine-500 shadow-[0_0_8px_2px_rgba(190,30,60,0.7)] animate-pulse" />
              </div>
            </div>
            <AnimatePresence>
              {flash && (
                <motion.div
                  key={flash.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`absolute bottom-3 left-3 right-3 text-center text-xs sm:text-sm font-semibold px-3 py-2 rounded-xl backdrop-blur-md truncate ${
                    flash.kind === 'ok' ? 'bg-emerald-950/85 text-emerald-200' : flash.kind === 'repeat' ? 'bg-amber-950/85 text-amber-200' : 'bg-red-950/85 text-red-200'
                  }`}
                >
                  {flash.text}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="text-center py-6 space-y-3">
            {cameraError && <p className="text-xs text-wine-300 px-4">{cameraError}</p>}
            <button
              onClick={() => { beeperRef.current?.unlock(); setCameraOn(true); }}
              className="inline-flex items-center gap-2 bg-wine-700 hover:bg-wine-600 text-white font-medium py-2.5 px-4 rounded-xl transition cursor-pointer touch-manipulation min-h-[44px] text-sm"
            >
              <ScanBarcode size={18} />
              Zapnout kameru
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {cameraOn && (
            <button
              onClick={() => setCameraOn(false)}
              className="text-xs text-zinc-400 hover:text-white px-3 py-2 bg-zinc-900 hover:bg-zinc-800 rounded-lg border border-zinc-800 transition cursor-pointer min-h-[36px]"
            >
              Vypnout kameru
            </button>
          )}
          {torchSupported && (
            <button
              onClick={toggleTorch}
              className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition cursor-pointer min-h-[36px] ${
                torchOn ? 'bg-wine-900/60 text-white border-wine-600' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
              }`}
            >
              {torchOn ? <Zap size={14} className="text-yellow-400 fill-yellow-400" /> : <ZapOff size={14} />}
              Světlo
            </button>
          )}
          <button
            onClick={() => { beeperRef.current?.unlock(); setSoundOn(!soundOn); }}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white transition cursor-pointer min-h-[36px]"
          >
            {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
            {soundOn ? 'Zvuk zapnutý' : 'Zvuk vypnutý'}
          </button>
        </div>

        {/* Feedback for the barcode reader / typing when the camera is off */}
        {!cameraOn && flash && (
          <div
            key={flash.id}
            className={`text-center text-xs sm:text-sm font-semibold px-3 py-2 rounded-xl truncate ${
              flash.kind === 'ok' ? 'bg-emerald-950/85 text-emerald-200' : flash.kind === 'repeat' ? 'bg-amber-950/85 text-amber-200' : 'bg-red-950/85 text-red-200'
            }`}
          >
            {flash.text}
          </div>
        )}

        {/* Reader / typed input */}
        <form onSubmit={submitTyped} className="flex gap-2">
          <div className="relative flex-1">
            <Keyboard size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              inputMode="numeric"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Čtečka kódů nebo ISBN + Enter"
              className="w-full bg-black border border-black-border focus:border-wine-500 text-white rounded-xl pl-9 pr-3 py-2.5 text-sm placeholder-zinc-600 outline-none font-mono min-h-[44px]"
            />
          </div>
          <button
            type="submit"
            disabled={!typed.trim()}
            className="bg-white text-black hover:bg-zinc-200 disabled:opacity-40 font-semibold px-4 rounded-xl text-sm cursor-pointer min-h-[44px]"
          >
            Přidat
          </button>
        </form>
      </div>

      {/* Not found -> save for later */}
      {notFound.length > 0 && searching === 0 && (
        <div className="bg-wine-950/60 border border-wine-800/70 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-zinc-300 flex items-start gap-2">
            <Info size={15} className="text-wine-400 shrink-0 mt-0.5" />
            {notFound.length === 1 ? '1 kniha se nenašla'
              : notFound.length <= 4 ? `${notFound.length} knihy se nenašly` : `${notFound.length} knih se nenašlo`} v katalozích.{notFound.length === 1 ? ' Můžeš ji' : ' Můžeš je'} uložit s ISBN a údaje doplnit později v knihovně.
          </p>
          <button
            onClick={saveNotFound}
            className="shrink-0 flex items-center justify-center gap-1.5 text-xs bg-wine-700 hover:bg-wine-600 text-white font-medium px-3 py-2 rounded-lg transition cursor-pointer min-h-[38px]"
          >
            <Save size={14} />
            Uložit k doplnění
          </button>
        </div>
      )}

      {/* Scanned list */}
      {items.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Naskenované knihy {searching > 0 && <span className="text-zinc-500 normal-case">(dohledávám {searching}…)</span>}
            </h3>
            {onSwitchToLibrary && savedCount > 0 && (
              <button
                onClick={onSwitchToLibrary}
                className="flex items-center gap-1.5 text-xs text-wine-300 hover:text-white cursor-pointer"
              >
                <Library size={14} />
                Otevřít knihovnu
              </button>
            )}
          </div>
          <AnimatePresence initial={false}>
            {items.map((it) => {
              const st = STATUS[it.status];
              return (
                <motion.div
                  key={it.isbn}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-black-card border border-black-border rounded-xl p-2.5 flex items-center gap-3"
                >
                  <div className="w-10 h-14 bg-black border border-zinc-800 rounded-md flex-shrink-0 overflow-hidden flex items-center justify-center">
                    <CoverImage src={it.book?.coverUrl} isbn={it.isbn} alt={it.book?.title || it.isbn} iconSize={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {it.book?.title || (it.status === 'searching' ? 'Dohledávám údaje…' : `ISBN ${it.isbn}`)}
                    </p>
                    <p className="text-xs text-zinc-400 truncate">
                      {it.book?.author || <span className="font-mono">{it.isbn}</span>}
                    </p>
                  </div>
                  <div className={`flex items-center gap-1.5 text-[11px] sm:text-xs font-medium shrink-0 ${st.className}`}>
                    <st.Icon size={15} className={st.spin ? 'animate-spin' : ''} />
                    <span>{st.label}</span>
                    {it.status === 'error' && (
                      <button
                        onClick={() => retry(it.isbn)}
                        className="ml-1 p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                        title="Zkusit znovu"
                      >
                        <RotateCw size={13} />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      ) : (
        <p className="text-center text-xs text-zinc-500 py-4">
          Zatím nic. Namiř kameru na čárový kód knihy, nebo načti kód čtečkou.
        </p>
      )}
    </div>
  );
}
