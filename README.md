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
3. **Weekly leaderboard index**: `firestore.indexes.json` me ek composite
   index diya hai (`weekStartKey` + `weeklyStudySeconds`) jo weekly (Monday
   reset) leaderboard query ke liye zaroori hai. Deploy karo:
   ```bash
   firebase deploy --only firestore:indexes
   ```
   Ya Firebase CLI na ho to: app chalao, ek baar Leaderboard kholo — console
   me ek error aayega jisme ek direct link hoga index create karne ke liye,
   uspe click karke "Create Index" daba do (build hone me 1-2 min lagte hain).

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
- **Tasks**: task complete manual ✓ se hota hai. (Pehle iske andar "goals"
  sub-steps + proof-photo feature bhi tha, jo ab hata diya gaya hai — is app
  me Goals system use nahi hota.)
- **Settings tab** (bottom-nav ka aakhri icon ab settings hai, graph nahi):
  profile photo/name, total study time, tasks completed,
  aur logout.

## AI Chat + photo-upload storage — ARCHITECTURE

Client kabhi bhi OpenAI ya Telegram key nahi dekhta. Teen **Vercel
serverless functions** (`api/`) beech me hain:

| Function                | Kaam |
|--------------------------|------|
| `openai-chat.js`         | Chat text + notes-photo ko GPT-4o-mini (vision) ko forward karta hai |
| `telegram-upload.js`     | Photo Telegram bot ke via ek private chat me upload karta hai, sirf `file_path` return karta hai (poora URL nahi — usme bot token hota) |
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

## Email OTP verification (signup) — ARCHITECTURE

Signup ke turant baad account ban jaata hai aur user turant app use kar
sakta hai (verification account creation ko block nahi karta) — lekin ek
6-digit OTP unke email par bhej diya jaata hai (Nodemailer + Gmail SMTP se).
Jab tak woh code verify nahi karte, main app ke top par ek chhota "Verify
your email" banner dikhta rehta hai (StatusBar ke upar), jispe tap karke OTP
enter kar sakte hain.

| Function            | Kaam |
|---------------------|------|
| `send-otp.js`       | 6-digit OTP generate karta hai, uska SHA-256 hash `otps/{uid}` (Firestore, Admin SDK only) me 10-min expiry ke saath save karta hai, aur raw code Gmail SMTP se email karta hai |
| `verify-otp.js`      | User ne jo code enter kiya usko hash karke match karta hai; sahi hone par `users/{uid}.emailVerified = true` set karta hai (client khud yeh field kabhi set nahi kar sakta — dekho `firestore.rules`) |
| `_lib/mailer.js`     | Nodemailer transport — Gmail SMTP use karta hai |

Dono endpoints Firebase ID token maangte hain (`Authorization: Bearer
<token>`), taaki koi bhi user sirf apne hi account ke liye OTP request/verify
kar sake, kisi aur ke liye nahi. Galat code baar-baar try karne par (5 galat
attempts) naya code maangna padta hai — brute-force se bachne ke liye.

### Gmail App Password kaise banayein

1. Jis Gmail account se emails bhejni hain, uspe
   [myaccount.google.com/security](https://myaccount.google.com/security) par
   jaake **2-Step Verification** ON karo (agar pehle se nahi hai).
2. Phir [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   par jaao, ek naam do (jaise "Focusly"), **Generate** dabao.
3. Jo 16-character password milega (spaces ke saath, jaise `abcd efgh ijkl
   mnop`) — usi ko `GMAIL_APP_PASSWORD` env var me daalo (spaces hata ke ya
   waise hi, dono chalega).

### Keys kaha daalein (yeh bhi upar wali list me add karo)

```
GMAIL_USER=youraddress@gmail.com
GMAIL_APP_PASSWORD=abcdefghijklmnop
```



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
