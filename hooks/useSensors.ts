// src/hooks/useSensors.ts
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { Client, Message } from "paho-mqtt";

import { getGasStatus, getTemperatureStatus, getFireStatus } from "../utils/sensorStatus";
import { notifyDanger } from "../utils/notifications";

// --- types ---
type MinimalSensor = {
  temperature?: number;
  humidity?: number;
  gas?: number;
  fire?: number; // 0/1
  ts?: number;
};

type SensorMap = Record<string, MinimalSensor>;

const DEVICE_ID = "esp32-fire-001";
const BASE_TOPIC = `iot/firealarm/${DEVICE_ID}`;

export function useSensors() {
  const [sensors, setSensors] = useState<SensorMap>({});
  const prevStatusRef = useRef<{ gas?: string; temp?: string; fire?: string }>({});

  // ---------------- WEB: MQTT subscriber (+ optional Firebase writes) ----------------
  useEffect(() => {
    if (Platform.OS !== "web") return;

    const isHttps = window.location.protocol === "https:";
    const brokerUrl = isHttps
      ? "wss://broker.hivemq.com:8884/mqtt"
      : "ws://broker.hivemq.com:8000/mqtt";

    const clientId = "web-" + Math.random().toString(16).slice(2);
    const client = new Client(brokerUrl, clientId);

    client.onConnectionLost = (resp) => {
      if (resp && resp.errorCode !== 0) {
        console.warn("Paho connection lost:", resp.errorMessage ?? "Unknown error");
      }
    };

    client.onMessageArrived = async (msg: Message) => {
      const topic = msg.destinationName;
      const txt = msg.payloadString ?? "";
      console.log("[MQTT] →", topic, txt);

      try {
        const raw: any = JSON.parse(txt);

        const temp =
          typeof raw.temperature === "number"
            ? raw.temperature
            : typeof raw.temp === "number"
            ? raw.temp
            : undefined;

        const humidity = typeof raw.humidity === "number" ? raw.humidity : undefined;

        const gasRaw =
          typeof raw.gas_raw === "number"
            ? raw.gas_raw
            : typeof raw.gas === "number"
            ? raw.gas
            : undefined;

        const fireVal =
          typeof raw.fire === "number"
            ? raw.fire
            : typeof raw.fire === "boolean"
            ? raw.fire
              ? 1
              : 0
            : typeof raw.flame === "number"
            ? raw.flame
            : undefined;

        const ts = typeof raw.ts === "number" ? raw.ts : Math.floor(Date.now() / 1000);

        // 1) Update UI state
        setSensors({
          [DEVICE_ID]: {
            temperature: temp,
            humidity,
            gas: typeof gasRaw === "number" ? Math.round(gasRaw) : undefined,
            fire: typeof fireVal === "number" ? fireVal : undefined,
            ts,
          },
        });

        // 2) OPTIONAL: write to Firebase
        try {
          const {
            firebaseReady,
            getDatabaseSafe,
            getFirestoreSafe,
            DB_STRUCTURE,
          } = await import("../config/firebase");

          if (!firebaseReady) {
            console.warn("[FB] not ready – check EXPO_PUBLIC_* env + databaseURL");
            return;
          }

          const rtdb = await getDatabaseSafe();
          const fs = await getFirestoreSafe();
          if (!rtdb || !fs) {
            console.warn("[FB] app/services unavailable");
            return;
          }

          const { ref, update } = await import("firebase/database");
          const { collection, addDoc, serverTimestamp } = await import(
            "firebase/firestore"
          );

          await update(ref(rtdb), {
            [DB_STRUCTURE.REALTIME.SENSORS.GAS]: {
              value: gasRaw ?? -1,
              timestamp: ts,
              status: getGasStatus(Math.round(gasRaw ?? 0)),
            },
            [DB_STRUCTURE.REALTIME.SENSORS.FIRE]: {
              value: fireVal ?? 0,
              timestamp: ts,
              status: getFireStatus(fireVal ?? 0),
            },
            [DB_STRUCTURE.REALTIME.SENSORS.TEMPERATURE]: {
              value: temp ?? -1,
              timestamp: ts,
              status: getTemperatureStatus(temp ?? -100),
            },
            [DB_STRUCTURE.REALTIME.SENSORS.HUMIDITY]: {
              value: humidity ?? -1,
              timestamp: ts,
              status: "normal",
            },
            [DB_STRUCTURE.REALTIME.SENSORS.BUZZER]: {
              value: (fireVal ?? 0) > 0,
              timestamp: ts,
              status: (fireVal ?? 0) > 0 ? "danger" : "normal",
            },
            [DB_STRUCTURE.REALTIME.SYSTEM.LAST_UPDATE]: ts,
          });

          if (typeof gasRaw === "number") {
            await addDoc(collection(fs, DB_STRUCTURE.FIRESTORE.HISTORY.GAS), {
              value: Math.round(gasRaw),
              ts: serverTimestamp(),
            });
          }
          if (typeof temp === "number") {
            await addDoc(
              collection(fs, DB_STRUCTURE.FIRESTORE.HISTORY.TEMPERATURE),
              { value: temp, ts: serverTimestamp() }
            );
          }
          if (typeof fireVal === "number") {
            await addDoc(collection(fs, DB_STRUCTURE.FIRESTORE.HISTORY.FIRE), {
              value: fireVal,
              ts: serverTimestamp(),
            });
          }
        } catch (fbErr) {
          console.error("[FB write] failed:", fbErr);
        }
      } catch (e) {
        console.warn("MQTT parse error:", e);
      }
    };

    client.connect({
      onSuccess: () => {
        console.log("Paho connected");
        // while debugging, subscribe wide:
        client.subscribe("iot/firealarm/#");
        // later you can narrow to `${BASE_TOPIC}/telemetry`
      },
      useSSL: isHttps,
      reconnect: true,
      keepAliveInterval: 30,
      timeout: 5,
    });

    return () => {
      try {
        client.disconnect();
      } catch {}
    };
  }, []);

  // ---------------- NATIVE: read from Firebase (lazy imports) ----------------
  useEffect(() => {
    if (Platform.OS === "web") return;

    let off: (() => void) | undefined;

    (async () => {
      const { getDatabaseSafe } = await import("../config/firebase");
      const db = await getDatabaseSafe();
      if (!db) return;

      const { ref, onValue } = await import("firebase/database");
      const sensorsRef = ref(db, "sensors");
      off = onValue(sensorsRef, (snap) =>
        setSensors((snap.val() || {}) as SensorMap)
      );
    })();

    return () => {
      try {
        off && off();
      } catch {}
    };
  }, []);

  // ---------------- NATIVE: local danger notifications ----------------
  useEffect(() => {
    if (Platform.OS === "web") return;

    Object.entries(sensors).forEach(([key, val]) => {
      if (!val) return;
      const s = val;

      const gasStatus =
        typeof s.gas === "number" ? getGasStatus(s.gas) : "normal";
      const tempStatus =
        typeof s.temperature === "number"
          ? getTemperatureStatus(s.temperature)
          : "normal";
      const fireStatus =
        typeof s.fire === "number" ? getFireStatus(s.fire) : "normal";

      const prev = prevStatusRef.current;

      if (gasStatus === "danger" && prev.gas !== "danger") {
        notifyDanger(
          "Gas Alert",
          `High gas level on ${key}${s.gas != null ? ` (raw ${s.gas})` : ""}`
        );
      }
      if (tempStatus === "danger" && prev.temp !== "danger") {
        notifyDanger(
          "Overheat Alert",
          `High temperature on ${key}${
            s.temperature != null ? ` (${s.temperature.toFixed(1)}°C)` : ""
          }`
        );
      }
      if (fireStatus === "danger" && prev.fire !== "danger") {
        notifyDanger("FIRE Detected", `Flame sensor triggered on ${key}`);
      }

      prevStatusRef.current = { gas: gasStatus, temp: tempStatus, fire: fireStatus };
    });
  }, [sensors]);

  return sensors;
}