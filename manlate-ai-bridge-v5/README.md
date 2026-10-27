# Manlate AI Bridge V5

**Estado:** desarrollo experimental. Todavía no instalar en producción.

V5 ya tiene autenticación OAuth de Authentik por introspección e identidad, herramientas MCP de lectura y edición protegida de CryApp, memoria SQLite por proyecto, acceso acotado a GitHub y una herramienta opcional de shell mediante SSH. La memoria crea su directorio al iniciar y el contenedor se ejecuta como UID 568 sin privilegios de root. Hay una plantilla Compose y un instalador interactivo que detecta rutas/valores OAuth de V4, crea secretos locales y agrega la clave SSH a la cuenta indicada y configura sudo sin contraseña para otorgar acceso administrativo total, como pidió el propietario. V4 queda intacta. El instalador todavía no se ha probado en TrueNAS ni crea la ruta de Cloudflare por sí solo.

La URL pública y el emisor OAuth se configuran con `BRIDGE_PUBLIC_URL` y `OAUTH_AUTHORIZATION_SERVER_URL`. La metadata de recurso anuncia el ámbito `manlate.mcp`. No se incluyen credenciales en GitHub.

## Lo que falta antes de instalar

- Empaquetar un ZIP descargable con el instalador.
- Probar el instalador en TrueNAS conservando V4 y comprobar su rollback.
- Probar GitHub con un token limitado en la rama de desarrollo.
- Configurar el dominio OAuth de V5 en Authentik y Cloudflare, y verificar el flujo desde ChatGPT.
- Probar SSH real con una clave dedicada y el host key de TrueNAS verificado.
- Validar respaldo, restauración y persistencia en el NAS.

La herramienta SSH ejecuta comandos como el usuario configurado; el alcance efectivo depende de sus permisos y de cualquier regla sudo. No equivale a acceso automático al host desde Docker. El usuario final no debe escribir código para usar las herramientas, pero la instalación requiere completar la configuración propia del servidor.

## Pruebas locales

Copiar `.env.example` a `.env` y completar únicamente valores de configuración no secretos; colocar los secretos como archivos ignorados por Git. El instalador necesita una URL HTTPS nueva y un token GitHub. También pide host/usuario SSH; verifica el host usando la clave pública local de TrueNAS. Para cumplir el acceso total solicitado, instala una regla sudo NOPASSWD para la cuenta elegida; su respaldo queda junto a la regla anterior si ya existía. Después hay que apuntar el hostname en Cloudflare a V5 y comprobar el OAuth desde ChatGPT. La instalación lateral no reemplaza V4. En `desarrollo/`, ejecutar `python3 -m unittest -v test_v5.py`. Las pruebas simulan HTTP y SSH; no validan conexión real a Authentik, ChatGPT ni TrueNAS.
