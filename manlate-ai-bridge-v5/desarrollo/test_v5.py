import importlib
import json
import os
import tempfile
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from unittest.mock import patch

import memoria_v5
import server_v5
import shell_truenas

class BridgeTests(unittest.TestCase):
    def test_memory_persists_and_is_project_scoped(self):
        with tempfile.TemporaryDirectory() as directory:
            old = memoria_v5.DB
            memoria_v5.DB = os.path.join(directory, 'nested', 'memory.sqlite')
            try:
                memoria_v5.guardar('CryApp', 'Diseño pendiente')
                memoria_v5.guardar('Otro', 'No mezclar')
                importlib.reload(memoria_v5)
                memoria_v5.DB = os.path.join(directory, 'nested', 'memory.sqlite')
                self.assertEqual(memoria_v5.consultar('CryApp')['notas'][0]['contenido'], 'Diseño pendiente')
                self.assertEqual(len(memoria_v5.consultar('CryApp')['notas']), 1)
                with self.assertRaises(ValueError): memoria_v5.guardar('', 'x')
            finally:
                memoria_v5.DB = old

    def test_oauth_metadata_uses_v5_config_and_advertises_scope(self):
        class MockHandler(server_v5.Handler):
            def log_message(self, *args): pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), MockHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        env = {'BRIDGE_PUBLIC_URL': 'https://bridge.example',
               'OAUTH_AUTHORIZATION_SERVER_URL': 'https://auth.example/application/o/bridge/'}
        try:
            with patch.dict(os.environ, env, clear=False):
                with urllib.request.urlopen('http://127.0.0.1:%d/.well-known/oauth-protected-resource/mcp' % server.server_port) as response:
                    data = json.load(response)
            self.assertEqual(data['resource'], 'https://bridge.example/mcp')
            self.assertEqual(data['scopes_supported'], ['manlate.mcp'])
            self.assertEqual(data['authorization_servers'], [env['OAUTH_AUTHORIZATION_SERVER_URL'].rstrip('/')])
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

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
            self.assertTrue({'editar_archivo_cryapp','guardar_memoria','consultar_memoria','ejecutar_shell_truenas'} <= names)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_shell_disabled_and_ssh_options(self):
        with patch.dict(os.environ, {'BRIDGE_SHELL_ENABLED': 'false'}, clear=True):
            with self.assertRaises(ValueError): shell_truenas.ejecutar('id')
        with tempfile.TemporaryDirectory() as d:
            key = os.path.join(d, 'key')
            known = os.path.join(d, 'known')
            for path in (key, known):
                with open(path, 'w') as f: f.write('test')
            env = {'BRIDGE_SHELL_ENABLED':'true', 'BRIDGE_SSH_HOST':'10.0.0.19',
                   'BRIDGE_SSH_USER':'truenas_admin', 'BRIDGE_SSH_KEY':key, 'BRIDGE_SSH_KNOWN_HOSTS':known}
            def fake_run(argv, **kwargs):
                self.assertIn('StrictHostKeyChecking=yes', argv)
                self.assertIn('BatchMode=yes', argv)
                self.assertEqual(argv[-1], 'printf hello')
                kwargs['stdout'].write(b'hello')
                return type('Result', (), {'returncode':0})()
            with patch.dict(os.environ, env, clear=True), patch('shell_truenas.subprocess.run', side_effect=fake_run):
                self.assertEqual(shell_truenas.ejecutar('printf hello')['salida'], 'hello')
                with self.assertRaises(ValueError): shell_truenas.ejecutar('x', 1000)

if __name__ == '__main__': unittest.main()
