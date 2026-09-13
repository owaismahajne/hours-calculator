# Hours Calculator

A simple web app to track the hours you work and check that your salary is calculated correctly.

## Features

- **Shift clock** – press *Start shift* and *End shift* to record real start and end times.
- **Manual shifts** – add, edit or delete shifts by date, start, end and break.
- **Overnight shifts** – a shift like 22:00–06:00 is counted correctly.
- **Breaks** – choose whether breaks are paid (counted as work) or unpaid (taken off hours).
- **Overtime** – starts at a specific hour (e.g. 17:00), after a number of hours per day, or not at all; paid as a percent of the hourly rate (e.g. 125%, 150%).
- **Currencies** – $ Dollar, € Euro, ₪ New Shekel.
- **Totals** – overall, weekly (week starts Sunday or Monday) and monthly hours and pay.
- Data is saved in your browser (localStorage).

## How to use

Open `index.html` in any browser. No installation needed.

## Install on your phone

The app is an installable web app (PWA): once it's hosted on an HTTPS address (e.g. GitHub Pages), open that address on your phone and:

- **Android (Chrome):** tap **Install app** in the header, or ⋮ → **Install app**.
- **iPhone (Safari):** tap Share → **Add to Home Screen**.

It gets its own icon, opens full screen and works offline.

## Files

- `index.html` – page layout
- `style.css` – styles (green, black, white, blue)
- `app.js` – calculations and app logic
- `manifest.webmanifest`, `sw.js`, `icons/` – install and offline support
