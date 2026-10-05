import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, Search, Sparkles, Check, Edit2, AlertCircle, RefreshCw, BookOpen, BookmarkCheck } from 'lucide-react';
import { fetchBookByIsbn, SAMPLE_BOOKS } from '../services/isbnService';

export function ScannerTab({ onBookSaved }) {
  const [isbnInput, setIsbnInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scannedBook, setScannedBook] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSearch = useCallback(async (isbnToSearch) => {
    const targetIsbn = isbnToSearch || isbnInput;
    if (!targetIsbn || !targetIsbn.trim()) return;

    setLoading(true);
    setError(null);
    setScannedBook(null);
    setSaveSuccess(false);

    try {
      const book = await fetchBookByIsbn(targetIsbn.trim());
      setScannedBook(book);
      setEditForm(book);
    } catch (err) {
      setError(err.message || 'Nepodařilo se načíst informace o knize.');
    } finally {
      setLoading(false);
    }
  }, [isbnInput]);

  // Initialize barcode scanner when camera is activated
  useEffect(() => {
    let scanner = null;
    if (isCameraActive) {
      const config = {
        fps: 10,
        qrbox: { width: 280, height: 160 },
        aspectRatio: 1.777778,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
        ]
      };

      scanner = new Html5QrcodeScanner("reader", config, false);

      scanner.render(
        (decodedText) => {
          scanner.clear();
          setIsCameraActive(false);
          handleSearch(decodedText);
        },
        () => {
          // Ignore scan errors during searching
        }
      );
    }

    return () => {
      if (scanner) {
        scanner.clear().catch(err => console.error("Failed to clear scanner", err));
      }
    };
  }, [isCameraActive, handleSearch]);

  const handleSave = () => {
    if (!scannedBook) return;
    const finalBook = { ...scannedBook, ...editForm };
    onBookSaved(finalBook);
    setSaveSuccess(true);
    setIsEditing(false);

    setTimeout(() => {
      setSaveSuccess(false);
    }, 3000);
  };

  const handleSampleClick = (isbn) => {
    setIsbnInput(isbn);
    handleSearch(isbn);
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
          Okamžitě zjistěte název, autora a žánr. Vše v čistém, elegantním vínovém vzhledu.
        </p>
      </div>

      {/* Camera / Manual Input Card */}
      <div className="bg-black-card border border-black-border rounded-2xl p-4 sm:p-8 space-y-5 shadow-2xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-wine-700/10 rounded-full blur-3xl pointer-events-none" />

        {/* Camera scanning area - kept in a small frame */}
        {isCameraActive ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-3 max-w-sm mx-auto"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-wine-400 flex items-center gap-2">
                <Camera size={15} />
                Kamera aktivní
              </h3>
              <button
                onClick={() => setIsCameraActive(false)}
                className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 rounded-lg border border-zinc-800 transition cursor-pointer touch-manipulation min-h-[36px]"
              >
                Zavřít kameru
              </button>
            </div>
            {/* Small viewport container */}
            <div id="reader" className="overflow-hidden rounded-xl border border-wine-700/50 bg-black min-h-[220px] max-h-[300px]" />
          </motion.div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setIsCameraActive(true)}
              className="flex-1 flex items-center justify-center gap-3 bg-wine-700 hover:bg-wine-600 text-white font-medium py-3.5 px-6 rounded-xl transition duration-200 shadow-lg shadow-wine-900/40 group cursor-pointer touch-manipulation min-h-[48px]"
            >
              <Camera size={20} className="group-hover:scale-110 transition-transform" />
              <span>Spustit skener s kamerou</span>
            </button>
          </div>
        )}

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-black-border"></div>
          <span className="flex-shrink mx-3 text-[10px] sm:text-xs font-mono uppercase tracking-widest text-zinc-500">nebo zadejte ručně</span>
          <div className="flex-grow border-t border-black-border"></div>
        </div>

        {/* Manual input form */}
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

        {/* Sample ISBN quick buttons */}
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

      {/* Loading state */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center justify-center py-12 space-y-4"
          >
            <div className="w-12 h-12 border-4 border-wine-900 border-t-wine-500 rounded-full animate-spin" />
            <p className="text-sm text-zinc-400 font-medium animate-pulse">
              Vyhledávám knihu v knižní databázi...
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state */}
      {error && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-wine-900/30 border border-wine-700/60 rounded-xl p-4 text-white flex items-center gap-3"
        >
          <AlertCircle className="text-wine-500 flex-shrink-0" size={20} />
          <div className="text-sm">{error}</div>
        </motion.div>
      )}

      {/* Scanned Book Animated Result Card */}
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
            <div className="flex justify-between items-start border-b border-black-border pb-4">
              <div>
                <span className="text-xs font-mono text-wine-400 uppercase tracking-widest block mb-1">
                  Detail naskenované knihy
                </span>
                <span className="text-xs font-mono bg-zinc-900 text-zinc-400 px-2.5 py-1 rounded-md border border-zinc-800">
                  ISBN: {scannedBook.isbn}
                </span>
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
                  {scannedBook.coverUrl ? (
                    <img
                      src={scannedBook.coverUrl}
                      alt={scannedBook.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = '';
                      }}
                    />
                  ) : (
                    <div className="text-center p-2">
                      <BookOpen size={32} className="text-wine-600 mx-auto mb-1" />
                      <span className="text-[10px] text-zinc-500 font-mono">Bez obálky</span>
                    </div>
                  )}
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

            {/* Action buttons */}
            <div className="pt-4 border-t border-black-border flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleSave}
                className="flex-1 bg-wine-700 hover:bg-wine-600 text-white font-semibold py-3 px-6 rounded-xl transition duration-200 flex items-center justify-center gap-2 shadow-lg shadow-wine-900/30 cursor-pointer"
              >
                {saveSuccess ? (
                  <>
                    <BookmarkCheck size={18} className="text-white animate-bounce" />
                    <span>Uloženo do knihovny!</span>
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    <span>Uložit do mojí knihovny</span>
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
