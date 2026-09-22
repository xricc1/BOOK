import React from 'react';
import { Camera, Library, BookMarked } from 'lucide-react';

export function Navbar({ activeTab, setActiveTab, bookCount }) {
  return (
    <header className="sticky top-0 z-40 bg-black/90 backdrop-blur-md border-b border-black-border">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <div
          onClick={() => setActiveTab('scan')}
          className="flex items-center gap-2.5 cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-xl bg-wine-700 group-hover:bg-wine-600 flex items-center justify-center text-white transition shadow-md shadow-wine-900/50">
            <BookMarked size={20} />
          </div>
          <div>
            <span className="font-extrabold text-white text-lg tracking-tight block leading-none">
              ISBN<span className="text-wine-500">Skener</span>
            </span>
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              Aplikace na knihy
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center p-1 bg-black border border-black-border rounded-xl">
          <button
            onClick={() => setActiveTab('scan')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === 'scan'
                ? 'bg-wine-700 text-white shadow-md shadow-wine-900/50'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <Camera size={15} />
            <span>Skenovat</span>
          </button>

          <button
            onClick={() => setActiveTab('library')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === 'library'
                ? 'bg-wine-700 text-white shadow-md shadow-wine-900/50'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <Library size={15} />
            <span>Knihovna</span>
            <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono ${
              activeTab === 'library' ? 'bg-wine-900 text-white' : 'bg-zinc-800 text-zinc-400'
            }`}>
              {bookCount}
            </span>
          </button>
        </nav>
      </div>
    </header>
  );
}
