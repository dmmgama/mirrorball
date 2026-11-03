# Fundo vivo no Omarchy — o que muda no OS, onde, e como desfazer

Os fundos `mirrorball-black` e `mirrorball-white` do tema **sakura-mochi** mostram a bola 2D ao vivo
(com música) como wallpaper e ligam o audio-sidecar. Qualquer outro fundo desliga tudo.
Desenho e porquê: ver `mirrorball-linux.md` (secção "Fundo vivo do Omarchy").

## Tudo o que isto toca FORA da repo

| Onde | O quê | Quem cria |
|---|---|---|
| `~/.config/omarchy/backgrounds/sakura-mochi/mirrorball-black.png` e `mirrorball-white.png` | 2 imagens lisas (1920×1080). São só o **gatilho**: aparecem no `omarchy theme bg next` / `bg-switcher`. O que se vê é a bola ao vivo. | `install` |
| `~/.config/omarchy/hooks/post-boot.d/mirrorball-wall` | Hook do Omarchy: no arranque lança `mirror-wall-watch.sh`. | `install` |
| `~/.config/omarchy/plugins/mirrorball.wall/` (`manifest.json`, `Wall.qml`) | Plugin **bar-widget** do shell do Omarchy: ícone na barra (secção direita). Esquerdo = liga/desliga o fundo vivo, direito = preta/branca. Copiado de `omarchy-plugin/mirrorball.wall/` com o caminho do `mirror-wall-ctl.sh` substituído. | `install` |
| `~/.config/omarchy/shell.json` | `omarchy plugin enable` acrescenta o widget ao layout da barra. Backup do original: `shell.json.pre-mirrorball` (mesma pasta). | `install` |
| Processo `mirror-wall-watch.sh` (+ lock em `$XDG_RUNTIME_DIR/mirror-wall-watch.lock`) | Vigia `~/.local/state/omarchy/current/background` (`inotifywait`). | hook / `install` |
| Processo `wall/mirror-wall` (só com um dos 2 fundos) | Janela layer-shell na camada **Bottom** (acima do wallpaper, abaixo das janelas). | watcher |
| Processo `audio-sidecar` :3739 (só com um dos 2 fundos) | Captura `parec` do monitor da saída de som. Também escreve `~/.agentic-os/audio-token`. | `mirror-wall.sh on` |
| Logs `~/.local/state/mirrorball/{sidecar,wall}.log` | Logs. | scripts |

**Não** se altera: ficheiros do tema (`~/.config/omarchy/themes/sakura-mochi`, que é um repo git), nem
`/usr`, nem a config do Hyprland ou do shell do Omarchy. O fundo normal continua por baixo da bola.

Dependências (pacman): `qt6-webengine`, `qt6-declarative`, `layer-shell-qt`, `libpulse`, `ffmpeg`,
`inotify-tools`, `nodejs`. A bola só reage com a saída de som por omissão certa (`wiremix`).

## Controlos (todos fazem o mesmo: mudam o fundo do tema; o watcher liga/desliga bola + sidecar)

- **Barra do Omarchy:** widget `mirrorball.wall` com 5 botões: **●/○** liga/desliga o fundo vivo (bola + sidecar); **◐/◑** alterna bola preta/branca; **◻/◼/▣** fundo com a cor do tema, que roda por 3 estados: **off → on-ball → on-noball**; **◆** roda o **tom** do fundo pelas cores da paleta do tema; **✧/✦** feixes com o tom da bola ou com o da skin oposta.
  Depois de mudar o QML do widget é preciso `omarchy-restart-shell` (o shell não recarrega QML já carregado).
