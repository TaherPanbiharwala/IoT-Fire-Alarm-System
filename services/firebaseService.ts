// src/services/firebaseService.ts
// src/services/firebaseService.ts
import {
  ref,
  onValue,
  set,
  serverTimestamp as rtdbServerTimestamp,
} from "firebase/database";

import {
  collection,
  addDoc,
  query,
  orderBy,
  limit as fsLimit,
  getDocs,
  serverTimestamp as fsServerTimestamp,
} from "firebase/firestore";

import {
  getDatabaseSafe,
  getFirestoreSafe,
  DB_STRUCTURE,
  SensorData,
  AlarmData,
  SystemStatus,
} from "../config/firebase";

type Unsubscribe = () => void;

class FirebaseService {
  private listeners: { [key: string]: Unsubscribe } = {};

  // Subscribe to real-time sensor data
  async subscribeToSensorData(
    sensorType: keyof typeof DB_STRUCTURE.REALTIME.SENSORS,
    callback: (data: SensorData) => void
  ): Promise<Unsubscribe | void> {
    const db = await getDatabaseSafe();
    if (!db) {
      console.warn("[FB] RTDB not ready, subscribeToSensorData skipped");
      return;
    }

    const sensorRef = ref(db, DB_STRUCTURE.REALTIME.SENSORS[sensorType]);
    const unsubscribe = onValue(sensorRef, (snapshot) => {
      const data = snapshot.val();
      if (data) callback(data as SensorData);
    });

    this.listeners[sensorType as string] = unsubscribe;
    return unsubscribe;
  }

  // Subscribe to system status
  async subscribeToSystemStatus(
    callback: (status: SystemStatus) => void
  ): Promise<Unsubscribe | void> {
    const db = await getDatabaseSafe();
    if (!db) {
      console.warn("[FB] RTDB not ready, subscribeToSystemStatus skipped");
      return;
    }

    const statusRef = ref(db, DB_STRUCTURE.REALTIME.SYSTEM.STATUS);
    const unsubscribe = onValue(statusRef, (snapshot) => {
      const data = snapshot.val();
      if (data) callback(data as SystemStatus);
    });

    this.listeners["system"] = unsubscribe;
    return unsubscribe;
  }

  // Save sensor data to history in Firestore
  async saveSensorHistory(
    sensorType: keyof typeof DB_STRUCTURE.FIRESTORE.HISTORY,
    data: SensorData
  ) {
    try {
      const fs = await getFirestoreSafe();
      if (!fs) return;

      const historyRef = collection(fs, DB_STRUCTURE.FIRESTORE.HISTORY[sensorType]);
      await addDoc(historyRef, {
        ...data,
        timestamp: fsServerTimestamp(),
        });
    } catch (error) {
      console.error("Error saving sensor history:", error);
    }
  }

  // Save alarm to history
  async saveAlarmHistory(alarmData: AlarmData) {
    try {
      const fs = await getFirestoreSafe();
      if (!fs) return;

      const alarmsRef = collection(fs, DB_STRUCTURE.FIRESTORE.HISTORY.ALARMS);
      await addDoc(alarmsRef, {
        ...alarmData,
        timestamp: fsServerTimestamp(),
        });
    } catch (error) {
      console.error("Error saving alarm history:", error);
    }
  }

  // Get sensor history
  async getSensorHistory(
    sensorType: keyof typeof DB_STRUCTURE.FIRESTORE.HISTORY,
    limitCount: number = 100
  ) {
    try {
      const fs = await getFirestoreSafe();
      if (!fs) return [];

      const historyRef = collection(fs, DB_STRUCTURE.FIRESTORE.HISTORY[sensorType]);
      const q = query(
        historyRef,
        orderBy("timestamp", "desc"),
        fsLimit(limitCount)
      );
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error("Error getting sensor history:", error);
      return [];
    }
  }

  // Update system status
  async updateSystemStatus(status: Partial<SystemStatus>) {
    try {
      const db = await getDatabaseSafe();
      if (!db) return;

      const statusRef = ref(db, DB_STRUCTURE.REALTIME.SYSTEM.STATUS);
      await set(statusRef, {
        ...status,
        lastUpdate: rtdbServerTimestamp(),
        });
    } catch (error) {
      console.error("Error updating system status:", error);
    }
  }

  // Cleanup all listeners
  cleanup() {
    Object.values(this.listeners).forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch {}
    });
    this.listeners = {};
  }
}

export const firebaseService = new FirebaseService();