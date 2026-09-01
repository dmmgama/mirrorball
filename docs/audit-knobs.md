# Auditoria de knobs do painel — achados e correções (2026-09-01)

Duas auditorias Opus varreram os 193 knobs do painel (`spike-babylon/v2/panel.js`) à procura de
knobs **partidos**: sliders que não fazem o que o nome diz, que não persistem, que fazem trabalho a
mais, ou cujo disjuntor não corta nada. Este documento fica como o registo do que se encontrou e do
que se corrigiu (regra 8 do CLAUDE.md).

**Âmbito.** Só integridade de knobs. O redesenho de sync/estrelato (o "soa aleatório" do David)
está em `docs/audit-sync-motor.md` e continua **em debate** — nada disso foi tocado aqui.

---

## 1. Corrigidos

### 1.1 `feixes: compr. 3D (fase 3)` estava MORTO → knob removido

`beams.js:277` lê `beamLen3D` apenas como **fallback** de `beamLen`:

```js
const L3 = ... num(cfg('beamLen', num(cfg('beamLen3D', 3.6), ...) ...), 6) * rBall;
```

Mas `config.js:182` define **sempre** `beamLen: 6` — o fallback nunca dispara. Provado ao vivo:
`beamLen3D = 12` → zero efeito; `beamLen = 2` → efeito imediato. O slider era decorativo.

**Correção:** o slider desapareceu do painel (`panel.js`) e do grupo "Névoa & Feixes". Quem faz o
trabalho é `feixes: comprimento`. A chave `CONFIG.beamLen3D` **fica no config** — o `?mini` de
`main.js:1040` usa-a como semente e a bola Canvas 2D também a usa; o que morreu foi só o slider.

*Compatibilidade (regra 9c):* um `mb2.knobs`/preset antigo que traga a chave é ignorado sem partir o
load — o `knobsSet` itera os sliders conhecidos, não as chaves do ficheiro. **Verificado ao vivo**
(ver §3).

### 1.2 `rotationRpm (motor manda)` não persistia → acrescentado ao PERSIST

O PERSIST é `sliders.slice(0, rotationIdx)` + uma lista de exceções. O `slice` é **exclusivo**, por
isso o próprio `rotationRpm` caía fora — e é **um dos 7 favoritos**, o knob mais mexido do painel.
O David afinava a rotação, recarregava, e voltava ao default.

**Correção:** entrou na lista de exceções, pelo mesmo argumento já usado para `bola: opacidade`
(F13 §2): com o disjuntor a 0 quem manda é o slider, e um knob de afinação grava-se.
`health (motor manda)` **fica de fora de propósito** — é runtime do motor/health, não uma afinação.

### 1.3 Teclas `w` e `0` disparavam a escrever nos campos do painel → guard acrescentado

`main.js:165` (`0` = repor câmara) e `main.js:1339` (`w` = trocar skin) não tinham o guard
INPUT/TEXTAREA/SELECT que os outros handlers têm (padrão em `main.js:1502-1505`). Escrever um "0"
num campo numérico saltava a câmara; um "w" num campo de texto trocava a skin.

**Correção:** o mesmo guard nos dois handlers (incluindo o `ctrl/meta/alt`). Fora dos campos as
teclas continuam a funcionar exatamente como antes.

### 1.4 `mikado: tam. bloco` re-sorteava o mikado inteiro → passa a só reagrupar

O knob chamava `onMikadoGeomChanged()` → `mikado.rebuild()` → `generate()`, e o `generate()`
**re-sorteia a disposição toda** (posições, ângulos, comprimentos). Arrastar um slider que só devia
mudar o **agrupamento dos flashes** fazia as barras saltar de sítio a cada passo.

`blockSize` não entra na geometria de barra nenhuma — só decide quem acende com quem
(`mikado.js` layout + scheduler).

**Correção:** a atribuição de `block` saiu do `generate()` para uma função `regroup()` própria,
exportada e ligada a um hook novo `onMikadoRegroup` (sem `rebuild`, sem `refreshProbe` — nada se
moveu, a reflexão da bola continua válida). O `regroup()` também repõe `blockCursor`/`litBlock`
quando o número de blocos encolhe, senão o bloco aceso ficava órfão e apagava o mikado até à
rajada seguinte.

