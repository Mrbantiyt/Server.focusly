# Study Reminder Push Notifications — Setup Guide

This app now supports a daily "Study reminder" push notification (fixed at
6:00 PM IST for everyone) sent through OneSignal, delivered via your
Median-wrapped native app. There are 3 setup steps — none of them are code
changes, they're dashboard configuration.

## 1. Create a OneSignal account & app

1. Go to https://onesignal.com and sign up (free).
2. Create a new OneSignal App (e.g. "Focusly").
3. Under **Settings → Keys & IDs**, copy:
   - **OneSignal App ID**
   - **REST API Key**

## 2. Connect OneSignal to your Median app

1. In Median App Studio, open your Focusly app.
2. Go to **Native Plugins → OneSignal**.
3. Paste in the **OneSignal App ID** from step 1.
4. Follow Median's guide to add your Android (Firebase/FCM) and/or iOS
   (APNs) push credentials — see https://docs.median.co/docs/onesignal
5. Rebuild your Median app so the OneSignal SDK is bundled in.

Once this is done, Median automatically:
- Prompts users for push permission on first launch
- Registers each device with OneSignal and assigns it a
  `oneSignalUserId`, which this app's `src/lib/median.js` reads and saves
  to that user's Firestore profile.

## 3. Add environment variables in Vercel

In your Vercel project → **Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `ONESIGNAL_APP_ID` | from step 1 |
| `ONESIGNAL_REST_API_KEY` | from step 1 |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | a Firebase service account JSON, minified to one line — see below |

### Getting a Firebase service account key

1. Firebase Console → your project (`focuslyread`) → ⚙️ **Project settings**
   → **Service accounts** tab.
2. Click **Generate new private key** → downloads a `.json` file.
3. Minify it to a single line (e.g. `node -e "console.log(JSON.stringify(require('./the-file.json')))"`)
   and paste that whole line as the value of `FIREBASE_SERVICE_ACCOUNT_KEY`.

`CRON_SECRET` does not need to be set manually — Vercel provisions it
automatically once you have a `crons` entry in `vercel.json` (already added).

## How it works day-to-day

- Users toggle **Settings → Notifications → Study reminder** on/off.
- Every day at 12:30 UTC (6:00 PM IST), Vercel Cron calls
  `/api/send-study-reminders`, which reads Firestore for every user with
  the reminder enabled and a registered device, and sends them a push via
  OneSignal's REST API.
- Vercel's free (Hobby) plan only allows cron jobs to run once per day, so
  right now everyone shares the same 6:00 PM reminder time — there's no
  per-user custom time yet.

## Testing without waiting for the cron

You can manually trigger a test send by calling the API route with the
`CRON_SECRET` as a bearer token (find the value in Vercel → Settings →
Environment Variables, under the auto-provisioned `CRON_SECRET`):

```bash
curl -X POST https://your-app.vercel.app/api/send-study-reminders \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```
