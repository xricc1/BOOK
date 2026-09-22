// Service for fetching book details by ISBN from Google Books API & Open Library API

const SAMPLE_BOOKS = {
  "9788020712341": {
    isbn: "9788020712341",
    title: "1984",
    author: "George Orwell",
    genre: "Antiutopie / Sci-Fi",
    publishYear: "1949",
    pageCount: "328",
    publisher: "Odeon",
    description: "Klasický román George Orwella popisuje svět pod diktaturou Velkého bratra, kde svoboda je myšlenkový zločin a minulost se neustále přepisuje.",
    coverUrl: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&q=80&w=400",
  },
  "9788073812342": {
    isbn: "9788073812342",
    title: "Válka s Mloky",
    author: "Karel Čapek",
    genre: "Sci-Fi / Satira",
    publishYear: "1936",
    pageCount: "280",
    publisher: "Fr. Borový",
    description: "Metaforické a varovné dílo Karla Čapka sledijící objev inteligencí obdařených mloků a jejich postupnou nadvládu nad lidstvem.",
    coverUrl: "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&q=80&w=400",
  },
  "9788020445678": {
    isbn: "9788020445678",
    title: "Království",
    author: "Jo Nesbø",
    genre: "Detektivka / Krimi",
    publishYear: "2020",
    pageCount: "560",
    publisher: "Knižní klub",
    description: "Temný norský thriller o dvou bratřích, temných rodinných tajemstvích a moci v odlehlém horském městečku.",
    coverUrl: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=400",
  },
  "9788074628888": {
    isbn: "9788074628888",
    title: "Sto roků samoty",
    author: "Gabriel García Márquez",
    genre: "Magický realismus",
    publishYear: "1967",
    pageCount: "416",
    publisher: "Odeon",
    description: "Monumentální rodinná sága rodu Buendíů fiktivního městečka Macondo od zakladatele magického realismu.",
    coverUrl: "https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&q=80&w=400",
  }
};

/**
 * Clean ISBN string (remove hyphens, spaces)
 */
export function cleanIsbn(isbnStr) {
  if (!isbnStr) return '';
  return isbnStr.replace(/[^0-9X]/gi, '');
}

/**
 * Fetch book details by ISBN
 */
