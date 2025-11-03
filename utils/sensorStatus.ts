// src/utils/sensorStatus.ts

export type SensorStatus = "normal" | "warning" | "danger" | "unknown";

const GAS_WARN_RAW   = 1400; // same as Arduino
const GAS_DANGER_RAW = 1800;

export function getGasStatus(raw: number | null | undefined): SensorStatus {
  if (raw == null || !Number.isFinite(raw)) return "unknown";

  // raw is 0..4095 from the ESP32
  if (raw >= GAS_DANGER_RAW) return "danger";
  if (raw >= GAS_WARN_RAW)   return "warning";
  return "normal";
}

export function getTemperatureStatus(temp: number | null | undefined): SensorStatus {
  if (temp == null || !Number.isFinite(temp)) return "unknown";
  if (temp >= 70) return "danger";
  if (temp >= 50) return "warning";
  return "normal";
}

export function getFireStatus(fire: number | boolean | null | undefined): SensorStatus {
  if (fire == null) return "unknown";
  const v = typeof fire === "boolean" ? (fire ? 1 : 0) : fire;
  return v > 0 ? "danger" : "normal";
}