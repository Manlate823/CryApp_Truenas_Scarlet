# Manlate AI Bridge V5

**Estado:** desarrollo experimental. Todavía no instalar en producción.

V5 ya tiene autenticación OAuth de Authentik por introspección e identidad, herramientas MCP de lectura y edición protegida de CryApp, memoria SQLite por proyecto y una herramienta opcional de shell mediante SSH. La memoria crea su directorio al iniciar y el contenedor se ejecuta como UID 568 sin privilegios de root.

La URL pública y el emisor OAuth se configuran con `BRIDGE_PUBLIC_URL` y `OAUTH_AUTHORIZATION_SERVER_URL`. La metadata de recurso anuncia el ámbito `manlate.mcp`. No se incluyen credenciales en GitHub.

## Lo que falta antes de instalar

- Crear integración GitHub para explorar repositorios y preparar cambios con diff y respaldo.
- Completar el instalador y el paquete ZIP para TrueNAS.
- Configurar el dominio OAuth de V5 en Authentik y Cloudflare, y verificar el flujo desde ChatGPT.
- Probar SSH real con una clave dedicada y el host key de TrueNAS verificado.
- Validar respaldo, restauración y persistencia en el NAS.

La herramienta SSH ejecuta comandos como el usuario configurado; el alcance efectivo depende de sus permisos y de cualquier regla sudo. No equivale a acceso automático al host desde Docker. El usuario final no debe escribir código para usar las herramientas, pero la instalación requiere completar la configuración propia del servidor.

## Pruebas locales

En `desarrollo/`, ejecutar `python3 -m unittest -v test_v5.py`. Las pruebas simulan HTTP y SSH; no validan conexión real a Authentik, ChatGPT ni TrueNAS.