export async function fetchBookByIsbn(isbnRaw) {
  const isbn = cleanIsbn(isbnRaw);
  if (!isbn) {
    throw new Error('Neplatné ISBN číslo.');
  }

  // Check if we have sample mock data matching
  if (SAMPLE_BOOKS[isbn]) {
    return { ...SAMPLE_BOOKS[isbn], id: `book-${Date.now()}-${Math.random().toString(36).substr(2, 5)}` };
  }

  // 1. Try Google Books API
  try {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    if (response.ok) {
      const data = await response.json();
      if (data.totalItems > 0 && data.items?.[0]?.volumeInfo) {
        const info = data.items[0].volumeInfo;

        let cover = info.imageLinks?.extraLarge ||
                   info.imageLinks?.large ||
                   info.imageLinks?.medium ||
                   info.imageLinks?.thumbnail ||
                   info.imageLinks?.smallThumbnail ||
                   null;

        // Clean up cover URL if it's http
        if (cover && cover.startsWith('http:')) {
          cover = cover.replace('http:', 'https:');
        }

        return {
          id: `book-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          isbn: isbn,
          title: info.title || 'Neznámý název',
          author: info.authors ? info.authors.join(', ') : 'Neznámý autor',
          genre: info.categories ? info.categories.join(', ') : 'Beletrie',
          publishYear: info.publishedDate ? info.publishedDate.substring(0, 4) : 'Neuvedeno',
          pageCount: info.pageCount ? info.pageCount.toString() : 'Neuvedeno',
          publisher: info.publisher || 'Neuvedeno',
          description: info.description || 'K této knize není k dispozici žádný popis.',
          coverUrl: cover || null,
          addedAt: new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    console.warn('Google Books API failed or was blocked, falling back to Open Library...', err);
  }

  // 2. Try Open Library API
  try {
    const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
    if (response.ok) {
      const data = await response.json();
      const bookKey = `ISBN:${isbn}`;
      if (data[bookKey]) {
        const info = data[bookKey];
        const authors = info.authors ? info.authors.map(a => a.name).join(', ') : 'Neznámý autor';
        const subjects = info.subjects ? info.subjects.slice(0, 2).map(s => s.name).join(', ') : 'Beletrie';
        const cover = info.cover?.large || info.cover?.medium || info.cover?.small || null;

        return {
          id: `book-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          isbn: isbn,
          title: info.title || 'Neznámý název',
          author: authors,
          genre: subjects,
          publishYear: info.publish_date ? info.publish_date : 'Neuvedeno',
          pageCount: info.number_of_pages ? info.number_of_pages.toString() : 'Neuvedeno',
          publisher: info.publishers ? info.publishers.map(p => p.name).join(', ') : 'Neuvedeno',
          description: 'Naskenovaná kniha z Open Library.',
          coverUrl: cover,
          addedAt: new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    console.warn('Open Library API error:', err);
  }

  // Fallback if not found anywhere: create template entry with ISBN so user can fill details
  return {
    id: `book-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    isbn: isbn,
    title: `Kniha (${isbn})`,
    author: 'Neznámý autor',
    genre: 'Nespecifikováno',
    publishYear: new Date().getFullYear().toString(),
    pageCount: 'Neuvedeno',
    publisher: 'Neuvedeno',
    description: 'Knihu se nepodařilo automaticky vyhledat v databázích. Můžete níže doplnit podrobnosti.',
    coverUrl: null,
    addedAt: new Date().toISOString(),
    isManualFallback: true
  };
}

// Local storage management
const LOCAL_STORAGE_KEY = 'vytvorene_knihy_isbn_library_v1';

export function getSavedBooks() {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) {
      // Seed with sample initial books for nice presentation on first load
      const initialBooks = [
        {
          id: 'initial-1',
          isbn: '9788020712341',
          title: '1984',
          author: 'George Orwell',
          genre: 'Antiutopie / Sci-Fi',
          publishYear: '1949',
          pageCount: '328',
          publisher: 'Odeon',
          description: 'Klasický román George Orwella popisuje svět pod diktaturou Velkého bratra.',
          coverUrl: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&q=80&w=400',
          addedAt: new Date(Date.now() - 86400000 * 2).toISOString()
        },
        {
          id: 'initial-2',
          isbn: '9788073812342',
          title: 'Válka s Mloky',
          author: 'Karel Čapek',
          genre: 'Sci-Fi / Satira',
          publishYear: '1936',
          pageCount: '280',
          publisher: 'Fr. Borový',
          description: 'Metaforické a varovné dílo Karla Čapka sledijící objev inteligencí obdařených mloků.',
          coverUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&q=80&w=400',
          addedAt: new Date(Date.now() - 86400000 * 1).toISOString()
        }
      ];
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(initialBooks));
      return initialBooks;
    }
    return JSON.parse(stored);
  } catch (err) {
    console.error('Error reading books from localStorage', err);
    return [];
  }
}

export function saveBookToLibrary(book) {
  const books = getSavedBooks();

  // Check if book with exact same ISBN already exists
  const existingIndex = books.findIndex(b => b.isbn === book.isbn);
  let updatedBooks;

  if (existingIndex >= 0) {
    // Update existing
    updatedBooks = [...books];
    updatedBooks[existingIndex] = { ...book, updated: true, addedAt: new Date().toISOString() };
  } else {
    // Add new
    const newBook = {
      ...book,
      addedAt: book.addedAt || new Date().toISOString()
    };
    updatedBooks = [newBook, ...books];
  }

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedBooks));
  return updatedBooks;
}

export function removeBookFromLibrary(bookId) {
  const books = getSavedBooks();
  const filtered = books.filter(b => b.id !== bookId && b.isbn !== bookId);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
  return filtered;
}

export function updateBookInLibrary(updatedBook) {
  const books = getSavedBooks();
  const updated = books.map(b => b.id === updatedBook.id ? updatedBook : b);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export { SAMPLE_BOOKS };
