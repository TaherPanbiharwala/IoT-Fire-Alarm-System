// src/config/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import type { Database } from "firebase/database";
import type { Firestore } from "firebase/firestore";

const cfg = {
  apiKey:        process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL:   process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId:     process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_SENDER_ID,
  appId:         process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// minimal validation (RTDB must be present!)
export const firebaseReady =
  !!cfg.apiKey && !!cfg.projectId && !!cfg.databaseURL && cfg.databaseURL!.startsWith("https://");

let app = getApps().length ? getApps()[0] : undefined;
if (!app && firebaseReady) {
  app = initializeApp(cfg);
}

// Lazy getters (so Expo Web can treeshake and we avoid module-ID errors)
export async function getDatabaseSafe(): Promise<Database | null> {
  if (!firebaseReady || !app) return null;
  const { getDatabase } = await import("firebase/database");
  return getDatabase(app);
}

export async function getFirestoreSafe(): Promise<Firestore | null> {
  if (!firebaseReady || !app) return null;
  const { getFirestore } = await import("firebase/firestore");
  return getFirestore(app);
}

// Paths used by your updater
export const DB_STRUCTURE = {
  REALTIME: {
    SENSORS: {
      GAS:         "sensors/gas",
      FIRE:        "sensors/fire",
      TEMPERATURE: "sensors/temperature",
      HUMIDITY:    "sensors/humidity",
      BUZZER:      "sensors/buzzer",
    },
    SYSTEM: {
      STATUS:      "system/status",
      BATTERY:     "system/battery",
      LAST_UPDATE: "system/lastUpdate",
    },
  },
  FIRESTORE: {
    HISTORY: {
      GAS:         "history/gas",
      FIRE:        "history/fire",
      TEMPERATURE: "history/temperature",
      HUMIDITY:    "history/humidity",
      ALARMS:      "history/alarms",
    },
  },
};