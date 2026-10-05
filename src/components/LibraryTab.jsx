import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Book, Search, Trash2, Filter, SortAsc, BookOpen, Edit3, X, ChevronRight } from 'lucide-react';
import { updateBookInLibrary, removeBookFromLibrary } from '../services/isbnService';

export function LibraryTab({ books, setBooks, onSwitchToScan }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('ALL');
  const [sortBy, setSortBy] = useState('genre'); // 'genre', 'title', 'author', 'date'
  const [selectedBook, setSelectedBook] = useState(null);
  const [editingBook, setEditingBook] = useState(null);

  // Extract unique genres
  const genres = useMemo(() => {
    const set = new Set();
    books.forEach(b => {
      if (b.genre) set.add(b.genre);
    });
    return Array.from(set);
  }, [books]);

  // Filter and Sort Books
  const filteredAndSortedBooks = useMemo(() => {
    return books
      .filter(book => {
        const matchesSearch =
          book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          book.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
          book.isbn.includes(searchTerm) ||
          book.genre.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesGenre = selectedGenre === 'ALL' || book.genre === selectedGenre;

        return matchesSearch && matchesGenre;
      })
      .sort((a, b) => {
        if (sortBy === 'genre') {
          return (a.genre || '').localeCompare(b.genre || '');
        } else if (sortBy === 'title') {
          return (a.title || '').localeCompare(b.title || '');
        } else if (sortBy === 'author') {
          return (a.author || '').localeCompare(b.author || '');
        } else if (sortBy === 'date') {
          return new Date(b.addedAt || 0) - new Date(a.addedAt || 0);
        }
        return 0;
      });
  }, [books, searchTerm, selectedGenre, sortBy]);

  const handleDelete = (bookId, e) => {
    e?.stopPropagation();
    if (confirm('Opravdu chcete tuto knihu odebrat ze své knihovny?')) {
      const updated = removeBookFromLibrary(bookId);
      setBooks(updated);
      if (selectedBook?.id === bookId) setSelectedBook(null);
    }
  };

  const handleSaveEdit = () => {
    if (!editingBook) return;
    const updated = updateBookInLibrary(editingBook);
    setBooks(updated);
    setSelectedBook(editingBook);
    setEditingBook(null);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-wine-700/50 bg-wine-900/20 text-wine-400 text-[11px] sm:text-xs font-medium tracking-wider uppercase mb-1">
            <Book size={13} className="text-wine-500" />
            Moje Sbírka Knih
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Naskenované Knihy ({books.length})
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm">
            Vaše osobní knižní databáze. Klikněte na řádek pro zobrazení karty s detailem.
          </p>
        </div>

        <button
          onClick={onSwitchToScan}
          className="w-full sm:w-auto bg-wine-700 hover:bg-wine-600 text-white font-semibold py-2.5 px-4 rounded-xl transition shadow-lg shadow-wine-900/30 flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer touch-manipulation min-h-[42px]"
        >
          <BookOpen size={16} />
          Naskenovat novou knihu
        </button>
      </div>

      {/* Search & Sort Toolbar */}
      <div className="bg-black-card border border-black-border rounded-2xl p-3.5 sm:p-5 space-y-3 shadow-xl">
        <div className="flex flex-col sm:flex-row gap-2.5">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input
              type="text"
              placeholder="Hledat podle názvu, autora, ISBN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black border border-black-border focus:border-wine-500 text-white rounded-xl pl-9 pr-8 py-2.5 text-xs sm:text-sm placeholder-zinc-600 outline-none transition min-h-[42px]"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs p-1 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Sort selector */}
          <div className="flex items-center gap-2">
            <SortAsc size={16} className="text-wine-500 flex-shrink-0" />
            <span className="text-xs text-zinc-400 font-medium whitespace-nowrap">Seřadit:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="flex-1 sm:flex-none bg-black border border-black-border focus:border-wine-500 text-white text-xs sm:text-sm rounded-xl px-3 py-2.5 outline-none cursor-pointer min-h-[42px]"
            >
              <option value="genre">Podle Žánru</option>
              <option value="author">Podle Autora</option>
              <option value="title">Podle Názvu</option>
              <option value="date">Nejnověji přidané</option>
            </select>
          </div>
        </div>

        {/* Genre filter pill chips */}
        {genres.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-2 border-t border-black-border/60 no-scrollbar">
            <Filter size={14} className="text-zinc-500 flex-shrink-0" />
            <span className="text-[10px] text-zinc-500 uppercase font-mono mr-0.5 shrink-0">Žánry:</span>
            <button
              onClick={() => setSelectedGenre('ALL')}
              className={`text-xs px-3 py-1 rounded-full whitespace-nowrap transition cursor-pointer touch-manipulation min-h-[30px] ${
                selectedGenre === 'ALL'
                  ? 'bg-wine-700 text-white font-medium shadow-md shadow-wine-900/50'
                  : 'bg-black text-zinc-400 hover:text-white border border-black-border'
              }`}
            >
              Všechny ({books.length})
            </button>
            {genres.map(genre => (
              <button
                key={genre}
                onClick={() => setSelectedGenre(genre)}
                className={`text-xs px-3 py-1 rounded-full whitespace-nowrap transition cursor-pointer touch-manipulation min-h-[30px] ${
                  selectedGenre === genre
                    ? 'bg-wine-700 text-white font-medium shadow-md shadow-wine-900/50'
                    : 'bg-black text-zinc-400 hover:text-white border border-black-border'
                }`}
              >
                {genre}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Row List View */}
      {filteredAndSortedBooks.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-black-card border border-black-border rounded-2xl p-8 sm:p-12 text-center space-y-3"
        >
          <BookOpen size={40} className="text-wine-800 mx-auto" />
          <h3 className="text-base sm:text-lg font-bold text-white">Nenalezeny žádné knihy</h3>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-sm mx-auto">
            {searchTerm || selectedGenre !== 'ALL'
              ? 'Zkus vyhledat jiný název nebo zrušit filtry.'
              : 'Zatím nemáte naskenované žádné knihy. Přejděte na záložku skenování a přidejte svoji první knížku!'}
          </p>
          <button
            onClick={onSwitchToScan}
            className="mt-2 bg-wine-700 hover:bg-wine-600 text-white font-medium text-xs sm:text-sm py-2 px-4 rounded-xl transition inline-block cursor-pointer touch-manipulation min-h-[40px]"
          >
            Skenovat knihu
          </button>
        </motion.div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <AnimatePresence>
            {filteredAndSortedBooks.map((book) => (
              <motion.div
                key={book.id || book.isbn}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                onClick={() => setSelectedBook(book)}
                className="bg-black-card border border-black-border hover:border-wine-700/80 active:bg-zinc-900/80 rounded-xl p-2.5 sm:p-3.5 transition duration-150 cursor-pointer flex items-center justify-between gap-3 group shadow-md"
              >
                {/* Left side: Cover & info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Book thumbnail */}
                  <div className="w-12 h-16 sm:w-14 sm:h-20 bg-black border border-zinc-800 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center relative shadow-sm">
                    {book.coverUrl ? (
                      <img
                        src={book.coverUrl}
                        alt={book.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = '';
                        }}
                      />
                    ) : (
                      <BookOpen size={20} className="text-wine-600" />
                    )}
                  </div>

                  {/* Book details row */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-wider text-wine-400 bg-wine-950/80 px-1.5 py-0.5 rounded border border-wine-900/60 shrink-0">
                        {book.genre || 'Beletrie'}
                      </span>
                      {book.publishYear && (
                        <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline-block">
                          &bull; {book.publishYear}
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-wine-400 transition-colors truncate leading-tight">
                      {book.title}
                    </h3>

                    <p className="text-xs text-zinc-400 truncate">
                      {book.author}
                    </p>
                  </div>
                </div>

                {/* Right side controls: delete button & open arrow */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => handleDelete(book.id, e)}
                    className="text-zinc-600 hover:text-wine-400 p-2 rounded-lg transition hover:bg-zinc-900 cursor-pointer touch-manipulation min-h-[36px] min-w-[36px] flex items-center justify-center"
                    title="Smazat z knihovny"
                  >
                    <Trash2 size={16} />
                  </button>
                  <ChevronRight size={18} className="text-zinc-600 group-hover:text-wine-500 group-hover:translate-x-0.5 transition-all" />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Book Detail / Edit Modal Card */}
      <AnimatePresence>
        {selectedBook && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 10 }}
              className="bg-black-card border border-wine-700/80 rounded-2xl max-w-lg w-full p-4 sm:p-7 space-y-5 shadow-2xl relative max-h-[88vh] overflow-y-auto"
            >
              {/* Close Button */}
              <button
                onClick={() => {
                  setSelectedBook(null);
                  setEditingBook(null);
                }}
                className="absolute top-3.5 right-3.5 text-zinc-400 hover:text-white bg-zinc-900 p-2 rounded-xl border border-zinc-800 transition cursor-pointer touch-manipulation min-h-[38px] min-w-[38px] flex items-center justify-center"
                aria-label="Zavřít detail"
              >
                <X size={18} />
              </button>

              {editingBook ? (
                /* Edit Form */
                <div className="space-y-3.5 text-left pt-2">
                  <h3 className="text-base font-bold text-white border-b border-black-border pb-2.5">
                    Upravit knihu
                  </h3>
                  <div>
                    <label className="text-xs font-medium text-zinc-400 block mb-1">Název knihy</label>
                    <input
                      type="text"
                      value={editingBook.title}
                      onChange={(e) => setEditingBook({ ...editingBook, title: e.target.value })}
                      className="w-full bg-black border border-black-border text-white rounded-lg px-3 py-2 text-xs sm:text-sm outline-none focus:border-wine-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-400 block mb-1">Autor</label>
                    <input
                      type="text"
                      value={editingBook.author}
                      onChange={(e) => setEditingBook({ ...editingBook, author: e.target.value })}
                      className="w-full bg-black border border-black-border text-white rounded-lg px-3 py-2 text-xs sm:text-sm outline-none focus:border-wine-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-zinc-400 block mb-1">Žánr</label>
                      <input
                        type="text"
                        value={editingBook.genre}
                        onChange={(e) => setEditingBook({ ...editingBook, genre: e.target.value })}
                        className="w-full bg-black border border-black-border text-white rounded-lg px-3 py-2 text-xs sm:text-sm outline-none focus:border-wine-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-zinc-400 block mb-1">Rok</label>
                      <input
                        type="text"
                        value={editingBook.publishYear}
                        onChange={(e) => setEditingBook({ ...editingBook, publishYear: e.target.value })}
                        className="w-full bg-black border border-black-border text-white rounded-lg px-3 py-2 text-xs sm:text-sm outline-none focus:border-wine-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-400 block mb-1">Popis</label>
                    <textarea
                      rows={3}
                      value={editingBook.description}
                      onChange={(e) => setEditingBook({ ...editingBook, description: e.target.value })}
                      className="w-full bg-black border border-black-border text-white rounded-lg px-3 py-2 text-xs sm:text-sm outline-none focus:border-wine-500 resize-none"
                    />
                  </div>

                  <div className="flex gap-2.5 pt-2">
                    <button
                      onClick={handleSaveEdit}
                      className="flex-1 bg-wine-700 hover:bg-wine-600 text-white font-semibold py-2.5 rounded-xl transition text-xs sm:text-sm cursor-pointer touch-manipulation min-h-[42px]"
                    >
                      Uložit změny
                    </button>
                    <button
                      onClick={() => setEditingBook(null)}
                      className="px-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-medium py-2.5 rounded-xl transition text-xs sm:text-sm cursor-pointer touch-manipulation min-h-[42px]"
                    >
                      Zrušit
                    </button>
                  </div>
                </div>
              ) : (
                /* Display Detail Card */
                <div className="space-y-5 text-left pt-1">
                  <div className="flex flex-row gap-3.5 sm:gap-5 items-start">
                    <div className="w-24 h-36 sm:w-28 sm:h-40 bg-black border border-wine-800 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center relative shadow-md">
                      {selectedBook.coverUrl ? (
                        <img
                          src={selectedBook.coverUrl}
                          alt={selectedBook.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <BookOpen size={30} className="text-wine-600" />
                      )}
                    </div>

                    <div className="flex-1 space-y-1.5 min-w-0 pr-6 sm:pr-0">
                      <span className="inline-block text-[10px] font-mono bg-wine-950 text-wine-400 border border-wine-800/80 px-2 py-0.5 rounded uppercase font-medium">
                        {selectedBook.genre || 'Žánr'}
                      </span>
                      <h2 className="text-lg sm:text-xl font-bold text-white leading-snug break-words">
                        {selectedBook.title}
                      </h2>
                      <p className="text-xs sm:text-sm text-zinc-300 font-medium truncate">
                        {selectedBook.author}
                      </p>

                      <div className="text-[11px] text-zinc-500 font-mono pt-1 space-y-0.5">
                        <div><span className="text-zinc-600">ISBN:</span> {selectedBook.isbn}</div>
                        <div><span className="text-zinc-600">Rok:</span> {selectedBook.publishYear || '—'}</div>
                        <div><span className="text-zinc-600">Stran:</span> {selectedBook.pageCount || '—'}</div>
                        {selectedBook.publisher && (
                          <div className="truncate"><span className="text-zinc-600">Vydavatel:</span> {selectedBook.publisher}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-black-border pt-3.5">
                    <h4 className="text-[11px] font-mono uppercase text-wine-400 mb-1.5">Popis knihy</h4>
                    <p className="text-xs text-zinc-300 leading-relaxed bg-black p-3 rounded-xl border border-black-border/80">
                      {selectedBook.description || 'Žádný popis není k dispozici.'}
                    </p>
                  </div>

                  <div className="flex gap-2.5 pt-1">
                    <button
                      onClick={() => setEditingBook(selectedBook)}
                      className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-2.5 rounded-xl border border-zinc-800 transition flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer touch-manipulation min-h-[42px]"
                    >
                      <Edit3 size={15} className="text-wine-400" />
                      Upravit údaje
                    </button>
                    <button
                      onClick={() => handleDelete(selectedBook.id)}
                      className="px-4 bg-wine-950/60 hover:bg-wine-900 border border-wine-800/80 text-wine-300 hover:text-white font-medium py-2.5 rounded-xl transition flex items-center gap-2 text-xs sm:text-sm cursor-pointer touch-manipulation min-h-[42px]"
                    >
                      <Trash2 size={15} />
                      Smazat
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
