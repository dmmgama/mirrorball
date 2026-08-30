"""Servidor do spike com no-store — senao o Chrome guarda o scene.js e nao ve as alteracoes.

Fase 5 (modo musica): o sidecar (agent-os/audio-sidecar, porta 3739) serve `web/` em `/app/*`
mas NAO segue a junction `web/spike -> spike-babylon` (GET /app/spike/... da 404 mesmo para
ficheiros planos na raiz do alvo -- confirmado 2026-08-30; deve ser um containment/realpath
check que rejeita reparse points fora de `web/`). Fallback documentado no brief f5-sonnet.md
ponto 1: este serve.py passa a responder tambem a rotas /app/* --
  /app/spike/*      -> spike-babylon/*         (o proprio spike, same-origin)
  /app/*.js         -> ../web/*.js             (core.js/music.js/tuner.js sem copiar ficheiros)
  /app-token         -> proxy para 127.0.0.1:3739/app-token
  /app-config*       -> proxy para 127.0.0.1:3739/app-config* (GET/POST, preserva headers/corpo)
O `j.ws` devolvido por /app-token ja e um URL absoluto (ws://127.0.0.1:3739) -- o cliente liga-se
la diretamente, sem proxy de WebSocket aqui.

URL final em modo musica: http://127.0.0.1:8099/app/spike/v2/index.html?src=music&webgl=1
Fora do modo musica nada mudou: http://127.0.0.1:8099/v2/index.html continua igual (Fase 1-4).
"""
import http.server, socketserver, sys, os, urllib.request, urllib.error

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
SIDECAR = 'http://127.0.0.1:3739'
HERE = os.path.dirname(os.path.abspath(__file__))          # spike-babylon/
WEB_DIR = os.path.abspath(os.path.join(HERE, '..', 'web'))  # web/ (core.js, music.js, tuner.js, music-config.json)


class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def log_message(self, *a):
        pass

    # ---- proxy: /app-token e /app-config* -> sidecar :3739 (same-origin p/ o browser) ----
    def _proxy(self, method):
        url = SIDECAR + self.path
        body = None
        if method == 'POST':
            length = int(self.headers.get('content-length', 0) or 0)
            body = self.rfile.read(length) if length else b''
        headers = {}
        for k in ('content-type', 'x-audio-token'):
            v = self.headers.get(k)
            if v:
                headers[k] = v
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                self.send_response(r.status)
                self.send_header('content-type', r.headers.get('content-type', 'application/json'))
                self.send_header('Cache-Control', 'no-store, must-revalidate')
                self.end_headers()
                self.wfile.write(r.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.send_header('content-type', 'application/json')
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(502)
            self.send_header('content-type', 'application/json')
            self.end_headers()
            self.wfile.write(('{"error":"sidecar indisponivel: %s"}' % str(e).replace('"', "'")).encode('utf-8'))

    def _is_proxied(self):
        return self.path == '/app-token' or self.path.startswith('/app-token?') \
            or self.path == '/app-config' or self.path.startswith('/app-config?') \
            or self.path.startswith('/app-config/')

    # ---- roteamento de ficheiros: /app/spike/* e /app/*.js (fallback da junction, ver docstring) ----
    def translate_path(self, path):
        p = path.split('?', 1)[0].split('#', 1)[0]
        if p.startswith('/app/spike/'):
            rel = p[len('/app/spike/'):]
            return os.path.join(HERE, *rel.split('/'))
        if p.startswith('/app/'):
            rel = p[len('/app/'):]
            # so ficheiros planos de web/ (core.js, music.js, tuner.js, bridge.js, emotion-v2.js,
            # music-config.json) -- nunca percorre para fora de WEB_DIR (sem `..` no path)
            if '..' not in rel.split('/'):
                cand = os.path.join(WEB_DIR, *rel.split('/'))
                if os.path.isfile(cand):
                    return cand
        return super().translate_path(path)

    def do_GET(self):
        if self._is_proxied():
            return self._proxy('GET')
        super().do_GET()

    def do_POST(self):
        if self._is_proxied():
            return self._proxy('POST')
        self.send_response(404)
        self.end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', PORT), H) as httpd:
    print(f'spike em http://127.0.0.1:{PORT}/index.html')
    print(f'modo musica: http://127.0.0.1:{PORT}/app/spike/v2/index.html?src=music&webgl=1')
    httpd.serve_forever()
