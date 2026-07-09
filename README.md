# Focusly — setup guide

Ye ek Vite + React project hai, real Firebase (Google login + Firestore) ke saath.
Ye Claude ke browser preview me nahi chalega (no network access wahan) — apne
computer par ya Claude Code me chalao.

## 1. Install

```bash
npm install
```

## 2. Firebase Console me 2 kaam karo

1. **Authentication → Sign-in method → Google → Enable** karo.
   (Authorized domain me `localhost` already hota hai; jab deploy karoge to
   apna real domain bhi add karna — e.g. Vercel/Netlify wala URL.)
2. **Firestore Database → Create database** (production mode) karo, phir
   yahi repo ka `firestore.rules` file Firestore console me paste kar do
   (ya `firebase deploy --only firestore:rules` agar Firebase CLI use kar rahe ho).
   Ye rule ensure karta hai ki har user sirf apna hi data padh/likh sake.

`src/firebase.js` me tumhara config already daala hua hai — kuch change nahi karna.

## 3. Run

```bash
npm run dev
```

Browser me `http://localhost:5173` khulega. "Continue with Google" dabao —
real Google popup aayega, sign-in hone ke baad data Firestore me save hoga.

## Data model (Firestore)

```
users/{uid}                      → { name, email, photoURL, lastLogin }
users/{uid}/studyDays/{YYYY-MM-DD} → { seconds }   // one doc per "study day" (resets 4am)
users/{uid}/tasks/{taskId}       → {
  title, tag, elapsed, running, done, createdAt,
  goals: [{ id, text, done, photoPath }]   // photoPath = Telegram file path, not a raw URL
}
```

- **Stopwatch** local har second tick karta hai, Firestore me har ~8 seconds
  sync hota hai, aur ab tab background/close hone par bhi turant flush hota
  hai (`visibilitychange` / `beforeunload` / `pagehide`) — pehle wahi seconds
  kho jaate the.
- **4 AM auto-reset**: `dayKeyFor()` (`src/lib/time.js`) 4am se pehle ka time
  pichhle din ka maanta hai.
- **Calendar + Graph**: ab ek hi tab me hain — Calendar ke neeche graph
  (7-day / 1-month toggle) dikhta hai.
- **Tasks + Goals**: task khol kar usme "goals" (sub-steps) add karo. Har goal
  ek photo upload karne se complete hota hai (proof). Jaise hi task ke saare
  goals complete ho jaate hain, task khud-ba-khud complete ho jaata hai. Bina
  goals wale tasks purane tarah manual ✓ se complete hote hain.
- **Settings tab** (bottom-nav ka aakhri icon ab settings hai, graph nahi):
  profile photo/name, total study time, tasks completed, goals completed,
  aur logout.

## AI Chat + photo-upload storage — ARCHITECTURE

Client kabhi bhi OpenAI ya Telegram key nahi dekhta. Teen **Vercel
serverless functions** (`api/`) beech me hain:

| Function                | Kaam |
|--------------------------|------|
| `openai-chat.js`         | Chat text + notes-photo ko GPT-4o-mini (vision) ko forward karta hai |
| `telegram-upload.js`     | Goal-proof photo Telegram bot ke via ek private chat me upload karta hai, sirf `file_path` return karta hai (poora URL nahi — usme bot token hota) |
| `telegram-file.js`       | Us `file_path` ko frontend ke liye serve/proxy karta hai — token yahin server-side rehta hai |

### Keys kaha daalein

Koi bhi key kisi file me edit nahi karni — sab **Vercel dashboard** me
web browser se hi set hoti hain (PC/terminal ki zaroorat nahi):

**Project → Settings → Environment Variables**

```
OPENROUTER_API_KEY=sk-or-v1-...
# Optional — defaults to google/gemini-2.0-flash-001 (vision-capable, cheap).
# Any vision-capable model listed at https://openrouter.ai/models works here.
OPENROUTER_MODEL=google/gemini-2.0-flash-001
TELEGRAM_BOT_TOKEN=1234:ABC...
TELEGRAM_CHAT_ID=-100xxxxxxxxxx
```

## Deploy (GitHub + Vercel, bina PC ke)

1. GitHub par ek naya repo banao aur "Add file → Upload files" se is poore
   project folder ki files upload kar do (mobile browser se bhi ho jaata hai).
2. [vercel.com](https://vercel.com) par account banao (GitHub se login karo)
   → **"Add New... → Project"** → apna repo import karo.
3. Vercel Vite framework khud detect kar lega (build command `npm run
   build`, output `dist`) — kuch change karne ki zaroorat nahi.
4. Deploy se pehle ya baad me upar wale 3 environment variables add kar do
   (Settings → Environment Variables), phir **"Redeploy"** kar do taaki nayi
   values ke saath build ho.

Vercel khud `npm install` + `npm run build` apne server par chalata hai —
tumhare PC ki zaroorat nahi padti.
