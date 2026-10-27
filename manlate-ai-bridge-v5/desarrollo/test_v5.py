import importlib
import json
import os
import tempfile
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer

import memoria_v5
import server_v5

class BridgeTests(unittest.TestCase):
    def test_memory_persists_and_is_project_scoped(self):
        with tempfile.TemporaryDirectory() as directory:
            old = memoria_v5.DB
            memoria_v5.DB = os.path.join(directory, 'memory.sqlite')
            try:
                memoria_v5.guardar('CryApp', 'Diseño pendiente')
                memoria_v5.guardar('Otro', 'No mezclar')
                importlib.reload(memoria_v5)
                memoria_v5.DB = os.path.join(directory, 'memory.sqlite')
                self.assertEqual(memoria_v5.consultar('CryApp')['notas'][0]['contenido'], 'Diseño pendiente')
                self.assertEqual(len(memoria_v5.consultar('CryApp')['notas']), 1)
                with self.assertRaises(ValueError): memoria_v5.guardar('', 'x')
            finally:
                memoria_v5.DB = old

    def test_tools_discovery_and_unauthorized_request(self):
        class MockHandler(server_v5.Handler):
            def autorizado(self): return self.headers.get('Authorization') == 'Bearer test'
            def log_message(self, *args): pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), MockHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url = 'http://127.0.0.1:%d/mcp' % server.server_port
            body = json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/list'}).encode()
            with self.assertRaises(urllib.error.HTTPError) as err:
                urllib.request.urlopen(urllib.request.Request(url, data=body, method='POST'))
            self.assertEqual(err.exception.code, 401)
            req = urllib.request.Request(url, data=body, headers={'Authorization':'Bearer test'}, method='POST')
            with urllib.request.urlopen(req) as response: data = json.load(response)
            names = {x['name'] for x in data['result']['tools']}
            self.assertTrue({'editar_archivo_cryapp','guardar_memoria','consultar_memoria'} <= names)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

if __name__ == '__main__': unittest.main()
