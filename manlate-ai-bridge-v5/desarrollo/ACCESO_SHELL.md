# Acceso a la shell de TrueNAS — desarrollo V5

Estado: implementación experimental. No instalar ni exponer V5 hasta verificar OAuth, los permisos del usuario, la configuración de red y una prueba de conexión real.

V5 ejecuta comandos en el servidor TrueNAS mediante SSH. Los comandos se ejecutan con los permisos del usuario SSH configurado; un contenedor no tiene automáticamente acceso al host. El puente puede modificar o eliminar datos accesibles por ese usuario. Una cuenta con sudo sin contraseña amplía su alcance de forma equivalente.

## Requisitos

1. El servicio SSH de TrueNAS debe estar habilitado y accesible desde el contenedor.
2. Una cuenta del host con acceso SSH mediante una clave dedicada. El usuario se configura en BRIDGE_SSH_USER. No incluir contraseñas ni claves privadas en GitHub.
3. Una clave privada dedicada montada en el contenedor como archivo de solo lectura accesible por su usuario, normalmente /run/secrets/bridge_ssh_key. La clave pública correspondiente debe estar autorizada en la cuenta de TrueNAS. No se acepta una frase de contraseña interactiva porque SSH funciona en modo BatchMode.
4. Un archivo known_hosts montado como /run/secrets/bridge_known_hosts y obtenido tras verificar la identidad y huella del servidor por un canal de confianza. El puente exige StrictHostKeyChecking=yes y rechaza claves desconocidas o cambiadas.
5. El cliente OpenSSH instalado en la imagen del contenedor y un directorio temporal escribible.

## Variables necesarias

- BRIDGE_SHELL_ENABLED=true habilita la herramienta; sin esta variable se rechaza.
- BRIDGE_SSH_HOST: dirección accesible desde el contenedor.
- BRIDGE_SSH_USER: cuenta SSH existente en el host.
- BRIDGE_SSH_PORT: puerto SSH; predeterminado 22.
- BRIDGE_SSH_KEY: ruta de la clave privada en el contenedor; predeterminada /run/secrets/bridge_ssh_key.
- BRIDGE_SSH_KNOWN_HOSTS: ruta del archivo de servidores verificados; predeterminada /run/secrets/bridge_known_hosts.

Las rutas y credenciales son particulares de la instalación y no se generan ni registran automáticamente aquí. No publicar claves ni datos sensibles en mensajes o registros.

## Funcionamiento y límites

La herramienta ejecutar_shell_truenas recibe comando y tiempo entre 1 y 120 segundos. SSH no abre una terminal interactiva ni puede recibir contraseñas o confirmaciones interactivas. Sudo que requiere contraseña no funcionará. Una interrupción por tiempo no garantiza que un proceso remoto termine; debe comprobarse su estado antes de repetir la tarea. Se devuelven como máximo 64 KiB de salida, que puede contener información sensible. La salida se almacena temporalmente en disco mientras dura la operación.

El servidor de desarrollo conserva la configuración OAuth de V4 y aún no tiene configuración automática de V5, limitación de salida en disco, auditoría completa, integración GitHub ni un instalador verificado. La validación local usa simulaciones; falta probar una conexión real desde el contenedor a TrueNAS y desde ChatGPT. No abrir el puente a Internet hasta completar y comprobar esa integración.

## Verificación antes de uso

Tras instalar y autenticar el puente, probar primero un comando de lectura como `id` y confirmar que responde el usuario esperado. Después comprobar que memoria, rutas de proyectos, copias de seguridad y recuperación funcionan por separado. Usar solo los permisos de sistema necesarios para las tareas solicitadas.
