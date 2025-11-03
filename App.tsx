import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  ScrollView,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Platform,
} from "react-native";
import {/*
  Bars3BottomLeftIcon,
  MagnifyingGlassIcon,
  BellIcon,*/
} from "react-native-heroicons/outline";
import WeatherCard from "./components/WeatherCard";
import SensorCard from "./components/SensorCard";
import { useState, useEffect, useRef, useMemo } from "react";
import { useSensors } from "./hooks/useSensors";
import * as Notifications from "expo-notifications";
import { registerForPushNotificationsAsync } from "./utils/notifications";
import {
  getGasStatus,
  getTemperatureStatus,
  getFireStatus,
} from "./utils/sensorStatus";

const DEVICE_ID = "esp32-fire-001"; // <- must match your ESP32 deviceId/topic

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}

export default function App() {
  // sensorsMap is Record<string, WebSensorData> from the hook
  const sensorsMap = useSensors();

  // ---------- ADAPTER: pick our device and reshape to UI-friendly shape ----------
  // Expecting UI like: sensors.temperature?.value, sensors[key]?.timestamp, etc.
  const sensors = useMemo(() => {
    const d = (sensorsMap && (sensorsMap as any)[DEVICE_ID]) || {};
    const ts = d.ts ?? Math.floor(Date.now() / 1000);

    // Derive buzzer as a virtual sensor (same as before)
    const buzzerOn =
      (d.fire ?? 0) > 0 ||
      (typeof d.temperature === "number" && d.temperature > 50) ||
      (typeof d.gas === "number" && d.gas >= 4000); // align with getGasStatus danger threshold

    return {
      temperature: d.temperature != null ? { value: d.temperature, timestamp: ts } : undefined,
      humidity: d.humidity != null ? { value: d.humidity, timestamp: ts } : undefined,
      gas: d.gas != null ? { value: d.gas, timestamp: ts } : undefined,
      fire: d.fire != null ? { value: d.fire, timestamp: ts } : undefined,
      buzzer: { value: buzzerOn, timestamp: ts },

      // optional extras some cards might read
      // location: d.location,
      // batteryLevel: d.batteryLevel,
    } as {
      temperature?: { value: number; timestamp: number };
      humidity?: { value: number; timestamp: number };
      gas?: { value: number; timestamp: number };
      fire?: { value: number; timestamp: number };
      buzzer: { value: boolean; timestamp: number };
      [key: string]: any;
    };
  }, [sensorsMap]);

  const [greeting, setGreeting] = useState(getGreeting());
  const [search, setSearch] = useState("");
  const [filteredSensors, setFilteredSensors] = useState<string[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  // avoid duplicate push notifications
  const sentAlertRef = useRef({ temp: false, gas: false, fire: false });

  // Which tiles to show
  const sensorKeys = ["gas", "fire", "buzzer"];

  // optional: a one-time test notification (native only)
  useEffect(() => {
    if (Platform.OS !== "web") {
      Notifications.scheduleNotificationAsync({
        content: { title: "Test Notification", body: "This is a test notification!" },
        trigger: null,
      });
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setGreeting(getGreeting()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      setFilteredSensors(sensorKeys);
    } else {
      const lower = search.toLowerCase();
      setFilteredSensors(sensorKeys.filter((key) => key.includes(lower)));
    }
  }, [search, sensors]);

  // Register for push notifications (native only)
  useEffect(() => {
    if (Platform.OS !== "web") registerForPushNotificationsAsync();
  }, []);

  // Notifications on danger transitions (native only)
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!sensors) return;

    // Temperature danger
    if (sensors.temperature?.value != null && sensors.temperature.value > 50) {
      if (!sentAlertRef.current.temp) {
        Notifications.scheduleNotificationAsync({
          content: {
            title: "High Temperature Alert!",
            body: `Temperature is ${sensors.temperature.value}°C!`,
            sound: true,
            priority: Notifications.AndroidNotificationPriority.MAX,
          },
          trigger: null,
        });
        sentAlertRef.current.temp = true;
      }
    } else {
      sentAlertRef.current.temp = false;
    }

    // Gas danger (align with your UI status thresholds)
    if (sensors.gas?.value != null && getGasStatus(sensors.gas.value) === "danger") {
      if (!sentAlertRef.current.gas) {
        Notifications.scheduleNotificationAsync({
          content: {
            title: "Gas Leak Detected!",
            body: `Gas concentration (raw) is ${sensors.gas.value}!`,
            sound: true,
            priority: Notifications.AndroidNotificationPriority.MAX,
          },
          trigger: null,
        });
        sentAlertRef.current.gas = true;
      }
    } else {
      sentAlertRef.current.gas = false;
    }

    // Fire danger
    if (sensors.fire?.value != null && getFireStatus(sensors.fire.value) === "danger") {
      if (!sentAlertRef.current.fire) {
        Notifications.scheduleNotificationAsync({
          content: {
            title: "Fire Detected!",
            body: "Flame sensor has detected a fire!",
            sound: true,
            priority: Notifications.AndroidNotificationPriority.MAX,
          },
          trigger: null,
        });
        sentAlertRef.current.fire = true;
      }
    } else {
      sentAlertRef.current.fire = false;
    }
  }, [sensors]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="py-4 px-6">
        <View className="flex-row items-center justify-between">
          {/* <Bars3BottomLeftIcon size={24} color="#374151" /> */}
          <View className="flex-row items-center gap-x-2">
            <Text className="font-semibold text-xl">Smart Fire Alarm</Text>
            {/* <BellIcon size={20} color="#374151" /> */}
          </View>
          <TouchableOpacity onPress={() => setShowSearch((v) => !v)}>
            {/* <MagnifyingGlassIcon size={24} color="#374151" /> */}
          </TouchableOpacity>
        </View>

        {showSearch && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#fff",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#e5e7eb",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.08,
              shadowRadius: 4,
              elevation: 2,
              marginTop: 16,
              marginBottom: 8,
              paddingHorizontal: 12,
            }}
          >
            {/* <MagnifyingGlassIcon size={20} color="#9ca3af" style={{ marginRight: 8 }} /> */}
            <TextInput
              placeholder="Search sensor name (e.g. gas, fire, ...)..."
              value={search}
              onChangeText={setSearch}
              style={{ flex: 1, fontSize: 16, paddingVertical: 10, color: "#111827" }}
              placeholderTextColor="#9ca3af"
              autoFocus
            />
          </View>
        )}

        <View className="mt-4 flex-row items-center gap-x-2">
          <Text className="text-gray-800 text-lg font-semibold">{greeting},</Text>
          <Text className="text-orange-600 text-lg font-semibold">Kien Duong Trung</Text>
        </View>

        <WeatherCard
          temperature={sensors.temperature?.value ?? 0}
          humidity={sensors.humidity?.value ?? 0}
        />

        <View className="mt-6">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-gray-800 text-lg font-semibold">Sensor Status</Text>
            <Text className="text-orange-600 text-sm">View All</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {filteredSensors.map((key) => {
              const sensorType = key as "gas" | "fire" | "buzzer";
              const sensorValue =
                sensors[key]?.value ?? (key === "buzzer" ? false : 0);

              const sensorStatus =
                key === "gas"
                  ? getGasStatus(sensors.gas?.value ?? 0)
                  : key === "fire"
                  ? getFireStatus(sensors.fire?.value ?? 0)
                  : "normal";

              return (
                <SensorCard
                  key={key}
                  type={sensorType}
                  value={sensorValue}
                  status={sensorStatus}
                  lastUpdate={
                    sensors[key]?.timestamp
                      ? new Date(sensors[key].timestamp * 1000).toLocaleString()
                      : "-"
                  }
                  threshold={key === "gas" ? 500 : key === "fire" ? 1 : undefined}
                  // optional — fill if you add these in telemetry
                  location={sensors[key]?.location}
                  batteryLevel={sensors[key]?.batteryLevel}
                />
              );
            })}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}