# mysite — Debasish Das · Web Studio & Store

Single-screen (scroll-less, `100dvh`), live home page for a business that offers
**web design & development · hosting & domains · an online store of physical products**.
Plain static site — no build step, no dependencies. Upload and it works.

## Structure

```
index.html            ← the home page (all screens: hero, store, services, hosting, contact, cart)
assets/css/styles.css ← light editorial theme (cream / ink / #E8542F orange)
assets/js/app.js      ← SITE config + products/services/plans data + cart logic
assets/img/           ← portrait & product photos (AI-generated samples)
examples/             ← the 3 design mockups shown before building
```

## ✏️ Personalise before going live

1. Open `assets/js/app.js` → edit the `SITE` block at the top:
   - `whatsapp` — your number with country code, digits only (e.g. `919812345678`)
   - `phoneDisplay`, `email`, `location`, `hours`
2. Same file → edit `PRODUCTS` (real products, prices, photos), `SERVICES`, `PLANS`.
3. Replace `assets/img/portrait.jpg` with your own photo (keep a square-ish crop).
4. Swap the wordmark `debasish.` in `index.html` if you use a business brand name.

## Features

- **Scroll-less hero** — whole first screen fits any desktop viewport (`overflow:hidden`, 100dvh); falls back to normal scrolling on mobile / short screens
- **Live feel** — pulsing availability dot, rotating dashed ring, floating badge cards, infinite marquee (`prefers-reduced-motion` respected)
- **Working cart** — add/remove/qty, persisted in `localStorage`, free-delivery progress bar (₹999+)
- **WhatsApp checkout & booking** — orders and call requests are sent to your WhatsApp pre-filled; no backend needed
- **Overlays** (store / services / hosting / contact) keep the page at one screen while offering deep content

## Local preview

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Deploy

Upload everything to the document root (e.g. `public_html/` in cPanel, or any static host — Netlify, Vercel, GitHub Pages, your own server). Nothing else to configure.
