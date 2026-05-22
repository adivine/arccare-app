# ArcCare by Adivyne Arc

Mobile-first MVP for daily care tracking. Built from the ArcCare MVP spec with the copied Adivyne Arc logo left unmodified at `assets/adivyne-arc-logo.png`.

## Run Locally

Open `index.html` in a browser, or serve the folder with any static file server.

The app uses CDN builds of Supabase, Tesseract OCR, and jsPDF. Those features require network access in the browser.

## Supabase Setup

1. Create a Supabase project.
2. In the Supabase SQL editor, run `supabase-schema.sql`.
3. In ArcCare, open Profile and enter:
   - Supabase project URL
   - Supabase anon key
4. Create an account, then use the app.

ArcCare does not pretend to save protected care data when Supabase is missing. It will ask for configuration and login before saving readings or photos.

## MVP Coverage

- Account signup, login, logout, and password reset through Supabase Auth
- Profile setup
- Today’s Care dashboard
- Pulse oximeter photo capture, OCR attempt, confirmation, secure upload, and history
- Blood pressure photo capture, OCR attempt, confirmation, secure upload, and history
- Watch summary screenshot upload with OCR attempt and confirmation
- Weight logs
- Medication tracking, medication logs, bottle photo capture path, and refill actions
- Appointments
- Provider questions
- Caregiver invite records with RLS support
- Provider report preview, PDF download, print, and mailto email handoff
- Privacy and safety note with no diagnosis or medication guidance

## Important

Full Fitbit OAuth and Apple HealthKit are intentionally not included in version one. ArcCare uses watch summary screenshot/photo upload as requested.
