#include <WiFi.h>
#include <PubSubClient.h>
#include "DHT.h"

#define DHTPIN   15
#define DHTTYPE  DHT22

// Analog inputs
#define GAS_PIN    34      // MQ-2 analog
#define FLAME_PIN  35      // LDR analog (lower = brighter)

// Outputs
#define BUZZER_PIN 27
#define LED_PIN    26

// WiFi
const char* ssid     = "Wokwi-GUEST";
const char* password = "";

// MQTT
const char* mqttServer = "broker.hivemq.com";
const uint16_t mqttPort = 1883;
const char* deviceId = "esp32-fire-001";
String baseTopic = String("iot/firealarm/") + deviceId;

// Objects
WiFiClient     espClient;
PubSubClient   client(espClient);
DHT            dht(DHTPIN, DHTTYPE);

// ---------- Tunables ----------
const uint32_t LOOP_MS              = 1000;   // publish / sample rate (1 Hz)
const uint32_t CALIBRATION_MS       = 5000;   // LDR baseline capture on boot
const float    EMA_ALPHA            = 0.8f;   // smoothing for flame only
const float    GAS_DANGER_RAW       = 1800.0; // adjust to your MQ-2 model
const float    GAS_WARN_RAW         = 1400.0;

const float    FLAME_DROP_PCT_ON    = 0.40f;  // 40% drop vs baseline → fire ON
const float    FLAME_DROP_PCT_OFF   = 0.25f;  // 25% drop vs baseline → fire OFF

const float    TEMP_ROR_DELTA       = 8.0f;   // +8°C within window triggers RoR alarm
const uint32_t TEMP_ROR_WINDOW_MS   = 60000;  // 60 s window

const uint32_t ALARM_HOLD_MS        = 2500;   // condition must persist this long
const uint32_t ALARM_COOLDOWN_MS    = 5000;   // after clear, keep siren on for N ms

// ---------- State ----------
unsigned long t_last   = 0;
unsigned long t_boot   = 0;

float flameEMA = NAN;
float ldrBaseline = NAN;        // ambient baseline computed at boot
bool  flameLatched = false;     // hysteresis on processed flame signal

// RoR temperature
float       tempRef      = NAN; // temperature at start of window
unsigned long tempRefT   = 0;

// Debounce / latching
unsigned long fireStartMs  = 0;
unsigned long alarmClearMs = 0;
bool buzzerLatched = false;

// Helpers
static inline float ema(float prev, float sample, float alpha) {
  if (isnan(prev)) return sample;
  return (alpha * sample) + (1.0f - alpha) * prev;
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String t = String(topic);
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];

  if (t == baseTopic + "/cmd") {
    if (msg == "ALARM_ON")  { digitalWrite(BUZZER_PIN, HIGH); digitalWrite(LED_PIN, HIGH);  buzzerLatched = true; }
    if (msg == "ALARM_OFF") { digitalWrite(BUZZER_PIN, LOW);  digitalWrite(LED_PIN, LOW);   buzzerLatched = false; }
  }
}

void reconnect() {
  while (!client.connected()) {
    if (client.connect(deviceId)) {
      client.subscribe((baseTopic + "/cmd").c_str());
    } else {
      delay(750);
    }
  }
}

