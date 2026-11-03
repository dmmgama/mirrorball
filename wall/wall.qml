import QtQuick
import QtWebEngine
Item {
  WebEngineView {
    anchors.fill: parent
    url: wallUrl
    settings.playbackRequiresUserGesture: false
  }
}
