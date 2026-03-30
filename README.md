# LeadLoop Firebase SaaS Starter

This is a Firebase-backed upgrade of the SaaS chatbot builder starter.

## Stack
- Firebase Authentication for owner accounts
- Cloud Firestore for profiles, chatbots, and leads
- Firebase Hosting for the app and widget delivery
- Cloud Functions starter for secure OpenAI chat replies

Firebase recommends using the modular JavaScript SDK with npm or modern module loading for web apps, and Hosting is designed for static or SPA-style deployments with optional dynamic backends. citeturn153136search11turn153136search4

## Included
- `public/index.html` — landing page
- `public/app.html` — owner dashboard
- `public/widget.js` — embeddable widget
- `public/assets/styles.css` — design system
- `public/assets/firebase-config.example.js` — config template
- `public/assets/firebase-config.js` — placeholder config file to replace
- `public/assets/firebase-app.js` — Firebase Auth + Firestore helpers
- `firebase.json` — Hosting, Firestore, Functions, emulator config
- `firestore.rules` — starter security rules
- `functions/index.js` — secure AI reply endpoint scaffold
- `example-client-site.html` — widget install example

## Firestore structure
- `users/{uid}`
- `users/{uid}/chatbots/{chatbotId}`
- `users/{uid}/leads/{leadId}`
- `publicChatbots/{chatbotId}`
- `publicLeads/{leadId}`

## Setup
1. Create a Firebase project and register a web app. Firebase setup requires installing the SDK and initializing the app with your project's config. citeturn153136search11
2. Enable:
   - Authentication > Email/Password
   - Firestore Database
3. Copy `public/assets/firebase-config.example.js` to `public/assets/firebase-config.js`
4. Paste your Firebase web config values
5. Install Firebase CLI and log in
6. Run:
   ```bash
   npm install
   cd functions && npm install && cd ..
   firebase init hosting firestore functions
   firebase emulators:start
   ```
7. Deploy:
   ```bash
   firebase deploy
   ```

Firebase Hosting quickstart covers CLI setup and deployment flow, and the Emulator Suite supports local testing for Hosting, Auth, Firestore, and Functions. citeturn153136search1turn153136search8

## OpenAI function setup
Set secrets or environment values for the Functions runtime:
- `OPENAI_API_KEY`
- `OPENAI_MODEL` optional

The included function falls back to mock replies if no OpenAI key is configured.

## Notes
- The widget reads chatbot configuration from `publicChatbots` using the Firestore REST API. The REST API follows Firestore security rules. citeturn153136search15turn153136search21
- The dashboard currently mirrors public leads into each owner's private leads collection when the owner signs in. A production build would usually automate that with a Firestore trigger in Functions.
- Firestore supports realtime listeners if you later want the dashboard to live-update automatically. citeturn153136search18

## Best next upgrades
- Stripe subscriptions
- Firestore trigger to mirror leads automatically
- File uploads or website ingestion
- Conversation logs
- Team accounts and roles
