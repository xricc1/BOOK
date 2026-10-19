# ISBN Skener & Knihovna

Mobilní webová aplikace pro skenování čárových kódů knih a vedení osobní knihovny.

## Co umí

- **Skenování** čárového kódu knihy fotoaparátem (EAN-13 s prefixem 978/979), nahráním fotky kódu nebo ručním zadáním ISBN-10 / ISBN-13.
- **Dohledání údajů** postupně v katalozích Knihovny.cz → Google Books → Open Library. Když knihu nenajde nikde, jde ji přidat ručně.
- **Knihovna** uložená v prohlížeči (localStorage): vyhledávání, filtr podle žánru, řazení, úpravy a mazání.
- **Kontrola duplicit**, která pozná stejnou knihu i pod ISBN-10 a ISBN-13.

## Vývoj

```bash
npm install
npm run dev      # vývojový server
npm run build    # produkční build do dist/
npm run lint     # oxlint
```

## Nasazení

Push do větve `main` spustí GitHub Actions workflow (`.github/workflows/deploy.yml`), které aplikaci sestaví a nasadí na GitHub Pages pod cestou `/BOOK/`.

## Google Books API klíč (volitelný)

Bez klíče sdílí Google Books jeden malý denní limit se všemi aplikacemi bez klíče, takže hledání v Googlu většinou selže a aplikace přejde na Open Library.

1. V [Google Cloud Console](https://console.cloud.google.com/apis/library/books.googleapis.com) zapni **Books API**.
2. V *APIs & Services → Credentials* vytvoř **API key** a omez ho na *Websites* `https://xricc1.github.io/*` a na *Books API*.
3. Na GitHubu v repu: *Settings → Secrets and variables → Actions → New repository secret*, název `GOOGLE_BOOKS_API_KEY`, hodnota = klíč.
4. Spusť znovu workflow *Deploy to GitHub Pages* (nebo pushni do `main`).

Pro lokální vývoj můžeš klíč dát do souboru `.env.local` jako `VITE_GOOGLE_BOOKS_API_KEY=...`.

## Technologie

React 19, Vite, Tailwind CSS 4, framer-motion, html5-qrcode, lucide-react.
