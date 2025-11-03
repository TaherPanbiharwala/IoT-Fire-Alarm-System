// src/config/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getDatabase, type Database, serverTimestamp as rtdbServerTimestamp } from "firebase/database";
import { getFirestore, type Firestore, serverTimestamp as fsServerTimestamp } from "firebase/firestore";
import Constants from "expo-constants";

// Read from app.json -> expo.extra
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

const cfg = {
  apiKey:             extra.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:         extra.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL:        extra.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId:          extra.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:      extra.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:  extra.EXPO_PUBLIC_FIREBASE_SENDER_ID,
  appId:              extra.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId:      extra.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const firebaseReady =
  !!cfg.apiKey && !!cfg.projectId && !!cfg.databaseURL && !!cfg.appId;

if (!firebaseReady) {
  console.warn("⚠️ Firebase not fully configured!");
  console.table(cfg);
} else {
  console.log("✅ Firebase config looks valid!");
}

let app = getApps()[0];
if (!app && firebaseReady) {
  app = initializeApp(cfg);
  console.log("🔥 Firebase initialized successfully");
}

// ─── SAFE HELPERS (keeps the same async API you already use) ───
export async function getDatabaseSafe(): Promise<Database | null> {
  if (!firebaseReady || !app) return null;
  return getDatabase(app);
}

export async function getFirestoreSafe(): Promise<Firestore | null> {
  if (!firebaseReady || !app) return null;
  return getFirestore(app);
}

// Optional helpers if you ever want them elsewhere
export const RTDB_SERVER_TIMESTAMP = rtdbServerTimestamp;
export const FS_SERVER_TIMESTAMP   = fsServerTimestamp;

// Types used by firebaseService.ts
export interface SensorData {
  value: number;
  timestamp: number;
  status: string;
}

export interface AlarmData {
  type: "gas" | "temperature" | "fire" | "system";
  message: string;
  level: "warning" | "danger";
  ts?: any;
}

export interface SystemStatus {
  online: boolean;
  lastUpdate: number;
  battery?: number;
}

// Paths used throughout the app
// src/config/firebase.ts
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
      GAS:         "history_gas",
      FIRE:        "history_fire",
      TEMPERATURE: "history_temperature",
      HUMIDITY:    "history_humidity",
      ALARMS:      "history_alarms",
    },
  },
};