- **Fundo = cor do tema** (`mirror-wall-ctl.sh theme`, roda off → on-ball → on-noball): a página recebe `?bgcolor=RRGGBB` (o `background` de `~/.local/state/omarchy/current/theme/colors.toml`). Skin preta: overlay `mix-blend-mode: screen` que tinge a sala; skin branca: as primeiras paragens do filtro `#tone` passam a partir da cor do tema. Bola, feixes e glints mantêm o tom da skin. Com temas escuros a bola preta fica pouco contrastada. - **Tom do fundo** (`mirror-wall-ctl.sh tone`; `color` imprime o hex atual): a paleta é lida de `~/.local/state/omarchy/current/theme/colors.toml` (todas as cores `chave = "#rrggbb"`, sem repetidas; tom 0 = `background`, o resto pela ordem do ficheiro). O índice fica em `~/.local/state/mirrorball/wall-themetone` (módulo do nº de cores, por isso aguenta trocas de tema). O `mirror-wall.sh` passa a cor escolhida em `?bgcolor=`. O `status` inclui `tone=nome:#hex`.
- **Feixes com o tom oposto** (`mirror-wall-ctl.sh beams`, flag `~/.local/state/mirrorball/wall-beams`, URL `&beams=flip`): tudo o que está **fora do círculo da bola** (feixes, pontos nas paredes, sala, corrente) usa o tom da skin oposta; a bola mantém o seu. Implementação: um canvas extra `#mbo` copia o render por frame, com máscara "fora do círculo" e filtro `#tone` (ou `#tone2` se há fundo do tema) só quando o fora é "branco". **Limitação:** feixes que passam por cima da bola (dentro do círculo) ficam com o tom da bola. Combina com o fundo do tema e o tom. Ex.: bola branca + feixes "pretos" = bola de tinta com feixes claros sobre sala escura.
- A flag do modo fica em `~/.local/state/mirrorball/wall-themebg` (0 off, 1 on-ball, 2 on-noball).
  **on-noball** (`&bgmode=noball`): a bola mantém o render original; só fora do círculo da bola (máscara radial, +3%) o fundo toma a cor do tema. Na skin preta o overlay `screen` tem um buraco onde está a bola; na branca há um 2.º canvas com um `#tone2` temático por cima do original, com o mesmo buraco. Medido: bola 111/129/137 (sem tema 109/128/136) contra 15/31/39 em on-ball. Feixes e pontos fora do círculo levam a cor do tema nos dois modos.
- **Launcher web** (`mirror-app.sh` → `http://127.0.0.1:3700`): card "MirrorBall plugin" com Ligar/Desligar, Preta, Branca e Fundo do tema.
- **Linha de comandos:** `./mirror-wall-ctl.sh status|on [black|white]|off|toggle|skin|theme`.
- Ao ligar, guarda o fundo atual em `~/.local/state/mirrorball/wall-prev-bg` e repõe-no ao desligar (sem ele, usa o 1.º fundo do tema).

## Voltar a pôr (após reinstalar o sistema, noutra máquina, ou depois de remover)

```bash
cd ~/Projects/David/Mirrorball-Hub/mirrorball-linux
git pull
./mirror-wall-install.sh install        # compila wall/, cria os fundos e o hook, lança o watcher
omarchy theme bg next                   # repetir até ser mirrorball-black ou mirrorball-white
```

## Tirar do OS

```bash
./mirror-wall-install.sh uninstall      # pára watcher/bola/sidecar, apaga hook, widget da barra e os 2 fundos
```
Se o fundo atual era um dos 2, passa para o seguinte. A repo e o binário `wall/mirror-wall` ficam (apagáveis).

**À mão**, se o script não estiver à mão:
```bash
pkill -f mirror-wall-watch.sh; pkill -x mirror-wall; pkill -f 'audio-sidecar|node server.js'
omarchy plugin disable mirrorball.wall; rm -rf ~/.config/omarchy/plugins/mirrorball.wall
rm ~/.config/omarchy/hooks/post-boot.d/mirrorball-wall
rm ~/.config/omarchy/backgrounds/sakura-mochi/mirrorball-{black,white}.png
omarchy theme bg next
```

Se o `shell.json` ficar estranho: `cp ~/.config/omarchy/shell.json.pre-mirrorball ~/.config/omarchy/shell.json`.

## Só desligar por agora (sem desinstalar)
Muda para outro fundo (`omarchy theme bg next`): a bola e o sidecar fecham sozinhos. O watcher
continua a correr (consumo desprezível) e volta a ligá-los quando escolheres um dos 2 fundos.
