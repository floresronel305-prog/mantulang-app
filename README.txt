BARANGAY MANTULANG APP v5.0 (Command Center)
Upload ALL files to the root of the GitHub repo (replace same names).

1) FIREBASE RULES (required, do first)
   - Firestore > Rules: paste firestore.rules > Publish
   - Storage > Rules: paste storage.rules > Publish
   - Storage may require the Blaze plan; set a low budget alert.
2) ADMIN SETUP (do not write passwords here; repo is public)
   - Create account in the app, then Firebase > Firestore > users > (that user) > role: official.
   - Next officials: Residents > Make official. Keep officials to a minimum.
3) SECURITY CHECKLIST
   - Google Cloud Console > APIs & Services > Credentials > restrict the Browser API key to your site (HTTP referrers).
   - Authentication > Settings: keep Email/Password only. Enable Firebase App Check if possible.
   - Firebase > Usage: set budget alerts.
4) PASSWORDS: residents who sign up with a REAL email can use "Forgot password?".
   Username-only accounts cannot recover by email: tell them to use a real email.
5) BEFORE PUBLIC LAUNCH
   - Get written approval from the Punong Barangay; name a data protection officer.
   - Ask Passi City LGU for permission to use the city seal (lgu-logo.png).
   - Pilot 2-4 weeks with officials + 10-20 residents, then launch.
   - SOS is supplementary: officials see it only while the app is open. Always publish 911/hotline numbers.
KNOWN LIMITS: poll votes are technically readable by signed-in users; no push notifications when the app is closed.

AI ASSISTANT (v4.1)
 - The Assistant button (bottom-right) answers from the app's own service guide AND the live data it may read (announcements, events, directory, programs, your own requests and complaints), in Filipino or English. It works offline and costs nothing.
 - To connect a real AI model later: build a small server (e.g. on Render) that holds the AI API key as a secret, accepts POST {question, context, role} and returns {reply}. Then put its URL in AI_URL at the top of the assistant section of app.js. NEVER put an API key in app.js or anywhere in this public repo.

REAL AI (ChatGPT-style)
 1) Create an AI key at console.anthropic.com (billed separately per use). 2) Upload the ai-server folder to GitHub. 3) On render.com: New > Web Service > this repo, Root Directory = ai-server, Build = npm install, Start = npm start.
 4) Environment variables on Render: ANTHROPIC_API_KEY, FIREBASE_API_KEY (the apiKey in firebase-config.js), ALLOWED_ORIGIN (your site URL, no trailing slash).
 5) Put the Render URL inside ai-config.js. Never put the AI key in the repo. Only signed-in users can use it (20 questions per 10 minutes each).

v5.0 UPGRADE: CCTV COMMAND CENTER (new files: cctv.js, cctv.css, firestore-cctv.rules, CCTV-SETUP.txt)
 1) Upload ALL files again (app.js, cctv.js, cctv.css, index.html, sw.js are new/changed).
 2) Firestore > Rules: paste the blocks from firestore-cctv.rules INSIDE your existing rules, then Publish.
    Without this step the CCTV page shows "Cannot load cameras".
 3) Read CCTV-SETUP.txt to connect real cameras (RTSP must go through a small gateway such as go2rtc or MediaMTX).
 4) Officials: CCTV > Add camera. Residents only see cameras marked Public (also listed in All services).
 5) Also new: camera pins on the Live map, "Nearby cameras" button on every SOS alert, Access log (audit trail),
    snapshot with timestamp, 1 / 2x2 / 3x3 wall, Monitor mode, weather advisory on Home, Cameras tile on the Dashboard.
