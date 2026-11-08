# Barangay Mantulang App (Passi City)

1. Firebase Console: create project, add a Web app, enable Authentication (Email/Password) and Firestore.
2. Paste your config into `js/firebase-config.js`.
3. Paste `firestore.rules` into Firestore > Rules > Publish.
4. Run locally: `npx serve .` (ES modules need http, not file://). Deploy with `firebase deploy` (Hosting).
5. Make an official: register the account, then in Firestore > users > (that user) change `role` from `resident` to `official`.
   Do this only in the console; the rules block users from changing their own role.

## Upgrade notes
- Also publish `storage.rules` (Firebase Console > Storage > Rules) and enable Storage.
- Residents must be verified by an official (Residents > Verify resident) before they can request certificates.
  Residents registered before this upgrade have no `verified` field, so verify them once.
