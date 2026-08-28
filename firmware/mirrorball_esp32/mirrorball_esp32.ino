/*
 * mirrorball_esp32.ino — bola de espelhos REAL a reagir às emoções.
 *
 * Recebe pela Serial USB (115200) — e opcionalmente por WebSocket na porta 81 —
 * linhas no formato que o web/bridge.js emite:
 *   S<rpm×100> B<0-255> H<0-255> V<-100..100> A<0-100> L<0-100>\n
 *
 * Hardware:
 *   - ESP32 (qualquer dev board)
 *   - Fita WS2812B (os "spots" que batem na bola)      → DATA no pino 13, GND comum, 5V externo
 *   - Motor DC da bola via driver (L298N/TB6612), PWM   → ENA no pino 25, IN1 pino 26, IN2 pino 27
 *     (se a bola tiver motor de velocidade fixa, deixa MOTOR_ENABLED=false — só as luzes reagem)
 *
 * Bibliotecas (Arduino IDE → Library Manager): FastLED; para Wi-Fi: WebSockets (Links2004).
 *
 * Fidelidade ao brief: a bola virtual é greyscale, por isso os LEDs são brancos por defeito
 * (WARM_TINT=false). A "coreografia" de spots — vários grupos de LEDs a cruzar em fades lentos —
 * espelha o crossfade sinusoidal dos spots do HTML (period 11/13/17 s). Nada acima de 3 Hz.
 */
#include <FastLED.h>

#define USE_WIFI       false        // true → também aceita WebSocket (ver bloco em baixo)
#define MOTOR_ENABLED  true
#define WARM_TINT      false

#define LED_PIN   13
#define NUM_LEDS  60
#define NUM_SPOTS 3                 // grupos de LEDs = spots do HTML
#define PIN_ENA   25
#define PIN_IN1   26
#define PIN_IN2   27

CRGB leds[NUM_LEDS];

// ---- estado alvo (vindo do browser) e estado suavizado (o que se aplica) ----
struct Params { float rpm = 1.0f, bright = 0.8f, haze = 0.65f, valence = 0, arousal = 0, health = 1; };
Params target, cur;
const float EASE_PER_SEC = 1.6f;    // igual ao emotion.js → virtual e real chegam ao mesmo tempo
const float SPOT_PERIOD[NUM_SPOTS] = { 13.0f, 17.0f, 11.0f };   // os mesmos do CONFIG.spots da A
const float SPOT_BASE[NUM_SPOTS]   = { 1.00f, 0.85f, 0.70f };

unsigned long lastMs = 0, lastRx = 0;
String line;

void parseLine(const String& s) {
  // formato solto: tokens "<letra><número>" separados por espaço
  int i = 0;
  while (i < (int)s.length()) {
    char k = s[i++];
    int j = i; while (j < (int)s.length() && s[j] != ' ') j++;
    float v = s.substring(i, j).toFloat(); i = j + 1;
    switch (k) {
      case 'S': target.rpm     = constrain(v / 100.0f, 0.0f, 3.0f); break;
      case 'B': target.bright  = constrain(v / 255.0f, 0.0f, 1.0f); break;
      case 'H': target.haze    = constrain(v / 255.0f, 0.0f, 1.0f); break;
      case 'V': target.valence = constrain(v / 100.0f, -1.0f, 1.0f); break;
      case 'A': target.arousal = constrain(v / 100.0f, 0.0f, 1.0f); break;
      case 'L': target.health  = constrain(v / 100.0f, 0.0f, 1.0f); break;
    }
  }
  lastRx = millis();
}

void setMotor(float rpm, float health) {
  if (!MOTOR_ENABLED) return;
  // mapeia 0.5–3 rpm da bola para o duty do motor; calibra MOTOR_MIN/MAX para a tua bola
  const int MOTOR_MIN = 70, MOTOR_MAX = 255;
  int duty = (int)(MOTOR_MIN + (MOTOR_MAX - MOTOR_MIN) * constrain((rpm - 0.5f) / 2.5f, 0.0f, 1.0f));
  if (health < 0.2f) duty = 0;                                   // "morta": para de girar
  digitalWrite(PIN_IN1, HIGH); digitalWrite(PIN_IN2, LOW);
  ledcWrite(0, duty);
}

void renderLeds(float tSec) {
  const int per = NUM_LEDS / NUM_SPOTS;
  for (int s = 0; s < NUM_SPOTS; s++) {
    // crossfade sinusoidal lento, como no HTML: I = base × gain × (0.35 + 0.65·fade)
    float fade = 0.5f + 0.5f * sinf(TWO_PI * tSec / SPOT_PERIOD[s] + s * 2.1f);
    float I = SPOT_BASE[s] * cur.bright * (0.35f + 0.65f * fade);
    // arousal alto → mais "ataque" (fade mais contrastado), nunca strobe
    I = powf(constrain(I, 0.0f, 1.0f), 1.0f + cur.arousal * 0.8f);
    uint8_t v = (uint8_t)(I * 255.0f);
    CRGB c = WARM_TINT ? CRGB(v, (uint8_t)(v * 0.92f), (uint8_t)(v * 0.80f)) : CRGB(v, v, v);
    for (int i = s * per; i < (s + 1) * per && i < NUM_LEDS; i++) leds[i] = c;
  }
  // "névoa": os LEDs entre grupos recebem um pouco de luz difusa
  for (int i = 0; i < NUM_LEDS; i++) leds[i].nscale8_video(200 + (uint8_t)(55 * cur.haze));
  FastLED.show();
}

#if USE_WIFI
#include <WiFi.h>
#include <WebSocketsServer.h>
const char* WIFI_SSID = "TUA_REDE"; const char* WIFI_PASS = "TUA_PASS";
WebSocketsServer wss(81);
void onWs(uint8_t, WStype_t type, uint8_t* payload, size_t len) {
  if (type == WStype_TEXT) parseLine(String((char*)payload, len));
}
#endif

void setup() {
  Serial.begin(115200);
  FastLED.addLeds<WS2812B, LED_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(200);
  if (MOTOR_ENABLED) {
    pinMode(PIN_IN1, OUTPUT); pinMode(PIN_IN2, OUTPUT);
    ledcSetup(0, 1000, 8); ledcAttachPin(PIN_ENA, 0);
  }
#if USE_WIFI
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(200);
  Serial.print("ws://"); Serial.print(WiFi.localIP()); Serial.println(":81");
  wss.begin(); wss.onEvent(onWs);
#endif
  lastMs = millis();
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') { parseLine(line); line = ""; } else if (line.length() < 80) line += c;
  }
#if USE_WIFI
  wss.loop();
#endif
  unsigned long now = millis();
  float dt = (now - lastMs) / 1000.0f; lastMs = now;
  // sem browser há 5 s → regressa suavemente ao neutro (bola "em repouso")
  if (now - lastRx > 5000) { Params neutral; target = neutral; }
  float k = 1.0f - expf(-EASE_PER_SEC * dt);
  cur.rpm     += (target.rpm     - cur.rpm)     * k;
  cur.bright  += (target.bright  - cur.bright)  * k;
  cur.haze    += (target.haze    - cur.haze)    * k;
  cur.valence += (target.valence - cur.valence) * k;
  cur.arousal += (target.arousal - cur.arousal) * k;
  cur.health  += (target.health  - cur.health)  * k;

  setMotor(cur.rpm, cur.health);
  renderLeds(now / 1000.0f);
  delay(16);   // ~60 Hz
}