void setup() {
  pinMode(GAS_PIN,    INPUT);
  pinMode(FLAME_PIN,  INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN,    OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_PIN, LOW);

  Serial.begin(115200);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(200); }

  client.setServer(mqttServer, mqttPort);
  client.setCallback(mqttCallback);

  dht.begin();

  t_boot = millis();
  tempRefT = millis();
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  unsigned long now = millis();
  if (now - t_last < LOOP_MS) return;
  t_last = now;

  // ----- Read raw sensors -----
  float temp = dht.readTemperature(); // °C
  float hum  = dht.readHumidity();    // %
  float gas  = (float)analogRead(GAS_PIN);    // 0..4095 raw gas
  float flameRaw = (float)analogRead(FLAME_PIN);

  // ----- Calibration of LDR baseline on boot -----
  if (now - t_boot < CALIBRATION_MS) {
    ldrBaseline = ema(isnan(ldrBaseline) ? flameRaw : ldrBaseline, flameRaw, 0.2f);
  }
  if (isnan(ldrBaseline)) ldrBaseline = flameRaw; // fallback first cycle

  // ----- Smooth flame sensor -----
  flameEMA = ema(flameEMA, flameRaw, EMA_ALPHA);

  // ----- Dynamic flame decision -----
  float drop = (ldrBaseline > 1.0f) ? ((ldrBaseline - flameEMA) / ldrBaseline) : 0.0f;

  if (!flameLatched && drop >= FLAME_DROP_PCT_ON)  flameLatched = true;
  if ( flameLatched && drop <= FLAME_DROP_PCT_OFF) flameLatched = false;

  // ----- Rate-of-Rise temperature -----
  if (isnan(tempRef)) { tempRef = temp; tempRefT = now; }
  bool rorAlarm = false;
  if (!isnan(temp) && !isnan(tempRef)) {
    if ((now - tempRefT) >= TEMP_ROR_WINDOW_MS) {
      float delta = temp - tempRef;
      rorAlarm = (delta >= TEMP_ROR_DELTA);
      tempRef  = temp;
      tempRefT = now;
    }
  }

  // ----- Gas thresholds (using RAW) -----
  bool gasWarn   = (!isnan(gas) && gas >= GAS_WARN_RAW);
  bool gasDanger = (!isnan(gas) && gas >= GAS_DANGER_RAW);

  // ----- Confidence score -----
  float score = 0.0f;
  String reasons = "";

  if (flameLatched)               { score += 0.9f; reasons += "flame,"; }
  if (gasDanger)                  { score += 0.9f; reasons += "gas_hi,"; }
  else if (gasWarn)               { score += 0.4f; reasons += "gas_warn,"; }

  if (!isnan(temp) && temp > 50)  { score += 0.7f; reasons += "temp_hi,"; }
  if (rorAlarm)                   { score += 0.6f; reasons += "ror,"; }

  static bool conditionActive = false;
  if (score >= 1.0f) {
    if (!conditionActive) { conditionActive = true; fireStartMs = now; }
  } else {
    conditionActive = false;
  }

  bool dangerFire = conditionActive && (now - fireStartMs >= ALARM_HOLD_MS);

  // ----- Alarm Control -----
  if (dangerFire) {
    buzzerLatched = true;
    alarmClearMs  = now;
  }
  if (buzzerLatched && (now - alarmClearMs) > ALARM_COOLDOWN_MS && !dangerFire) {
    buzzerLatched = false;
  }

  digitalWrite(BUZZER_PIN, buzzerLatched ? HIGH : LOW);
  digitalWrite(LED_PIN,    buzzerLatched ? HIGH : LOW);

  // ----- Debug serial -----
  Serial.print("t="); Serial.print(temp,1);
  Serial.print(" h="); Serial.print(hum,1);
  Serial.print(" gas="); Serial.print(gas,0);
  Serial.print(" ldrRaw="); Serial.print(flameRaw,0);
  Serial.print(" base="); Serial.print(ldrBaseline,0);
  Serial.print(" drop="); Serial.print(drop*100,0); Serial.print("%");
  Serial.print(" flameLat="); Serial.print(flameLatched);
  Serial.print(" ror="); Serial.print(rorAlarm);
  Serial.print(" score="); Serial.print(score,2);
  Serial.print(" fire="); Serial.print(dangerFire);
  Serial.println();

  // ----- MQTT telemetry -----
  String json = "{";
  json += "\"temperature\":" + String(isnan(temp)? -1 : temp, 1) + ",";
  json += "\"humidity\":"    + String(isnan(hum)?  -1 : hum, 1)  + ",";
  json += "\"gas_raw\":"     + String((int)gas) + ",";              // <-- direct raw gas
  json += "\"flame_raw\":"   + String((int)flameEMA) + ",";
  json += "\"ldr_baseline\":"+ String((int)ldrBaseline) + ",";
  json += "\"drop_pct\":"    + String(drop, 3) + ",";
  json += "\"ror\":"         + String(rorAlarm ? 1 : 0) + ",";
  json += "\"score\":"       + String(score,2) + ",";
  json += "\"reasons\":\""   + reasons + "\",";
  json += "\"fire\":"        + String(dangerFire ? 1 : 0) + ",";
  json += "\"ts\":"          + String((unsigned long)(millis()/1000));
  json += "}";

  client.publish((baseTopic + "/telemetry").c_str(), json.c_str());
  if (dangerFire) client.publish((baseTopic + "/alert").c_str(), "ALERT");
}