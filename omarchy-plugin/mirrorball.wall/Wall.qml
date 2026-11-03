// Widget da barra, 3 botões: [on/off do fundo vivo] [preta/branca] [fundo do tema: off → on-ball → on-noball].
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
  }
}
