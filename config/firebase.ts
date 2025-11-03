// src/config/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import type { Database } from "firebase/database";
import type { Firestore } from "firebase/firestore";
import Constants from "expo-constants";

// Read values from app.json -> expo.extra + fallback to real env vars
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

const cfg = {
  apiKey:
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY ??
    extra.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ??
    extra.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL:
    process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL ??
    extra.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId:
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ??
    extra.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    extra.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_SENDER_ID ??
    extra.EXPO_PUBLIC_FIREBASE_SENDER_ID,
  appId:
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID ??
    extra.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId:
    process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ??
    extra.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Small sanity log (you already saw this, but now it should be filled)
if (!cfg.apiKey || !cfg.projectId || !cfg.databaseURL || !cfg.appId) {
  console.warn("⚠️ Firebase not fully configured!");
  console.table(cfg);
  console.error(
    "Missing or empty Firebase keys:",
    ["apiKey", "projectId", "databaseURL", "appId"].filter(
      (k) => !(cfg as any)[k]
    )
  );
}

// --- SANITY CHECK + LOGGING --- //
const requiredKeys = [
  "apiKey",
  "projectId",
  "databaseURL",
  "appId",
] as const;

const missingKeys = requiredKeys.filter(
  (k) => !cfg[k] || cfg[k]?.trim().length === 0
);

export const firebaseReady =
  missingKeys.length === 0 &&
  !!cfg.databaseURL &&
  cfg.databaseURL.startsWith("https://");

if (!firebaseReady) {
  console.warn("⚠️ Firebase not fully configured!");
  console.table(cfg);
  if (missingKeys.length > 0) {
    console.error(
      `Missing or empty Firebase keys: ${missingKeys.join(", ")}`
    );
  }
} else {
  console.log("✅ Firebase config looks valid!");
}

// --- APP INIT --- //
let app = getApps().length ? getApps()[0] : undefined;
if (!app && firebaseReady) {
  try {
    app = initializeApp(cfg);
    console.log("🔥 Firebase initialized successfully");
  } catch (err) {
    console.error("❌ Firebase init failed:", err);
  }
}

// --- LAZY HELPERS --- //
export async function getDatabaseSafe(): Promise<Database | null> {
  if (!firebaseReady || !app) {
    console.warn("⚠️ getDatabaseSafe() called before Firebase ready");
    return null;
  }
  try {
    const { getDatabase } = await import("firebase/database");
    return getDatabase(app);
  } catch (err) {
    console.error("❌ Failed to import firebase/database:", err);
    return null;
  }
}

export async function getFirestoreSafe(): Promise<Firestore | null> {
  if (!firebaseReady || !app) {
    console.warn("⚠️ getFirestoreSafe() called before Firebase ready");
    return null;
  }
  try {
    const { getFirestore } = await import("firebase/firestore");
    return getFirestore(app);
  } catch (err) {
    console.error("❌ Failed to import firebase/firestore:", err);
    return null;
  }
}

// --- STRUCTURE --- //
export const DB_STRUCTURE = {
  REALTIME: {
    SENSORS: {
      GAS: "sensors/gas",
      FIRE: "sensors/fire",
      TEMPERATURE: "sensors/temperature",
      HUMIDITY: "sensors/humidity",
      BUZZER: "sensors/buzzer",
    },
    SYSTEM: {
      STATUS: "system/status",
      BATTERY: "system/battery",
      LAST_UPDATE: "system/lastUpdate",
    },
  },
  FIRESTORE: {
    HISTORY: {
      GAS: "gasHistory",
      FIRE: "fireHistory",
      TEMPERATURE: "temperatureHistory",
      HUMIDITY: "humidityHistory",
      ALARMS: "alarmsHistory",
    },
  },
};
// --- SHARED DATA TYPES (for services & UI) --- //
export interface SensorData {
  value: number;
  timestamp: number;
  status: "normal" | "warning" | "danger";
  location: string;
  batteryLevel: number;
}

export interface AlarmData {
  type: "gas" | "fire" | "temperature";
  value: number;
  timestamp: number;
  status: "active" | "resolved";
  location: string;
  resolvedAt?: number;
  resolvedBy?: string;
}

export interface SystemStatus {
  isOnline: boolean;
  lastUpdate: number;
  batteryLevel: number;
  firmwareVersion: string;
  signalStrength: number;
}