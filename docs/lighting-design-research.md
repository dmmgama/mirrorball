# Como se ilumina uma bola de espelhos (research 2026-08-29)

Bem triangulado (3+ fontes): ControlBooth, SHEHDS, mirror-balls.co.uk, BulbAmerica, Hollywood DJ.

- **Fixture**: pinspot PAR36 (30 W/6 V ou LED), feixe 4-12°, a 1-3 m da bola.
- **Contagem**: 2 pinspots OPOSTOS é o standard (eliminam zonas mortas). 4 é o máximo credível; 6 só em lojas.
- **Posição**: ao nível ou ligeiramente abaixo do equador, a apontar para cima; elevação 30-45°, nunca >60°.
  Nunca de cima a direito (só ilumina o teto). Nunca do lado do público (encandeia). Miram o equador —
  é a zona que espalha reflexos a 360° (pista + paredes).
- **Comportamento**: aim FIXO. O técnico trabalha o dimmer (100 % no drop; corta/baixa um no breakdown)
  e a estrobe separada nos picos. "Chasing" de pinspots na bola não tem fontes.
- **Motor**: 1-3 rpm; sem reversão.
- **Patch**: inferência por trigonometria — raio ≈ 12-18 % do raio da bola (d=1-3 m, θ=6-10°).
- Haze só é preciso para ver os feixes a CAMINHO da bola.

Aplicado em `web/index-v2.html` (v30): rig de 2 (+2 opcionais) a az ±95° / el ~35°, `spotCount: 2`,
`choreo.retarget: false` (knob "focos: saltam"), poses sorteadas só com |az| 50-150° e el 22-48°.

Fontes: controlbooth.com/threads/how-to-light-a-mirror-ball.6932 · controlbooth.com/threads/mirror-ball-pinspot.32476 ·
shehds.com/blogs/news/disco-ball-and-stage-lighting-... · mirror-balls.co.uk/role-of-pin-spots-guide ·
bulbamerica.com/blogs/news/16031468-pinspots-a-guide-for-the-perplexed · hollywooddj.com/blogs/buying-guides/disco-ball-motors-explained
