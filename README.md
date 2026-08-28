# MirrorBall — bola de espelhos que reage a emoções (virtual + real, em sync)

```
Webcam → face-api.js → {happy, sad, angry, surprised, …}
              ↓ suavização (1.6/s, < 3 Hz — sem strobe)
       valência (−1…+1) · arousal (0…1)
              ↓
   {rpm, spotGain, haze, beams, health}
      ↓                        ↓
 bola virtual              bridge.js → "S120 B200 H166 V45 A30 L100\n"
 (mirrorball-A,                 ↓ USB (Web Serial) ou Wi-Fi (WebSocket)
  Canvas 2D, física)       ESP32 → LEDs WS2812B (spots) + motor (rotação)
```

A bola virtual e a real recebem **os mesmos valores, com a mesma suavização** (`EASE_PER_SEC = 1.6` nos dois lados) — é isso que as mantém em sync.

## Mapeamento emoção → bola (greyscale, fiel ao brief)

| Emoção | valência / arousal | Bola |
|---|---|---|
| feliz | + / médio | 2–3 rpm, spots +60 %, mais feixes |
| surpresa | ~0 / alto | névoa alta, muitos feixes, rpm alto |
| zangado / medo | − / alto | spots fortes mas health a cair (raio-X, escurece) |
| triste | − / baixo | 0.5 rpm, spots a 35 %, health ≈ 0.2 → bola a "morrer" |
| neutro / sem cara | decai em ~4 s para o estado base da A |

A cor não muda (regra "greyscale puro"). A emoção altera **energia**: velocidade, intensidade, névoa, nº de feixes, saúde.

## Fase 0 — só software (feito)

```
cd web
python -m http.server 8080      # a câmara exige http://localhost ou https
```
Abrir `http://localhost:8080`, clicar **ligar câmara**. Teclas: `e` HUD de emoções · `d` painel de debug da bola.
Sem hardware, o `bridge.js` escreve o pacote na consola 1×/s.

## Fase 1 — LEDs por USB

1. Arduino IDE → instalar **FastLED**; abrir `firmware/mirrorball_esp32/mirrorball_esp32.ino`; `MOTOR_ENABLED false` se a bola tiver motor fixo.
2. WS2812B: DATA → GPIO 13, GND comum, **5 V de fonte externa** (60 LEDs ≈ 3.6 A no máximo).
3. Carregar no ESP32, abrir a página no **Chrome/Edge**, botão **ligar USB**, escolher a porta.

## Fase 2 — motor + Wi-Fi

- Motor DC da bola via L298N/TB6612: ENA→25, IN1→26, IN2→27. Calibrar `MOTOR_MIN/MAX` para 0.5–3 rpm reais.
- Wi-Fi: `USE_WIFI true`, SSID/pass no .ino; o monitor série mostra `ws://192.168.x.x:81`; abrir `http://localhost:8080/?ws=ws://192.168.x.x:81`.

## Fase 3 — instalação

Caixa, 2–4 pin-spots (ou segmentos da fita) apontados à bola, ecrã em fullscreen com a bola virtual ao lado da real, auto-arranque.

## Material (≈ 40–70 €)

ESP32 · fita WS2812B 60 LEDs · fonte 5 V 4 A · bola 10–20 cm · driver de motor L298N/TB6612 + motor DC lento (opcional) · webcam.

## Origem

Bola virtual: `mirrorball-A.html` (Canvas 2D, reflexão física por tile) de `agentic-os/projects/briefs/Arvore/mockups`. Contrato de física: `BRIEF-mirrorball.md`; decisões: `MIRRORBALL-decisoes.md`; modelo mental no Hindsight: `claude-code::agent-os / mecanica-visual-mirrors`.
