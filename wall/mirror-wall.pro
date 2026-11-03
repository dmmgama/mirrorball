QT += quick webenginequick gui-private
CONFIG += c++17 link_pkgconfig
TARGET = mirror-wall
SOURCES += main.cpp
RESOURCES += wall.qrc
INCLUDEPATH += /usr/include/LayerShellQt
LIBS += -lLayerShellQtInterface
