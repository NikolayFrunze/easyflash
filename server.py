#!/usr/bin/env python3
"""Serves EasyFlash and keeps data/easyflash.csv up to date.

    python3 server.py        then open http://127.0.0.1:8765

GET  /api/data  returns the CSV (empty if it doesn't exist yet)
PUT  /api/data  replaces the CSV; the previous version is kept as easyflash.csv.bak
Only reachable from this computer.
"""
import http.server
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, 'data')
DATA = os.path.join(DATA_DIR, 'easyflash.csv')
PORT = int(os.environ.get('PORT', 8765))
MAX_BYTES = 5 * 1024 * 1024


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    # Refuse requests whose Host isn't loopback (DNS rebinding) so no other site can reach the data
    def _local(self):
        return self.headers.get('Host', '').rsplit(':', 1)[0] in ('127.0.0.1', 'localhost')

    def _reply(self, code, body=b'', ctype='text/plain; charset=utf-8'):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self._local():
            return self._reply(403)
        if self.path.split('?')[0] == '/api/data':
            body = open(DATA, 'rb').read() if os.path.exists(DATA) else b''
            return self._reply(200, body, 'text/csv; charset=utf-8')
        super().do_GET()

    def do_PUT(self):
        # The custom header forces a CORS preflight, which this server never approves,
        # so a web page from another origin can't overwrite the file.
        if not self._local() or self.path != '/api/data' or self.headers.get('X-EasyFlash') != '1':
            return self._reply(403)
        size = int(self.headers.get('Content-Length') or 0)
        if size > MAX_BYTES:
            return self._reply(413)
        body = self.rfile.read(size)
        os.makedirs(DATA_DIR, exist_ok=True)
        if os.path.exists(DATA):
            shutil.copyfile(DATA, DATA + '.bak')
        tmp = DATA + '.tmp'
        with open(tmp, 'wb') as f:
            f.write(body)
        os.replace(tmp, DATA)  # atomic: the CSV is never half-written
        self._reply(204)

    def log_message(self, fmt, *args):
        if self.command == 'PUT':
            sys.stderr.write('saved data/easyflash.csv\n')


if __name__ == '__main__':
    print(f'EasyFlash: http://127.0.0.1:{PORT}  (data: {DATA})')
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
