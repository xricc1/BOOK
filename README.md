# ISBN Skener & Knihovna

Mobilní webová aplikace pro skenování čárových kódů knih a vedení osobní knihovny.

## Co umí

- **Skenování** čárového kódu knihy fotoaparátem (EAN-13 s prefixem 978/979), nahráním fotky kódu nebo ručním zadáním ISBN-10 / ISBN-13.
- **Dohledání údajů** postupně v katalozích Knihovny.cz → Google Books → Open Library.
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

## Technologie

React 19, Vite, Tailwind CSS 4, framer-motion, html5-qrcode, lucide-react.
