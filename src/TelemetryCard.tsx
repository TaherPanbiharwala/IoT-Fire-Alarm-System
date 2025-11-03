// src/TelemetryCard.tsx
import React from "react";
// src/TelemetryCard.tsx
import { useSensors } from "../hooks/useSensors";

export default function TelemetryCard() {
  const sensors = useSensors();
  const s = sensors["esp32-fire-001"] || {};
  return (
    <div style={{padding:16,border:"1px solid #ddd",borderRadius:12}}>
      <h3>Live Telemetry</h3>
      <div>Temp: {s.temperature ?? "-"} °C</div>
      <div>Hum : {s.humidity ?? "-" } %</div>
      <div>Gas : {s.gas ?? "-"} (raw)</div>
      <div>Fire: {s.fire ? "🔥 YES" : "OK"}</div>
      <small>ts: {s.ts ?? "-"}</small>
    </div>
  );
}