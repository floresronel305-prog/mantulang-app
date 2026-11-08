BARANGAY MANTULANG APP v3.5 (launch-ready)
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
 - The Assistant button (bottom-right) answers from the app's own service guide, in Filipino or English. It works offline and costs nothing.
 - To connect a real AI model later: build a small server (e.g. on Render) that holds the AI API key as a secret, accepts POST {question, context, role} and returns {reply}. Then put its URL in AI_URL at the top of the assistant section of app.js. NEVER put an API key in app.js or anywhere in this public repo.
