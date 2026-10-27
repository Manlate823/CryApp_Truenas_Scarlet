# Acceso a la shell de TrueNAS — desarrollo V5

Estado: experimental. V5 puede ejecutar comandos en TrueNAS mediante SSH usando una clave dedicada, pero no se ha validado una conexión real desde este contenedor. No instalar ni exponer V5 hasta completar la configuración OAuth, red, clave y pruebas de respaldo.

Los comandos se ejecutan con los permisos de `BRIDGE_SSH_USER`. Una cuenta con sudo sin contraseña amplía el alcance. El usuario debe autorizar la ejecución de cada tarea mediante su solicitud al asistente; no se aceptan contraseñas interactivas ni se abre una terminal TTY.

## Requisitos

1. Habilitar SSH en TrueNAS y permitir conexión desde el contenedor.
2. Usar una cuenta dedicada del host y una clave privada dedicada. No guardar claves ni contraseñas en GitHub.
3. Montar la clave como archivo de solo lectura (predeterminado `/run/secrets/bridge_ssh_key`) y autorizar su clave pública en TrueNAS.
4. Montar un `known_hosts` creado después de verificar la huella del servidor por un canal confiable (predeterminado `/run/secrets/bridge_known_hosts`). SSH exige `StrictHostKeyChecking=yes`.
5. Habilitar `BRIDGE_SHELL_ENABLED=true` solo después de configurar host, usuario, puerto y archivos SSH.

## Configuración de OAuth V5

Configurar `BRIDGE_PUBLIC_URL` con la URL HTTPS pública que se registrará para V5 y `OAUTH_AUTHORIZATION_SERVER_URL` con el emisor OAuth de Authentik. El servidor publica `manlate.mcp` como ámbito requerido. El cliente OAuth y Authentik deben tener configurados el mismo ámbito, redirect URI, client ID y secreto. Los secretos se montan desde archivos y no se guardan en el repositorio.

## Límites

La herramienta `ejecutar_shell_truenas` acepta comandos de hasta 8 KiB y timeout de 1 a 120 segundos. Devuelve hasta 64 KiB de salida, almacenada temporalmente mientras corre SSH. Un timeout no garantiza que el proceso remoto se haya detenido; comprobar su estado antes de repetirlo. La salida de un comando puede contener información sensible.

## Verificación pendiente

Las pruebas actuales simulan SSH y HTTP localmente. Antes de producción hace falta comprobar desde TrueNAS: que ChatGPT completa OAuth V5, que `id` responde con el usuario SSH previsto, que memoria sobrevive al reinicio, que CryApp genera respaldo recuperable y que un fallo de la conexión no repite comandos automáticamente.
