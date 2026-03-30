/**
 * Copy this file to firebase-config.js and replace with your Firebase web app config.
 * You can find this in Firebase console > Project settings > Your apps > Web app.
 */
window.LEADLOOP_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Optional: set your deployed region and project ID for the chat function URL.
// If omitted, the app will use mock replies in the dashboard preview and widget.
window.LEADLOOP_RUNTIME = {
  projectId: "YOUR_PROJECT_ID",
  region: "us-central1"
};