*Armadilha TDZ:* o `st` é um `const` declarado depois do primeiro `rebuild()`, e sobre um `const` na
TDZ **até o `typeof` atira ReferenceError**. Daí o `regroup(resetCursor)`: o arranque chama com
`false`, o knob com `true`.

Acrescentou-se ainda o getter de diagnóstico `mikado.blockPlan` (o `block` por barra), que é o que
permite verificar isto pela consola.

### 1.5 `estrelato: chapéus gesto` sem legenda → renomeado

É um seletor (0=juntos · 1=sequência · 2=alterna) e o nome não dizia o que os números querem dizer,
ao contrário dos outros seletores do painel.

**Correção:** passou a `estrelato: chapéus gesto (0=juntos/1=seq/2=alt)`, **com entrada no mapa
`RENAMED`** (regra 9b — o mapa só cresce). Verificado ao vivo: um ficheiro com o nome antigo migra e
o valor sobrevive.

### 1.6 `spotFadeMix` e `choreo.flashRate` apagados a 60 Hz → agora atrás do disjuntor

`music.js:2109-2110` escrevia **incondicionalmente**:

```js
C.spotFadeMix = 0;
if (C.choreo) C.choreo.flashRate = 0;
```

Isto corre a cada frame do motor, por isso qualquer valor que o David pusesse nos knobs
correspondentes evaporava-se 60 vezes por segundo — o slider mexia e não ficava nada.

**Correção:** os dois writes passaram para trás do **mesmo disjuntor dos vizinhos**
(`C.spotsMotor !== false`, o de `music.js:2147` e o do `fireFlash`). Com o disjuntor ON (default) o
comportamento é **exatamente o de antes**; com ele OFF quem manda é o painel.

### 1.7 Disjuntores furados → `fromMotor:true` nos callers do motor

`motorAllowed()` (`main.js:1447-1454`) só filtra chamadas que se identificam como vindas do motor.
Só o `MB.explode` passava a flag: `MB.flash` e `MB.strobe` chegavam sem ela, `motorAllowed()`
devolvia sempre `true`, e o disjuntor `focos+flashes: motor manda` não cortava nada vindo do motor.
(A única guarda que funcionava era o `C.spotsMotor === false` de `music.js:1615`.)

**Correção:** `fromMotor: true` nos callers de `MB.flash` e `MB.strobe` em `music.js`. A flag marca
só a **origem** — o que o David dispara da consola continua a passar. `MB.retarget` **não tem
caller no motor** (grep completo em `web/music.js`: zero ocorrências), por isso não havia nada a
marcar; a guarda no `main.js` já lá estava e fica correta para quando houver.

---

## 2. Duvidosos — deixados como estão (para a fase de UX)

Encontrados, mas **não** corrigidos: não são bugs claros, e mexer neles é decisão de UX/afinação do
David, não de integridade.

| Knob | O que se observou | Porque ficou |
|---|---|---|
| `chapéus: corte da pala°` | Só faz efeito no **reload** (está no `RELOAD` set de `panel.js:577`) | É deliberado — a geometria do chapéu constrói-se uma vez no arranque. Marcado como reload no painel; falta só decidir se vale a pena torná-lo ao vivo. |
| `incidente: cone largura máx` | Efeito **impercetível** em toda a gama | Não está partido (o valor chega ao render); é a gama/força que não se lê. Afinação, não bug. |
| `vultos: densidade` | **Satura a 80** pessoas — o pool tem 80 e o knob pede até 122 | Já **avisa na consola** com o número exato e diz o que fazer. Aumentar o pool é decisão de performance. |
| `haze máx (motor modula)` e `feixes: fração máx (motor modula)` | Estão nos **favoritos** mas em modo manual (sem motor) não se sente efeito | Ambos escrevem o valor corrente **e** o máximo (`hazeMax`+`haze`). O que falha é a expectativa criada pelo nome/posição nos favoritos. Rever na fase UX — possivelmente trocar quais são os 7 favoritos. |
| `MANUAL.html` | **Desatualizado** (ainda documenta o `feixes: compr. 3D` como knob vivo, entre outros) | Reescrita do manual é trabalho à parte, e o manual não afeta o comportamento. |

