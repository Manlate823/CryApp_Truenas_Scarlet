import urllib.request
import urllib.parse
import urllib.error
import hmac
import json
import os
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DB = "/data/memoria.sqlite"

class Handler(BaseHTTPRequestHandler):

    # MANLATE_AUTH_V1
    def autorizado(self):
        """Autenticación interna u OAuth verificado."""
        recibido = self.headers.get("Authorization", "")

        if not recibido.startswith("Bearer "):
            print('[OAUTH-DIAG] Sin Bearer', flush=True)
            return False

        token_recibido = recibido[7:]

        if not token_recibido:
            print('[OAUTH-DIAG] Token vacío', flush=True)
            return False

        try:
            with open("/run/secrets/mcp_token", "r") as f:
                token_interno = f.read().strip()

            if token_interno and hmac.compare_digest(
                token_recibido, token_interno
            ):
                return True

        except (OSError, ValueError):
            pass

        if os.environ.get("OAUTH_ENABLED") != "true":
            print('[OAUTH-DIAG] OAuth deshabilitado', flush=True)
            return False

        if not self.validar_token_oauth(token_recibido):
            print('[OAUTH-DIAG] Introspección rechazada', flush=True)
            return False

        if not self.validar_identidad_oauth(token_recibido):
            print('[OAUTH-DIAG] Identidad rechazada', flush=True)
            return False

        return True


    def validar_token_oauth(self, token):
        """
        Valida un token mediante introspección de Authentik.
        Requiere configuración explícita del cliente autorizado.
        """
        if not token or len(token) > 8192:
            return False

        client_id = os.environ.get("OAUTH_CLIENT_ID", "")

        if not client_id:
            return False

        url = (
            "http://manlate-authentik-server-1:9000"
            "/application/o/introspect/"
        )

        datos = urllib.parse.urlencode({
            "token": token
        }).encode("utf-8")

        import base64
        with open('/run/secrets/oauth_client_secret', 'r') as f:
            client_secret = f.read().strip()
        if not client_secret:
            return False
        credenciales = base64.b64encode(
            (client_id + ':' + client_secret).encode('utf-8')
        ).decode('ascii')
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + credenciales
        }
        solicitud = urllib.request.Request(
            url,
            data=datos,
            headers=headers,
            method="POST"
        )

        try:
            with urllib.request.urlopen(
                solicitud,
                timeout=5
            ) as respuesta:
                resultado = json.load(respuesta)

            if resultado.get("active") is not True:
                print('[INTROSPECT-DIAG] Token inactivo', flush=True)
                return False

            if resultado.get("client_id") != client_id:
                print('[INTROSPECT-DIAG] Client ID diferente', flush=True)
                return False

            if not self.validar_permisos_oauth(resultado.get("scope")):
                print('[INTROSPECT-DIAG] Scope rechazado', flush=True)
                return False

            return True

        except (
            urllib.error.URLError,
            ValueError,
            TimeoutError,
            OSError
        ):
            return False


    def validar_identidad_oauth(self, token):
        """Verifica la identidad del usuario mediante Authentik UserInfo."""
        import os
        import urllib.request
        import urllib.error
        import json
        import hmac

        sub_autorizado = os.environ.get("OAUTH_ALLOWED_SUB", "").strip()

        if not sub_autorizado or not token or len(token) > 8192:
            return False

        url = (
            "http://manlate-authentik-server-1:9000"
            "/application/o/userinfo/"
        )

        solicitud = urllib.request.Request(
            url,
            headers={
                "Authorization": "Bearer " + token,
                "Accept": "application/json",
            },
            method="GET",
        )

        try:
            with urllib.request.urlopen(solicitud, timeout=5) as respuesta:
                datos = json.load(respuesta)

            sub = datos.get("sub")

            return (
                isinstance(sub, str)
                and hmac.compare_digest(sub, sub_autorizado)
            )

        except (
            urllib.error.URLError,
            ValueError,
            TimeoutError,
            OSError,
        ):
            return False


    def validar_permisos_oauth(self, scopes):
        """Exige el permiso exclusivo de Manlate AI Bridge."""
        if not isinstance(scopes, str):
            return False

        permisos = set(scopes.split())

        return "manlate.mcp" in permisos

    def exigir_autorizacion(self):
        if self.autorizado():
            return True

        self.send_response(401)
        self.send_header("Content-Type", "application/json")
        self.send_header(
            "WWW-Authenticate",
            'Bearer resource_metadata="https://manlate-ai-bridge-v4.jellyfinplux.uk/.well-known/oauth-protected-resource/mcp"'
        )
        self.end_headers()
        self.wfile.write(
            b'{"error":"No autorizado"}'
        )
        return False


    def do_POST(self):
        if not self.exigir_autorizacion():
            return
        if self.path != "/mcp":
            self.responder({"error": "Ruta no encontrada"}, 404)
            return

        try:
            longitud = int(self.headers.get("Content-Length", "0"))

            if longitud <= 0 or longitud > 65536:
                self.responder({"error": "Solicitud inválida"}, 400)
                return

            solicitud = json.loads(
                self.rfile.read(longitud).decode("utf-8")
            )

            if not isinstance(solicitud, dict):
                self.responder({"error": "Solicitud inválida"}, 400)
                return

            metodo = solicitud.get("method")
            identificador = solicitud.get("id")

            if metodo == "notifications/initialized":
                self.send_response(202)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return

            if metodo == "initialize":
                resultado = {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {"tools": {}},
                    "serverInfo": {
                        "name": "manlate-ai-bridge",
                        "version": "5.0.0-dev"
                    }
                }

            elif metodo == "tools/list":
                resultado = {
                    "tools": [
                        {
                            "name": "listar_proyectos",
                            "description": "Lista los proyectos registrados en Manlate AI Bridge.",
                            "inputSchema": {
                                "type": "object",
                                "properties": {},
                                "additionalProperties": False
                            }
                        },
                        {
                            "name": "estado_truenas",
                            "description": "Consulta CPU, RAM y actividad visibles desde Docker en modo solo lectura.",
                            "inputSchema": {
                                "type": "object",
                                "properties": {},
                                "additionalProperties": False
                            }
                        },
                        {
                            "name": "estado_memoria",
                            "description": "Consulta el estado de la memoria del Bridge.",
                            "inputSchema": {
                                "type": "object",
                                "properties": {},
                                "additionalProperties": False
                            }
                        }
                    ,
                    {
                        "name": "listar_archivos_cryapp",
                        "description": "Lista archivos autorizados de CryApp en modo solo lectura.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {},
                            "additionalProperties": False
                        }
                    },
                    {
                        "name": "consultar_hash_cryapp",
                        "description": "Consulta SHA-256 de un archivo CryApp en desarrollo.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "ruta": {"type": "string"}
                            },
                            "required": ["ruta"]
                        }
                    },
                    {
                        "name": "leer_archivo_cryapp",
                        "description": "Lee un archivo autorizado del codigo de CryApp.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "ruta": {
                                    "type": "string",
                                    "description": "Ruta relativa del archivo dentro de CryApp"
                                }
                            },
                            "required": ["ruta"],
                            "additionalProperties": False
                        }
                    }
                    ,{"name":"editar_archivo_cryapp","description":"Edita un archivo autorizado de CryApp con copia de respaldo y verificación SHA-256.","inputSchema":{"type":"object","properties":{"ruta":{"type":"string"},"contenido":{"type":"string"},"sha256_esperado":{"type":"string"}},"required":["ruta","contenido","sha256_esperado"],"additionalProperties":False}},
                    {"name":"guardar_memoria","description":"Guarda una nota de continuidad por proyecto; no guardar contraseñas ni secretos.","inputSchema":{"type":"object","properties":{"proyecto":{"type":"string"},"contenido":{"type":"string"}},"required":["proyecto","contenido"],"additionalProperties":False}},
                    {"name":"consultar_memoria","description":"Consulta notas de continuidad guardadas para un proyecto.","inputSchema":{"type":"object","properties":{"proyecto":{"type":"string"},"limite":{"type":"integer","minimum":1,"maximum":50}},"required":["proyecto"],"additionalProperties":False}},
                    {"name":"ejecutar_shell_truenas","description":"Ejecuta en la shell del usuario SSH de TrueNAS cuando el propietario lo solicite. Puede modificar el sistema.","annotations":{"readOnlyHint":False,"destructiveHint":True,"openWorldHint":True},"inputSchema":{"type":"object","properties":{"comando":{"type":"string"},"tiempo":{"type":"integer","minimum":1,"maximum":120}},"required":["comando"],"additionalProperties":False}}
                ]
                }

            elif metodo == "tools/call":
                parametros = solicitud.get("params", {})
                herramienta = parametros.get("name")
                argumentos = parametros.get("arguments", {})
                if not isinstance(argumentos, dict):
                    raise ValueError("Argumentos inválidos")

                if herramienta == "listar_proyectos":
                    con = sqlite3.connect(
                        f"file:{DB}?mode=ro&immutable=1",
                        uri=True
                    )
                    proyectos = [
                        fila[0]
                        for fila in con.execute(
                            "SELECT nombre FROM proyectos ORDER BY nombre"
                        )
                    ]
                    con.close()

                    datos = {
                        "total": len(proyectos),
                        "proyectos": proyectos
                    }

                elif herramienta == "estado_truenas":
                    from estado_truenas import consultar_estado_truenas
                    datos = consultar_estado_truenas()

                elif herramienta == "listar_archivos_cryapp":
                    from cryapp_lectura_segura_v2 import listar_archivos_cryapp
                    datos = listar_archivos_cryapp()

                elif herramienta == "leer_archivo_cryapp":
                    from cryapp_lectura_segura_v2 import leer_archivo_cryapp

                    argumentos = parametros.get("arguments", {})

                    if not isinstance(argumentos, dict):
                        argumentos = {}

                    ruta = argumentos.get("ruta")

                    try:
                        datos = leer_archivo_cryapp(ruta)
                    except ValueError:
                        datos = {
                            "error": "Archivo no disponible o ruta no autorizada"
                        }

                elif herramienta == "consultar_hash_cryapp":
                    try:
                        import hashlib
                        from cryapp_seguridad_edicion_v2 import validar_ruta
                        from cryapp_edicion_segura_v1 import _leer_seguro

                        ruta = argumentos.get("ruta", "")
                        archivo_cryapp = validar_ruta(ruta)
                        contenido = _leer_seguro(archivo_cryapp)

                        datos = {
                            "ruta": ruta,
                            "sha256": hashlib.sha256(contenido).hexdigest(),
                            "bytes": len(contenido)
                        }

                    except (ValueError, OSError):
                        datos = {
                            "error": "Archivo no disponible o ruta no autorizada"
                        }

                elif herramienta == "editar_archivo_cryapp":
                    from cryapp_edicion_integrada_v3 import editar_archivo_cryapp
                    datos = editar_archivo_cryapp(argumentos.get("ruta"), argumentos.get("contenido"), argumentos.get("sha256_esperado"))
                elif herramienta == "guardar_memoria":
                    from memoria_v5 import guardar
                    datos = guardar(argumentos.get("proyecto"), argumentos.get("contenido"))
                elif herramienta == "consultar_memoria":
                    from memoria_v5 import consultar
                    datos = consultar(argumentos.get("proyecto"), argumentos.get("limite", 20))
                elif herramienta == "ejecutar_shell_truenas":
                    from shell_truenas import ejecutar
                    datos = ejecutar(argumentos.get("comando"), argumentos.get("tiempo", 60))
                elif herramienta == "estado_memoria":
                    datos = {
                        "servicio": "Manlate AI Bridge",
                        "estado": "online",
                        "modo": "solo lectura"
                    }

                else:
                    self.responder({
                        "jsonrpc": "2.0",
                        "id": identificador,
                        "error": {
                            "code": -32602,
                            "message": "Herramienta desconocida"
                        }
                    })
                    return

                resultado = {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(datos, ensure_ascii=False)
                        }
                    ]
                }

            else:
                self.responder({
                    "jsonrpc": "2.0",
                    "id": identificador,
                    "error": {
                        "code": -32601,
                        "message": "Método no encontrado"
                    }
                })
                return

            self.responder({
                "jsonrpc": "2.0",
                "id": identificador,
                "result": resultado
            })

        except Exception:
            self.responder({
                "jsonrpc": "2.0",
                "id": None,
                "error": {
                    "code": -32603,
                    "message": "Error interno"
                }
            }, 500)



    def responder_metadatos_oauth(self):
        self.responder({
            "resource": "https://manlate-ai-bridge-v4.jellyfinplux.uk/mcp",
            "authorization_servers": [
                "https://authentik.jellyfinplux.uk/application/o/manlate-ai-bridge/"
            ],
            "bearer_methods_supported": ["header"]
        })

    def do_GET(self):
        if self.path in (
            "/.well-known/oauth-protected-resource",
            "/.well-known/oauth-protected-resource/mcp"
        ):
            self.responder_metadatos_oauth()
            return
        if self.path == "/health":
            self.responder({
                "servicio": "Manlate AI Bridge",
                "estado": "online"
            })
            return

        if self.path == "/proyectos":
            if not self.exigir_autorizacion():
                return
            try:
                con = sqlite3.connect(
                    f"file:{DB}?mode=ro&immutable=1",
                    uri=True
                )
                proyectos = [
                    fila[0] for fila in con.execute(
                        "SELECT nombre FROM proyectos ORDER BY nombre"
                    )
                ]
                con.close()

                self.responder({
                    "total": len(proyectos),
                    "proyectos": proyectos
                })
            except Exception:
                self.responder(
                    {"error": "No se pudo consultar la memoria"},
                    500
                )
            return

        self.responder({"error": "Ruta no encontrada"}, 404)

    def responder(self, datos, codigo=200):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
