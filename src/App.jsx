import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { ScannerTab } from './components/ScannerTab';
import { LibraryTab } from './components/LibraryTab';
import { getSavedBooks, saveBookToLibrary } from './services/isbnService';
import { motion, AnimatePresence } from 'framer-motion';

export default function App() {
  const [activeTab, setActiveTab] = useState('scan'); // 'scan' or 'library'
  const [books, setBooks] = useState(() => getSavedBooks());

  const handleBookSaved = (newBook) => {
    const updated = saveBookToLibrary(newBook);
    setBooks(updated);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-sans selection:bg-wine-700 selection:text-white">
      {/* Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        bookCount={books.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-3 py-4 sm:px-4 sm:py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'scan' ? (
            <motion.div
              key="scan-tab"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <ScannerTab onBookSaved={handleBookSaved} />
            </motion.div>
          ) : (
            <motion.div
              key="library-tab"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <LibraryTab
                books={books}
                setBooks={setBooks}
                onSwitchToScan={() => setActiveTab('scan')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-black-border py-6 text-center text-xs text-zinc-600 font-mono">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>Aplikace na skenování ISBN kódů &bull; Černá &bull; Bílá &bull; Vínová</span>
          <span>Minimalistický design &bull; {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
