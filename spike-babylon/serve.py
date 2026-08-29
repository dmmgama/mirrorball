"""Servidor do spike com no-store — senao o Chrome guarda o scene.js e nao ve as alteracoes."""
import http.server, socketserver, sys
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', PORT), H) as httpd:
    print(f'spike em http://127.0.0.1:{PORT}/index.html')
    httpd.serve_forever()
