// Widget da barra: esquerdo = liga/desliga o fundo vivo (bola + sidecar), direito = preta/branca.
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
  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function poll() { if (!statusProc.running) statusProc.running = true }
  function act(cmd) { Quickshell.execDetached([ctl, cmd]); fast.restart() }

  Process {
    id: statusProc
    command: [root.ctl, "status"]
    stdout: StdioCollector { onStreamFinished: root.wallState = text.trim() || "off" }
  }
  Timer { interval: 3000; running: true; repeat: true; triggeredOnStart: true; onTriggered: root.poll() }
  Timer { id: fast; interval: 800; onTriggered: root.poll() }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.wallState === "off" ? "○" : (root.wallState === "white" ? "◌" : "●")
    active: root.wallState !== "off"
    tooltipText: root.wallState === "off" ? "MirrorBall: desligado" : "MirrorBall: bola " + (root.wallState === "white" ? "branca" : "preta")
    onPressed: function(b) {
      if (b === Qt.RightButton) root.act("skin")
      else root.act("toggle")
    }
  }
}
