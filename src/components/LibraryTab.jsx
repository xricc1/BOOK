import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Book, Search, Trash2, Filter, SortAsc, BookOpen, Edit3, X } from 'lucide-react';
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
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-wine-700/50 bg-wine-900/20 text-wine-400 text-xs font-medium tracking-wider uppercase mb-2">
            <Book size={14} className="text-wine-500" />
            Moje Sbírka Knih
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Naskenované Knihy ({books.length})
          </h1>
          <p className="text-zinc-400 text-sm">
            Vaše osobní knižní databáze s tříděním podle žánru a autora.
          </p>
        </div>

        <button
          onClick={onSwitchToScan}
          className="bg-wine-700 hover:bg-wine-600 text-white font-semibold py-2.5 px-5 rounded-xl transition shadow-lg shadow-wine-900/30 flex items-center gap-2 text-sm cursor-pointer"
        >
          <BookOpen size={16} />
          Naskenovat novou knihu
        </button>
      </div>

      {/* Search & Sort Toolbar */}
      <div className="bg-black-card border border-black-border rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
            <input
              type="text"
              placeholder="Hledat podle názvu, autora, ISBN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black border border-black-border focus:border-wine-500 text-white rounded-xl pl-10 pr-4 py-2.5 text-sm placeholder-zinc-600 outline-none transition"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Sort selector */}
          <div className="flex items-center gap-2">
            <SortAsc size={16} className="text-wine-500 flex-shrink-0" />
            <span className="text-xs text-zinc-400 font-medium">Seřadit:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-black border border-black-border focus:border-wine-500 text-white text-sm rounded-xl px-3 py-2.5 outline-none cursor-pointer"
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
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 border-t border-black-border/60">
            <Filter size={14} className="text-zinc-500 flex-shrink-0" />
            <span className="text-xs text-zinc-500 uppercase font-mono mr-1">Žánry:</span>
            <button
              onClick={() => setSelectedGenre('ALL')}
              className={`text-xs px-3 py-1 rounded-full whitespace-nowrap transition cursor-pointer ${
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
                className={`text-xs px-3 py-1 rounded-full whitespace-nowrap transition cursor-pointer ${
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

      {/* Book Grid */}
      {filteredAndSortedBooks.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-black-card border border-black-border rounded-2xl p-12 text-center space-y-4"
        >
          <BookOpen size={48} className="text-wine-800 mx-auto" />
          <h3 className="text-lg font-bold text-white">Nenalezeny žádné knihy</h3>
          <p className="text-sm text-zinc-400 max-w-sm mx-auto">
            {searchTerm || selectedGenre !== 'ALL'
              ? 'Zkus vyhledat jiný název nebo zrušit filtry.'
              : 'Zatím nemáte naskenované žádné knihy. Přejděte na záložku skenování a přidejte svoji první knížku!'}
          </p>
          <button
            onClick={onSwitchToScan}
            className="mt-2 bg-wine-700 hover:bg-wine-600 text-white font-medium text-sm py-2 px-4 rounded-lg transition inline-block cursor-pointer"
          >
            Skenovat knihu
          </button>
        </motion.div>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          <AnimatePresence>
            {filteredAndSortedBooks.map((book) => (
              <motion.div
                key={book.id || book.isbn}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.25 }}
                onClick={() => setSelectedBook(book)}
                className="bg-black-card border border-black-border hover:border-wine-700 rounded-2xl p-4 transition duration-200 cursor-pointer flex gap-4 group relative hover:shadow-xl hover:shadow-wine-900/20"
              >
                {/* Book cover / thumbnail */}
                <div className="w-20 h-28 bg-black border border-zinc-800 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center relative shadow-md">
                  {book.coverUrl ? (
                    <img
                      src={book.coverUrl}
                      alt={book.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = '';
                      }}
                    />
                  ) : (
                    <BookOpen size={24} className="text-wine-600" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 flex flex-col justify-between overflow-hidden">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-wine-400 truncate mb-1">
                      {book.genre || 'Beletrie'}
                    </div>
                    <h3 className="text-base font-bold text-white group-hover:text-wine-400 transition-colors line-clamp-2 leading-snug">
                      {book.title}
                    </h3>
                    <p className="text-xs text-zinc-400 truncate mt-1">
                      {book.author}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-black-border/60 text-[11px] text-zinc-500 font-mono">
                    <span>{book.publishYear || '—'}</span>
                    <button
                      onClick={(e) => handleDelete(book.id, e)}
                      className="text-zinc-600 hover:text-wine-500 p-1 rounded transition"
                      title="Smazat z knihovny"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Book Detail / Edit Modal */}
      <AnimatePresence>
        {selectedBook && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-black-card border border-wine-700/80 rounded-2xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              {/* Close Button */}
              <button
                onClick={() => {
                  setSelectedBook(null);
                  setEditingBook(null);
                }}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white bg-zinc-900 p-2 rounded-xl border border-zinc-800 transition"
              >
                <X size={18} />
              </button>

              {editingBook ? (
                /* Edit Form */
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-white border-b border-black-border pb-3">
                    Upravit knihu
                  </h3>
                  <div>
                    <label className="text-xs font-medium text-zinc-400 block mb-1">Název knihy</label>
                    <input
                      type="text"
                      value={editingBook.title}
                      onChange={(e) => setEditingBook({ ...editingBook, title: e.target.value })}
                      className="w-full bg-black border border-black-border text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-wine-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-400 block mb-1">Autor</label>
                    <input
                      type="text"
                      value={editingBook.author}
                      onChange={(e) => setEditingBook({ ...editingBook, author: e.target.value })}
                      className="w-full bg-black border border-black-border text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-wine-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-zinc-400 block mb-1">Žánr</label>
                      <input
                        type="text"
                        value={editingBook.genre}
                        onChange={(e) => setEditingBook({ ...editingBook, genre: e.target.value })}
                        className="w-full bg-black border border-black-border text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-wine-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-zinc-400 block mb-1">Rok</label>
                      <input
                        type="text"
                        value={editingBook.publishYear}
                        onChange={(e) => setEditingBook({ ...editingBook, publishYear: e.target.value })}
                        className="w-full bg-black border border-black-border text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-wine-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-400 block mb-1">Popis</label>
                    <textarea
                      rows={3}
                      value={editingBook.description}
                      onChange={(e) => setEditingBook({ ...editingBook, description: e.target.value })}
                      className="w-full bg-black border border-black-border text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-wine-500 resize-none"
                    />
                  </div>

                  <div className="flex gap-3 pt-3">
                    <button
                      onClick={handleSaveEdit}
                      className="flex-1 bg-wine-700 hover:bg-wine-600 text-white font-semibold py-2.5 rounded-xl transition text-sm cursor-pointer"
                    >
                      Uložit změny
                    </button>
                    <button
                      onClick={() => setEditingBook(null)}
                      className="px-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-medium py-2.5 rounded-xl transition text-sm cursor-pointer"
                    >
                      Zrušit
                    </button>
                  </div>
                </div>
              ) : (
                /* Display Detail */
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row gap-5 items-start">
                    <div className="w-28 h-40 bg-black border border-wine-800 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center relative shadow-md">
                      {selectedBook.coverUrl ? (
                        <img
                          src={selectedBook.coverUrl}
                          alt={selectedBook.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <BookOpen size={32} className="text-wine-600" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2 text-left">
                      <span className="inline-block text-[11px] font-mono bg-wine-950 text-wine-400 border border-wine-800/80 px-2.5 py-0.5 rounded-md font-medium uppercase">
                        {selectedBook.genre || 'Žánr'}
                      </span>
                      <h2 className="text-xl font-bold text-white leading-snug">
                        {selectedBook.title}
                      </h2>
                      <p className="text-sm text-zinc-300 font-medium">
                        {selectedBook.author}
                      </p>
                      <div className="text-xs text-zinc-500 font-mono pt-2 space-y-1">
                        <div><span className="text-zinc-600">ISBN:</span> {selectedBook.isbn}</div>
                        <div><span className="text-zinc-600">Rok vydání:</span> {selectedBook.publishYear || '—'}</div>
                        <div><span className="text-zinc-600">Počet stran:</span> {selectedBook.pageCount || '—'}</div>
                        <div><span className="text-zinc-600">Vydavatel:</span> {selectedBook.publisher || '—'}</div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-black-border pt-4">
                    <h4 className="text-xs font-mono uppercase text-wine-400 mb-2">Popis knihy</h4>
                    <p className="text-xs text-zinc-300 leading-relaxed bg-black p-3 rounded-xl border border-black-border">
                      {selectedBook.description || 'Žádný popis není k dispozici.'}
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setEditingBook(selectedBook)}
                      className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-2.5 rounded-xl border border-zinc-800 transition flex items-center justify-center gap-2 text-sm cursor-pointer"
                    >
                      <Edit3 size={16} className="text-wine-400" />
                      Upravit údaje
                    </button>
                    <button
                      onClick={() => handleDelete(selectedBook.id)}
                      className="px-4 bg-wine-950/60 hover:bg-wine-900 border border-wine-800/80 text-wine-300 hover:text-white font-medium py-2.5 rounded-xl transition flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Trash2 size={16} />
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
