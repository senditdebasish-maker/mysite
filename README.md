# mysite — Debasish Das · Web Studio & Store

Full-page **scroll-snap** home page (overflow-locked body, one screen per section,
horizontal snap carousels) for a business offering **web design & development ·
hosting & domains · an online store of physical products**.
Plain static site — no build step, no dependencies. Upload and it works.

## Architecture — the locked page pattern

```
body                    position: overflow hidden          ← overflow/transform lock
└── .scroller           100dvh · overflow-y: scroll        ← the ONLY scroll container
    └── .snap-section   height: 100dvh · snap-align: start ← full-page snap, one screen each
        ├── #home      hero (portrait, badges, marquee ticker)
        ├── #services  horizontal snap carousel (scroll-snap-type: x)
        ├── #hosting   pricing plan cards
        ├── #store     horizontal snap carousel (the shelf) + cart
        └── #contact   book-a-call channels + WhatsApp form
```

Extras: fixed nav + bottom marquee ticker + right rail section-dots + top progress line.
Keyboard navigation: `↑` / `↓` / `PageUp` / `PageDown` / `Home` / `End` jumps between sections;
dots/rail/nav all smooth-scroll. On mobile (< 1024px) snap is disabled and sections flow naturally.

## Structure

```
index.html            ← one page, five full-screen sections, cart drawer, toast
assets/css/styles.css ← light editorial theme (cream / ink / #E8542F orange)
assets/js/app.js      ← SITE config + products/services/plans + cart + snap/carousel logic
assets/img/           ← portrait & product photos (AI-generated samples)
examples/             ← design mockups shown before building
```

## ✏️ Personalise before going live

1. Open `assets/js/app.js` → edit the `SITE` block:
   - `whatsapp` — your number, country code, digits only (e.g. `919812345678`)
   - `phoneDisplay`, `email`, `location`, `hours`
2. Same file → edit `PRODUCTS`, `SERVICES`, `PLANS`.
3. Replace `assets/img/portrait.jpg` with your own photo (square-ish crop).
4. Wordmark is `debasish.` in `index.html` — change it if you use a business brand.

## Features

- **Full-page scroll-snap** sections with locked body overflow (desktop)
- **Horizontal carousels** with arrows + edge dimming for Services and the Store shelf
- **Live feel** — pulsing availability dot, rotating dashed ring, floating badges, bottom marquee ticker, top scroll-progress line, rail dots that track the active section
- **Working cart** — qty steppers, `localStorage` persistence, free-delivery progress bar (₹999+)
- **WhatsApp checkout & booking** — orders and call requests are sent pre-filled; no backend
- Respects `prefers-reduced-motion`, keyboard accessible, focus-visible outlines

## Local preview

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Deploy

Upload everything to the document root (e.g. `public_html/` in cPanel, or any static host — Netlify, Vercel, GitHub Pages, your own server). Nothing else to configure.
