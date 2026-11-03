// Widget da barra, 5 botões: [on/off do fundo vivo] [preta/branca] [fundo do tema: off → on-ball → on-noball] [tom da paleta] [feixes: tom da bola/oposto].
// @CTL@ é substituído por mirror-wall-install.sh (caminho do mirror-wall-ctl.sh).
import QtQuick
import Quickshell
import Quickshell.Io
import qs.Ui
import qs.Commons

BarWidget {
  id: root
  moduleName: "mirrorball.wall"
  readonly property string ctl: "@CTL@"
  property string wallState: "off"   // off | black | white
  property string themeMode: "off"   // off | ball | noball
  property string toneName: ""       // tom da paleta do tema usado no fundo
  property string toneHex: ""
  property bool beamsFlip: false    // feixes com o tom da skin oposta à da bola
  readonly property bool isOn: wallState !== "off"
  implicitWidth: row.implicitWidth
  implicitHeight: row.implicitHeight

  function poll() { if (!statusProc.running) statusProc.running = true }
  function act(cmd) { Quickshell.execDetached([ctl, cmd]); fast.restart() }

  Process {
    id: statusProc
    command: [root.ctl, "status"]
    stdout: StdioCollector {
      onStreamFinished: {
        var p = text.trim().split(" ")
        root.wallState = p[0] || "off"
        for (var i = 0; i < p.length; i++) if (p[i].indexOf("tone=") === 0) {
          var t = p[i].substring(5).split(":")
          root.toneName = t[0]; root.toneHex = t.length > 1 ? t[1] : ""
        }
        root.beamsFlip = p.indexOf("beams=flip") >= 0
        root.themeMode = p.indexOf("theme-ball") >= 0 ? "ball" : (p.indexOf("theme-noball") >= 0 ? "noball" : "off")
      }
    }
  }
  Timer { interval: 3000; running: true; repeat: true; triggeredOnStart: true; onTriggered: root.poll() }
  Timer { id: fast; interval: 800; onTriggered: root.poll() }

  Row {
    id: row
    spacing: 0
    BarIconButton {   // on/off
      bar: root.bar
      text: root.isOn ? "●" : "○"
      active: root.isOn
      tooltipText: root.isOn ? "MirrorBall: desligar" : "MirrorBall: ligar"
      onPressed: function(b) { root.act("toggle") }
    }
    BarIconButton {   // preta / branca
      bar: root.bar
      text: root.wallState === "white" ? "◑" : "◐"
      active: root.isOn
      tooltipText: "Bola " + (root.wallState === "white" ? "branca (trocar para preta)" : "preta (trocar para branca)")
      onPressed: function(b) { root.act("skin") }
    }
    BarIconButton {   // fundo = cor do tema
      bar: root.bar
      text: root.themeMode === "off" ? "◻" : (root.themeMode === "ball" ? "◼" : "▣")
      active: root.themeMode !== "off"
      tooltipText: "Fundo do tema: " + (root.themeMode === "off" ? "off" : (root.themeMode === "ball" ? "on, bola também" : "on, sem afetar a bola")) + " (clique para rodar)"
      onPressed: function(b) { root.act("theme") }
    }
    BarIconButton {   // tom da paleta do tema (roda pelas cores do colors.toml)
      bar: root.bar
      text: "◆"
      active: root.themeMode !== "off"
      tooltipText: "Tom do tema: " + root.toneName + " " + root.toneHex + " (clique para rodar)"
      onPressed: function(b) { root.act("tone") }
    }
    BarIconButton {   // feixes: tom da bola / tom oposto
      bar: root.bar
      text: root.beamsFlip ? "✦" : "✧"
      active: root.beamsFlip
      tooltipText: "Feixes com o tom " + (root.beamsFlip ? "oposto ao da bola" : "da bola") + " (clique para trocar)"
      onPressed: function(b) { root.act("beams") }
    }
  }
}
