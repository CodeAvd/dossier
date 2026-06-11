# dossier — G. Avdeev

A single-page portfolio for an AI Automation Engineer, built as a case file.

The page borrows its own grammar from the work: a verdict header, numbered findings,
an exhibits ledger that cites its sources, and a precondition gate. The one bold
element is **Exhibit 01** — a live, orthographic Three.js instrument that plots two
cross-market order books (Polymarket × Kalshi) as facing depth ladders and draws the
arbitrage line when the spread closes.

## Design

- **Concept:** "The Standing Dossier." Structure encodes meaning instead of decorating it.
- **Type:** Fraunces (display) + IBM Plex Mono (evidence). No system fonts.
- **Palette:** warm ink `#161210`, bone `#EDE4D3`, one editor's-redline vermilion `#D6452B`.
  Teal/brick appear only inside the instrument, never in the page chrome.
- **Motion:** near-zero outside Exhibit 01; `prefers-reduced-motion` freezes to a printed frame.

## Stack

Zero build. Static `index.html` + `styles.css` + `exhibit.js` (vanilla Three.js via an
ES-module import map, CDN-pinned `three@0.160.0`) + `main.js`. Deploy anywhere that serves
static files (GitHub Pages, Vercel, Netlify).

## Local

Any static server, e.g.:

```bash
python3 -m http.server 8099   # then open http://localhost:8099
```