---

## 3. Verificação (ao vivo, `:8099`, tab dedicado)

Tudo medido por **leitura de estado** com o motor a correr (a automação fica `document.hidden`, por
isso não se avalia por screenshot).

**Compatibilidade (regra 9)** — plantou-se um `mb2.knobs` "da versão anterior" com o knob **removido**
(`feixes: compr. 3D` = 7.5), o **nome antigo** do seletor (`estrelato: chapéus gesto` = 1),
`rotationRpm` = 2.35 e **lixo** (chave inexistente + valor não-numérico). Depois do reload:

- `rotationRpm` = **2.35** — sobreviveu (§1.2 confirmado; antes voltava ao default).
- `hatsGesture` = **1** — migrou pelo `RENAMED` (§1.5), com o log `knobs renomeados recuperados`.
- `beamLen3D` = **3.6** (o default do config, não o 7.5 do ficheiro) — a chave removida foi
  **ignorada** sem partir o load (§1.1).
- Lixo ignorado; **zero erros na consola**, zero banners.

**Por correção:**

| # | Teste | Resultado |
|---|---|---|
| 1 | O knob deixou de estar no painel; `feixes: comprimento` continua lá | ✅ 193 knobs, `compr. 3D` ausente |
| 2 | Reload mantém o valor de `rotationRpm`; `health` continua fora do PERSIST | ✅ 2.35 sobreviveu; `health` fora |
| 3 | `0`/`w`/`W` num `<input>` do painel | ✅ câmara e skin **imunes**; fora do campo continuam a funcionar |
| 4 | `tam. bloco` 3 → 9 ao vivo | ✅ as **49 barras ficam nas mesmas posições**; agrupamento muda (`0,0,0,1,1,1…` vs nove `0` e depois `1`) |
| 5 | Nome novo no painel + migração do antigo | ✅ ambos |
| 6 | Disjuntor OFF, `spotFadeMix`=0.62 e `flashRate`=0.45, **10 s** de motor | ✅ **sobreviveram** os dois; rpm continuou a 2.19 (motor vivo) |
| 7 | `spotsMotor=false`: flash/strobe do motor vs manuais | ✅ motor **bloqueado** (flash 0, strobe `false`), **manuais passam** (flash 1, strobe `true`). Com o disjuntor ON: tudo passa, **comportamento inalterado** |

**Regras da casa:** `beamIntensity` máx medido **0.148** (teto 0.18) ✅ · `rotationRpm` máx **2.34**
(teto 3) ✅ · `mikado.hz` 2.8 (teto 3) ✅ · toggle `cor (0/1)` liga/desliga o greyscale ✅ ·
motor funcional em `?src=music` + tecla `g` ✅ · consola sem erros ✅.

Os únicos avisos na consola são **pré-existentes e alheios** a estas correções: a saturação do
`vultos: densidade` (§2), o clamp de luzes do Babylon (12 → 8) e os "motor de música ausente" das
cargas em modo manual.

---

## 4. Ficheiros tocados

- `spike-babylon/v2/panel.js` — knob removido, PERSIST, `RENAMED`, rename, hook `onMikadoRegroup`
- `spike-babylon/v2/main.js` — guards de teclado (`0`, `w`), hook `onMikadoRegroup`, cache-busters
- `spike-babylon/v2/mikado.js` — `regroup()` separado do `generate()`, export, getter `blockPlan`
- `spike-babylon/v2/index.html` — cache-buster `main.js?v=39`
- `spike-babylon/v2/knobs-default.json` — **regenerado** (`node gen-knobs-default.js`)
- `web/music.js` — §1.6 e §1.7
- `web/index-v2.html` — cache-buster `music.js?v=59`

`web/music-config.json` **não foi tocado** (continua fora dos commits, como sempre).
