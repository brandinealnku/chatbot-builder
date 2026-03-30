import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const firebaseConfig = window.LEADLOOP_FIREBASE_CONFIG || null;
const runtimeConfig = window.LEADLOOP_RUNTIME || {};

let app = null;
let auth = null;
let db = null;

export function hasFirebaseConfig() {
  return !!firebaseConfig && firebaseConfig.projectId && firebaseConfig.projectId !== "REPLACE_ME";
}

export function initFirebase() {
  if (!hasFirebaseConfig()) {
    throw new Error("Firebase config is missing. Update public/assets/firebase-config.js first.");
  }
  if (app) return { app, auth, db, runtimeConfig };
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  return { app, auth, db, runtimeConfig };
}

export function getServices() {
  if (!app) initFirebase();
  return { app, auth, db, runtimeConfig };
}

export async function signUpWithEmail(email, password, profile) {
  const { auth, db } = getServices();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, "users", cred.user.uid), {
    email,
    fullName: profile.fullName,
    companyName: profile.companyName,
    plan: "Starter",
    createdAt: serverTimestamp()
  }, { merge: true });
  return cred.user;
}

export async function signInWithEmail(email, password) {
  const { auth } = getServices();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export function watchAuth(callback) {
  const { auth } = getServices();
  return onAuthStateChanged(auth, callback);
}

export async function loadUserProfile(uid) {
  const { db } = getServices();
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export async function saveChatbot(uid, chatbot) {
  const { db } = getServices();
  const chatbotRef = chatbot.id
    ? doc(db, "users", uid, "chatbots", chatbot.id)
    : doc(collection(db, "users", uid, "chatbots"));
  const data = {
    ...chatbot,
    id: chatbotRef.id,
    ownerId: uid,
    updatedAt: serverTimestamp(),
    createdAt: chatbot.createdAt || serverTimestamp()
  };
  await setDoc(chatbotRef, data, { merge: true });

  // public mirror for widget access
  await setDoc(doc(db, "publicChatbots", chatbotRef.id), {
    ...data,
    ownerId: uid,
    publicUpdatedAt: serverTimestamp()
  }, { merge: true });

  const saved = await getDoc(chatbotRef);
  return saved.data();
}

export async function listChatbots(uid) {
  const { db } = getServices();
  const q = query(collection(db, "users", uid, "chatbots"), orderBy("updatedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
}

export async function listRecentLeads(uid) {
  const { db } = getServices();
  const q = query(collection(db, "users", uid, "leads"), orderBy("createdAt", "desc"), limit(12));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
}

export async function createLeadMirror(uid, lead) {
  const { db } = getServices();
  const ref = doc(collection(db, "users", uid, "leads"));
  await setDoc(ref, {
    ...lead,
    id: ref.id,
    createdAt: serverTimestamp()
  }, { merge: true });
}

export async function logOut() {
  const { auth } = getServices();
  await signOut(auth);
}

export function getFunctionUrl(name) {
  if (!runtimeConfig.projectId || runtimeConfig.projectId === "YOUR_PROJECT_ID" || runtimeConfig.projectId === "REPLACE_ME") {
    return null;
  }
  const region = runtimeConfig.region || "us-central1";
  return `https://${region}-${runtimeConfig.projectId}.cloudfunctions.net/${name}`;
}
