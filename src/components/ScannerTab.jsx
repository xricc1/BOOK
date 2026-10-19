import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, Search, Sparkles, Check, Edit2, AlertCircle, RefreshCw,
  BookOpen, BookmarkCheck, Upload, Zap, ZapOff, ZoomIn, Info, ExternalLink
} from 'lucide-react';
import {
  fetchBookByIsbn, cleanIsbn, isValidIsbn, isBookBarcode, normalizeIsbn, findSavedBookByIsbn, SAMPLE_BOOKS
} from '../services/isbnService';
import { CoverImage } from './CoverImage';
import {
  openCamera, stopStream, startScanLoop, decodeImageFile, GUIDE
} from '../services/barcodeScanner';

const NOT_A_BOOK_MESSAGE = 'Tento čárový kód nepatří knize. Hledej kód začínající 978 nebo 979, nebo zadej ISBN ručně.';

export function ScannerTab({ onBookSaved, onSwitchToLibrary }) {
  const [isbnInput, setIsbnInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notFoundIsbn, setNotFoundIsbn] = useState(null);
  const [searchingIn, setSearchingIn] = useState('');
  const [scannedBook, setScannedBook] = useState(null);
  const [existingDuplicate, setExistingDuplicate] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Camera capabilities & state
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 1, step: 0.1 });
  const [currentZoom, setCurrentZoom] = useState(1);
  const [scanTip, setScanTip] = useState('');

  const videoRef = useRef(null);
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const handleSearchRef = useRef(null);
  const tipTimerRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleSearch = useCallback(async (isbnToSearch, options = {}) => {
    const rawTarget = isbnToSearch || isbnInput;
    const targetIsbn = cleanIsbn(rawTarget);

    if (!targetIsbn) return;
    setNotFoundIsbn(null);

    if (options.fromScan && !isBookBarcode(targetIsbn)) {
      setError(NOT_A_BOOK_MESSAGE);
      setScannedBook(null);
      setExistingDuplicate(null);
      setLoading(false);
      return;
    }

    if (!isValidIsbn(targetIsbn) && !options.isSample) {
      setError('Zadané ISBN není platné. Zkontroluj číslo a zkus to znovu.');
      setScannedBook(null);
      setExistingDuplicate(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setScannedBook(null);
    setExistingDuplicate(null);
    setSaveSuccess(false);

    // Check duplicate in library first
    const savedMatch = findSavedBookByIsbn(targetIsbn);
    if (savedMatch) {
      setExistingDuplicate(savedMatch);
    }

    try {
      const book = await fetchBookByIsbn(targetIsbn, { ...options, onProgress: setSearchingIn });
      setScannedBook(book);
      setEditForm(book);
    } catch (err) {
      setError(err.message || 'Knihu se nepodařilo najít v dostupných katalozích.');
      if (err.code === 'NOT_FOUND') setNotFoundIsbn(normalizeIsbn(targetIsbn));
    } finally {
      setLoading(false);
    }
  }, [isbnInput]);

  // Keep the latest search function in a ref so the camera effect
  // does not restart every time the ISBN input changes
  useEffect(() => {
    handleSearchRef.current = handleSearch;
  }, [handleSearch]);

  // Handle dynamic tips based on scan duration
  const startTipRotation = () => {
    if (tipTimerRef.current) clearInterval(tipTimerRef.current);
    let seconds = 0;
    setScanTip('');

    tipTimerRef.current = setInterval(() => {
      seconds += 2;
      if (seconds >= 4 && seconds < 8) {
        setScanTip('Přibliž kód k fotoaparátu');
      } else if (seconds >= 8 && seconds < 12) {
        setScanTip('Drž telefon v klidu');
      } else if (seconds >= 12) {
        setScanTip('Zlepši osvětlení nebo uprav vzdálenost');
      }
    }, 2000);
  };

  const stopTipRotation = () => {
    if (tipTimerRef.current) {
      clearInterval(tipTimerRef.current);
      tipTimerRef.current = null;
    }
    setScanTip('');
  };

  // Camera start & scanning loop
  useEffect(() => {
    if (!isCameraActive) return undefined;

    let cancelled = false;
    let stopLoop = null;
    let stream = null;
    let lastRejectTip = 0;
    // The <video> is rendered while the camera is active, so the ref is set here
    const videoEl = videoRef.current;

    const start = async () => {
      try {
        const cam = await openCamera();
        if (cancelled) {
          stopStream(cam.stream);
          return;
        }
        stream = cam.stream;
        trackRef.current = cam.track;

        const video = videoEl;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => {});

        const caps = cam.capabilities;
        setTorchSupported(Boolean(caps.torch));
        if (caps.zoom) {
          setZoomSupported(true);
          setZoomRange({
            min: caps.zoom.min || 1,
            max: caps.zoom.max || 5,
            step: caps.zoom.step || 0.1,
          });
          setCurrentZoom(cam.zoom || caps.zoom.min || 1);
        }

        startTipRotation();
        stopLoop = startScanLoop(video, {
          isAccepted: isBookBarcode,
          getViewSize: () => {
            const box = viewportRef.current;
            return box ? { w: box.clientWidth, h: box.clientHeight } : null;
          },
          onReject: () => {
            // Throttle so the tip stays readable
            const now = Date.now();
            if (now - lastRejectTip > 3000) {
              lastRejectTip = now;
              setScanTip('Tohle není kód knihy (hledej 978/979)');
            }
          },
          onDetected: (code) => {
            if (cancelled) return;
            navigator.vibrate?.(80);
            setIsCameraActive(false);
            handleSearchRef.current?.(code, { fromScan: true });
          },
        });
      } catch (err) {
        if (cancelled) return;
        console.warn('Camera start failed:', err);
        setIsCameraActive(false);
        const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
        setError(denied
          ? 'Aplikace nemá přístup ke kameře. Povol ho v nastavení prohlížeče, nebo nahraj fotku kódu.'
          : 'Kameru se nepodařilo spustit. Zkus to znovu, nebo nahraj fotku kódu.');
      }
    };

    start();

    return () => {
      cancelled = true;
      stopLoop?.();
      stopTipRotation();
      stopStream(stream);
      trackRef.current = null;
      if (videoEl) videoEl.srcObject = null;
      setTorchSupported(false);
      setTorchOn(false);
      setZoomSupported(false);
    };
  }, [isCameraActive]);

  // Torch toggle handler
  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      const nextState = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: nextState }] });
      setTorchOn(nextState);
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  // Zoom change handler
  const handleZoomChange = async (e) => {
    const zoomVal = parseFloat(e.target.value);
    setCurrentZoom(zoomVal);
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: zoomVal }] });
    } catch (err) {
      console.warn('Zoom change failed:', err);
    }
  };

  // Photo Upload scan
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setNotFoundIsbn(null);
    setScannedBook(null);
    setExistingDuplicate(null);

    try {
      const code = await decodeImageFile(file, isBookBarcode);
      if (code) {
        await handleSearch(code, { fromScan: true });
      } else {
        setLoading(false);
        setError('Na fotce se nepodařilo najít čárový kód knihy. Vyfoť kód zblízka, ostře a celý, nebo zadej ISBN ručně.');
      }
    } catch (err) {
      console.warn('Photo scan failed:', err);
      setLoading(false);
      setError('Fotku se nepodařilo zpracovat. Zkus jinou fotku nebo ruční zadání ISBN.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Book not in any catalog: start an empty record with the ISBN and open the editor
  const handleAddManually = () => {
    if (!notFoundIsbn) return;
    const book = {
      id: `book-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      isbn: notFoundIsbn,
      title: '',
      author: '',
      genre: '',
      publishYear: '',
      pageCount: '',
      publisher: '',
      description: '',
      coverUrl: null,
      catalogSource: 'Ruční zadání',
      addedAt: new Date().toISOString(),
    };
    setError(null);
    setNotFoundIsbn(null);
    setScannedBook(book);
    setEditForm(book);
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!scannedBook) return;
    const finalBook = { ...scannedBook, ...editForm };
    if (!String(finalBook.title || '').trim()) {
      setIsEditing(true);
      setError('Vyplň aspoň název knihy, pak ji můžeš uložit.');
      return;
    }
    setError(null);
    onBookSaved(finalBook);
    setSaveSuccess(true);
    setIsEditing(false);

    // Update local state if it was a duplicate
    const updatedSaved = findSavedBookByIsbn(finalBook.isbn);
    if (updatedSaved) setExistingDuplicate(updatedSaved);

    setTimeout(() => {
      setSaveSuccess(false);
    }, 3000);
  };

  const handleSampleClick = (isbn) => {
    setIsbnInput(isbn);
    handleSearch(isbn, { isSample: true });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5 sm:space-y-8">
      {/* Header section */}
      <div className="text-center space-y-1.5 sm:space-y-2">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-wine-700/50 bg-wine-900/20 text-wine-400 text-[11px] sm:text-xs font-medium tracking-wider uppercase"
        >
          <Sparkles size={13} className="text-wine-500" />
          Skenování ISBN
        </motion.div>
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
          Naskenujte čárový kód knížky
        </h1>
        <p className="text-zinc-400 text-xs sm:text-base max-w-lg mx-auto px-2">
          Okamžitě zjistěte název, autora a žánr. Podpora EAN-13 čárových kódů a českých katalogů.
        </p>
      </div>

      {/* Main Scanner Card */}
      <div className="bg-black-card border border-black-border rounded-2xl p-4 sm:p-8 space-y-5 shadow-2xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-wine-700/10 rounded-full blur-3xl pointer-events-none" />

        {/* Camera active area */}
        {isCameraActive ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-3 max-w-md mx-auto"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-wine-400 flex items-center gap-2">
                <Camera size={15} />
                Kamera aktivní (EAN-13)
              </h3>
              <button
                onClick={() => setIsCameraActive(false)}
                className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 rounded-lg border border-zinc-800 transition cursor-pointer touch-manipulation min-h-[36px]"
              >
                Zavřít kameru
              </button>
            </div>

            {/* Video Viewport Container */}
            <div
              ref={viewportRef}
              className="relative overflow-hidden rounded-xl border border-wine-700/60 bg-black aspect-[4/3] w-full"
            >
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                muted
                playsInline
              />

              {/* Aim guide: the scanner reads this area at full camera resolution */}
              <div className="absolute inset-0 pointer-events-none">
                <div
                  className="absolute border-2 border-white/90 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                  style={{
                    left: `${GUIDE.left * 100}%`,
                    right: `${(1 - GUIDE.right) * 100}%`,
                    top: `${GUIDE.top * 100}%`,
                    bottom: `${(1 - GUIDE.bottom) * 100}%`,
                  }}
                >
                  <div className="absolute left-2 right-2 top-1/2 h-0.5 -translate-y-1/2 bg-wine-500 shadow-[0_0_8px_2px_rgba(190,30,60,0.7)] animate-pulse" />
                </div>
                <p className="absolute top-3 left-0 right-0 text-center text-[11px] text-white/85 font-medium">
                  Namiř čárový kód do rámečku
                </p>
              </div>

              {/* On-screen Tip Overlay */}
              {scanTip && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md text-wine-300 border border-wine-800/80 text-xs font-medium px-3.5 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 animate-pulse z-10 pointer-events-none">
                  <Info size={14} className="text-wine-400 shrink-0" />
                  <span>{scanTip}</span>
                </div>
              )}
            </div>

            {/* Camera Controls (Torch & Zoom) */}
            {(torchSupported || zoomSupported) && (
              <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-300">
                {torchSupported && (
                  <button
                    onClick={toggleTorch}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition cursor-pointer min-h-[36px] ${
                      torchOn
                        ? 'bg-wine-900/60 text-white border-wine-600'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                    }`}
                  >
                    {torchOn ? <Zap size={16} className="text-yellow-400 fill-yellow-400" /> : <ZapOff size={16} />}
                    <span>{torchOn ? 'Světlo zapnuto' : 'Zapnout světlo'}</span>
                  </button>
                )}

                {zoomSupported && (
                  <div className="flex items-center gap-2.5 flex-1 min-w-[180px]">
                    <ZoomIn size={16} className="text-wine-400 shrink-0" />
                    <span className="text-[11px] font-mono text-zinc-400 shrink-0">Zoom:</span>
                    <input
                      type="range"
                      min={zoomRange.min}
                      max={zoomRange.max}
                      step={zoomRange.step}
                      value={currentZoom}
                      onChange={handleZoomChange}
                      className="w-full accent-wine-600 cursor-pointer"
                    />
                    <span className="text-[11px] font-mono text-zinc-300 shrink-0">{currentZoom.toFixed(1)}x</span>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        ) : (
          /* Action Buttons: Camera & Photo Upload */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => setIsCameraActive(true)}
              className="flex items-center justify-center gap-3 bg-wine-700 hover:bg-wine-600 text-white font-medium py-3.5 px-5 rounded-xl transition duration-200 shadow-lg shadow-wine-900/40 group cursor-pointer touch-manipulation min-h-[48px]"
            >
              <Camera size={20} className="group-hover:scale-110 transition-transform" />
              <span>Spustit fotoaparát</span>
            </button>

            <label className="flex items-center justify-center gap-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 hover:border-wine-800/80 font-medium py-3.5 px-5 rounded-xl transition duration-200 cursor-pointer touch-manipulation min-h-[48px]">
              <Upload size={20} className="text-wine-400" />
              <span>Nahrát fotku kódu</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </label>
          </div>
        )}

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-black-border"></div>
          <span className="flex-shrink mx-3 text-[10px] sm:text-xs font-mono uppercase tracking-widest text-zinc-500">nebo zadejte ručně</span>
          <div className="flex-grow border-t border-black-border"></div>
        </div>

        {/* Manual Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <div className="relative flex-1">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Zadejte ISBN (např. 9788020712341)..."
              value={isbnInput}
              onChange={(e) => setIsbnInput(e.target.value)}
              className="w-full bg-black border border-black-border focus:border-wine-500 focus:ring-1 focus:ring-wine-500 text-white rounded-xl px-4 py-3 text-sm placeholder-zinc-600 outline-none transition font-mono min-h-[48px]"
            />
            {isbnInput && (
              <button
                type="button"
                onClick={() => setIsbnInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-sm p-1.5 cursor-pointer touch-manipulation"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !isbnInput.trim()}
            className="bg-white text-black hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed font-semibold py-3 px-6 rounded-xl transition flex items-center justify-center gap-2 text-sm cursor-pointer min-h-[48px] touch-manipulation"
          >
            {loading ? (
              <RefreshCw size={18} className="animate-spin text-wine-700" />
            ) : (
              <Search size={18} />
            )}
            Vyhledat
          </button>
        </form>

        {/* Quick Sample ISBN Buttons */}
        <div className="space-y-2 pt-1">
          <div className="text-[11px] sm:text-xs text-zinc-500 uppercase tracking-wider font-medium">
            Rychlé vyzkoušení (ukázková ISBN):
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(SAMPLE_BOOKS).map(([isbn, book]) => (
              <button
                key={isbn}
                onClick={() => handleSampleClick(isbn)}
                className="text-xs bg-black hover:bg-zinc-900 text-zinc-300 hover:text-white border border-black-border hover:border-wine-800 py-2 px-3 rounded-lg transition flex items-center gap-1.5 font-mono cursor-pointer touch-manipulation min-h-[36px]"
              >
                <BookOpen size={13} className="text-wine-500 shrink-0" />
                <span>{book.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading indicator */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center justify-center py-10 space-y-3"
          >
            <div className="w-10 h-10 border-4 border-wine-900 border-t-wine-500 rounded-full animate-spin" />
            <p className="text-xs sm:text-sm text-zinc-400 font-medium animate-pulse">
              {searchingIn ? `Hledám v katalogu ${searchingIn}…` : 'Hledám v katalozích…'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state */}
      {error && !loading && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-wine-950/80 border border-wine-700/80 rounded-2xl p-4 text-white flex items-start gap-3 shadow-xl"
        >
          <AlertCircle className="text-wine-400 shrink-0 mt-0.5" size={20} />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-white">Chyba při vyhledávání</h4>
            <p className="text-xs text-zinc-300 leading-relaxed">{error}</p>
            {notFoundIsbn && (
              <button
                onClick={handleAddManually}
                className="mt-2 inline-flex items-center gap-1.5 text-xs bg-wine-700 hover:bg-wine-600 text-white font-medium px-3 py-2 rounded-lg transition cursor-pointer touch-manipulation min-h-[36px]"
              >
                <Edit2 size={13} />
                Přidat knihu ručně (ISBN {notFoundIsbn})
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* Duplicate warning notification */}
      {existingDuplicate && scannedBook && !loading && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-950/40 border border-amber-600/60 rounded-2xl p-4 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg"
        >
          <div className="flex items-center gap-3">
            <Info className="text-amber-400 shrink-0" size={20} />
            <div>
              <p className="text-xs sm:text-sm font-medium text-amber-200">
                Tato kniha již je ve vaší knihovně.
              </p>
              <p className="text-[11px] text-amber-300/80">
                Uložená kniha: "{existingDuplicate.title}" ({existingDuplicate.author})
              </p>
            </div>
          </div>

          {onSwitchToLibrary && (
            <button
              onClick={onSwitchToLibrary}
              className="text-xs bg-amber-900/60 hover:bg-amber-800 text-amber-100 border border-amber-600/80 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <span>Zobrazit v knihovně</span>
              <ExternalLink size={13} />
            </button>
          )}
        </motion.div>
      )}

      {/* Book Result Card */}
      <AnimatePresence>
        {scannedBook && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="bg-black-card border-2 border-wine-700/80 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl relative"
          >
            {/* Header info */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-black-border pb-4">
              <div className="space-y-1">
                <span className="text-xs font-mono text-wine-400 uppercase tracking-widest block">
                  Detail naskenované knihy
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono bg-zinc-900 text-zinc-300 px-2.5 py-1 rounded-md border border-zinc-800">
                    ISBN: {scannedBook.isbn}
                  </span>
                  {scannedBook.catalogSource && (
                    <span className="text-xs font-medium bg-wine-950 text-wine-300 px-2.5 py-1 rounded-md border border-wine-800/80">
                      Zdroj: {scannedBook.catalogSource}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => setIsEditing(!isEditing)}
                className="flex items-center gap-1.5 text-xs bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg border border-zinc-800 transition cursor-pointer"
              >
                <Edit2 size={14} className="text-wine-400" />
                {isEditing ? 'Zrušit úpravy' : 'Upravit údaje'}
              </button>
            </div>

            {/* Editable or Display View */}
            {isEditing ? (
              <div className="space-y-3.5 text-left">
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1">Název knihy</label>
                  <input
                    type="text"
                    value={editForm.title || ''}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="w-full bg-black border border-black-border focus:border-wine-500 text-white rounded-lg px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-zinc-400 block mb-1">Autor</label>
                    <input
                      type="text"
                      value={editForm.author || ''}
                      onChange={(e) => setEditForm({ ...editForm, author: e.target.value })}
                      className="w-full bg-black border border-black-border focus:border-wine-500 text-white rounded-lg px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-400 block mb-1">Žánr / Kategorie</label>
                    <input
                      type="text"
                      value={editForm.genre || ''}
                      onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}
                      className="w-full bg-black border border-black-border focus:border-wine-500 text-white rounded-lg px-3 py-2 text-sm outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-zinc-400 block mb-1">Rok vydání</label>
                    <input
                      type="text"
                      value={editForm.publishYear || ''}
                      onChange={(e) => setEditForm({ ...editForm, publishYear: e.target.value })}
                      className="w-full bg-black border border-black-border focus:border-wine-500 text-white rounded-lg px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-400 block mb-1">Počet stran</label>
                    <input
                      type="text"
                      value={editForm.pageCount || ''}
                      onChange={(e) => setEditForm({ ...editForm, pageCount: e.target.value })}
                      className="w-full bg-black border border-black-border focus:border-wine-500 text-white rounded-lg px-3 py-2 text-sm outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1">Popis</label>
                  <textarea
                    rows={3}
                    value={editForm.description || ''}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full bg-black border border-black-border focus:border-wine-500 text-white rounded-lg px-3 py-2 text-sm outline-none resize-none"
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-row gap-4 sm:gap-6 items-start">
                {/* Cover Image or Placeholder */}
                <div className="w-24 h-36 sm:w-36 sm:h-52 bg-black border border-wine-900 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center relative shadow-lg">
                  <CoverImage
                    src={scannedBook.coverUrl}
                    alt={scannedBook.title}
                    iconSize={32}
                    label="Bez obálky"
                  />
                </div>

                {/* Details */}
                <div className="flex-1 space-y-2.5 text-left min-w-0">
                  <div>
                    <span className="inline-block text-[10px] font-mono bg-wine-950 text-wine-400 border border-wine-800/80 px-2 py-0.5 rounded mb-1 uppercase">
                      {scannedBook.genre || 'Kniha'}
                    </span>
                    <h2 className="text-lg sm:text-2xl font-bold text-white tracking-tight leading-snug break-words">
                      {editForm.title || scannedBook.title}
                    </h2>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm text-zinc-300">
                    <div>
                      <span className="text-zinc-500 text-[10px] sm:text-xs block">Autor</span>
                      <span className="font-semibold text-white">{editForm.author || scannedBook.author}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px] sm:text-xs block">Rok</span>
                      <span>{editForm.publishYear || scannedBook.publishYear}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-black-border/60">
                    <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3 sm:line-clamp-4">
                      {editForm.description || scannedBook.description}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="pt-4 border-t border-black-border flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleSave}
                className="flex-1 bg-wine-700 hover:bg-wine-600 text-white font-semibold py-3 px-6 rounded-xl transition duration-200 flex items-center justify-center gap-2 shadow-lg shadow-wine-900/30 cursor-pointer min-h-[48px]"
              >
                {saveSuccess ? (
                  <>
                    <BookmarkCheck size={18} className="text-white animate-bounce" />
                    <span>Uloženo do knihovny!</span>
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    <span>{existingDuplicate ? 'Aktualizovat v mojí knihovně' : 'Uložit do mojí knihovny'}</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
