// mirror-wall: janela layer-shell (camada Bottom: acima do wallpaper, abaixo das janelas) com um
// WebEngineView em ecrã inteiro e sem input. Uso: mirror-wall <url>. Um por ecrã.
#include <QGuiApplication>
#include <QScreen>
#include <QtWebEngineQuick>
#include <QQuickView>
#include <QQmlContext>
#include <LayerShellQt/Window>

int main(int argc, char **argv) {
    if (argc < 2) return 2;
    qputenv("QT_WAYLAND_SHELL_INTEGRATION", "layer-shell");
    QtWebEngineQuick::initialize();
    QGuiApplication app(argc, argv);
    const QString url = QString::fromLocal8Bit(argv[1]);
    QList<QQuickView *> views;
    for (QScreen *s : app.screens()) {
        auto *v = new QQuickView;
        v->setScreen(s);
        v->setResizeMode(QQuickView::SizeRootObjectToView);
        v->rootContext()->setContextProperty("wallUrl", url);
        v->setSource(QUrl(QStringLiteral("qrc:/wall.qml")));
        v->setColor(Qt::black);
        v->setFlag(Qt::WindowTransparentForInput, true);
        v->create();
        if (auto *w = LayerShellQt::Window::get(v)) {
            w->setScope(QStringLiteral("mirrorball-wall"));
            w->setLayer(LayerShellQt::Window::LayerBottom);
            w->setAnchors(LayerShellQt::Window::Anchors(LayerShellQt::Window::AnchorTop | LayerShellQt::Window::AnchorBottom | LayerShellQt::Window::AnchorLeft | LayerShellQt::Window::AnchorRight));
            w->setExclusiveZone(-1);
            w->setKeyboardInteractivity(LayerShellQt::Window::KeyboardInteractivityNone);
        }
        v->show();
        views << v;
    }
    return app.exec();
}
