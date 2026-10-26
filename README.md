# ProfitMind — Shop Management PWA

Offline-first shop management for Ugandan retail: POS, debtors, stock,
analytics, printable/WhatsApp reports, and an AI Advisor that only ever
reasons from the shop's own numbers.

## Project structure

```
src/
  lib/                  — pure logic, no React, no UI
    theme.js            — design tokens (C), ugx()/fmtDate() formatters
    storage.js           — localStorage-backed persistence (get/set/delete)
    intelligence.js      — forecasting, debtor risk, slow-moving stock,
                            anomaly detection. Unit tested — see below.
    scenario.js          — the Advisor's "what if" simulator
    reports.js           — Today/Week/Month digest, WhatsApp text, print/PDF
    advisorEngine.js     — rule-based Q&A (today's numbers, restocking,
                            named products, named debtors, suppliers,
                            payment-method breakdown, comparisons, what-if
                            scenarios) + the digest fed to Claude, plus an
                            offline-safe fallback for anything unmatched.
    seedData.js          — demo products/debtors/purchases, tabs, accounts
    csv.js               — CSV export helper
    auth.js              — hashed PIN login, lockout, PIN change
    sales.js             — atomic checkout (stock + debtor + sales log)
    ids.js               — unique ids that are never reused
    intelligence.test.js — vitest suite for the intelligence engine

  hooks/
    useVoice.js          — SpeechRecognition + speechSynthesis wrapper

  components/
    ui/primitives.jsx    — Card, Field, Modal, KpiCard, EmptyState
    POS.jsx, Debtors.jsx, StockPage.jsx, ProductModal.jsx,
    AnalyticsPage.jsx, ReportsPage.jsx, ExportPage.jsx,
    Advisor.jsx, Briefing.jsx, InsightSection.jsx,
    Login.jsx, Splash.jsx, Logo.jsx

  App.jsx                — tab routing, top-level state, persistence,
                            report due-check (banner + browser notification)
  main.jsx, index.css     — entry point

netlify/functions/advisor.js  — proxies Advisor questions to Claude;
                                 this is the only place the API key exists
```

Every file in `lib/` is a plain JS module with no React or DOM dependency
(aside from `storage.js`, which touches `localStorage`), so each one can
be imported and tested on its own — see `intelligence.test.js` for an
example that exercises the forecasting and debtor-risk logic directly.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # runs the unit tests (intelligence, advisor, sales, auth, reports)
npm run build      # production build to dist/
npm run preview    # serve the production build locally
```

## Deploying

### 1. GitHub

The code lives at `https://github.com/StevenSsemambo/profitmind`. Make
changes on a branch, open a pull request, and merge to `main` — Netlify
redeploys automatically on every push to `main`.

### 2. Netlify

1. **New site from Git** → pick this repo. Netlify reads `netlify.toml`
   automatically (`npm run build`, publish `dist`, functions in
   `netlify/functions`) — no manual build settings needed.
2. **Set the AI Advisor's environment variables** (Site configuration →
   Environment variables). The AI part of the Advisor stays switched off
   until both required ones exist; everyday questions still work without it.

   | Variable | Required | Purpose |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | yes | Your Anthropic API key (server-side only) |
   | `ADVISOR_ACCESS_CODE` | yes | A long random string. The owner types it once in the Advisor tab; the function rejects every request without it |
   | `ANTHROPIC_MODEL` | no | Model name, defaults to `claude-sonnet-4-6` |
   | `ADVISOR_DAILY_CAP` | no | Max AI answers per day (default 300) |

   The function also rate-limits per IP and refuses requests from other
   websites. Those limits are in memory per serverless instance, so also set
   a monthly spend limit in the Anthropic console.
3. Deploy. The app is installable (Add to Home Screen) on both Android
   and iOS once served over HTTPS, which Netlify does by default.

### 3. Local testing of the Netlify Function

If you want to test the `/.netlify/functions/advisor` route locally:

```bash
npm install -g netlify-cli
cp .env.example .env   # fill in ANTHROPIC_API_KEY and ADVISOR_ACCESS_CODE
netlify dev
```

## What changed from the single-file demo

This was originally a single ~3,000-line `.jsx` artifact. Splitting it up
was mainly about two things:

- **Testability.** `intelligence.js` and `advisorEngine.js` — the
  forecasting/risk logic and the rule-based Q&A engine — now have real
  unit test suites that run against plain data, with no UI in the way.
  Writing those tests immediately caught real bugs introduced by the
  split (missing imports), which is exactly the kind of mistake this
  structure is meant to catch before it reaches a shop owner.
- **Offline-safe Advisor.** The rule engine covers today's numbers,
  restocking, named products, named debtors, suppliers, payment-method
  splits, comparisons, and what-if scenarios — all answered instantly
  with zero network calls. If a question doesn't match any rule *and*
  Claude is unreachable (offline, or the request fails), the Advisor
  falls back to a real data snapshot instead of a dead "couldn't
  answer" — see `offlineFallbackAnswer` in `advisorEngine.js`.
- **API key safety.** The original demo called `api.anthropic.com`
  directly from the browser, which is fine inside Claude's own artifact
  sandbox but would leak a real API key if shipped as-is. The Advisor now
  calls a Netlify Function instead, and the key only ever lives in
  Netlify's environment variables.

## Before this is a real product

A few things were fine for a demo but should change before this holds a
real shop's data:

- **PIN login is local only.** On first launch the shop sets an Owner and a
  Cashier PIN (stored as salted PBKDF2 hashes, with lockout after repeated
  wrong guesses — `src/lib/auth.js`). With no server, this stops casual
  access at the till but not someone with developer tools and the phone in
  hand; real protection needs a backend with accounts.
- **Data lives in `localStorage` on one device.** Fine for a single till,
  but there's no sync across devices and no server-side backup — anything
  that needs multi-device or multi-till support needs a real backend.
- **True unattended report delivery** (a WhatsApp message that lands
  before the owner ever opens the app, even with the phone locked) needs
  a small server-side scheduler using the WhatsApp Business Cloud API,
  plus real Web Push with a push subscription server — the current
  browser-notification opt-in (Reports → Browser notifications) is a
  solid best-effort improvement, but it still requires the browser itself
  to be running.
