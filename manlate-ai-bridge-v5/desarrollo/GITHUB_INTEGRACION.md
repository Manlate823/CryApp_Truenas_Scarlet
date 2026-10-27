# Integración GitHub en V5

La integración permite listar archivos, leer archivos de texto y guardar actualizaciones como commits en ramas configuradas. Solo acepta repositorios incluidos en `GITHUB_ALLOWED_REPOSITORIES` y ramas incluidas en `GITHUB_ALLOWED_BRANCHES`; ambas listas son obligatorias. Las ediciones requieren el SHA actual del archivo, que evita sobrescribir una versión que haya cambiado.

Configurar un token de GitHub de alcance mínimo, limitado a los repositorios de trabajo y con permiso `Contents: read and write`. Montarlo como archivo de solo lectura en `/run/secrets/github_token`, o indicar otra ruta mediante `GITHUB_TOKEN_FILE`. No guardar el token en variables visibles, logs, archivos del repositorio ni memoria del asistente.

Ejemplo de valores no secretos:

- `GITHUB_ALLOWED_REPOSITORIES=Manlate823/CryApp_Truenas_Scarlet`
- `GITHUB_ALLOWED_BRANCHES=desarrollo/manlate-ai-bridge-v5`

La integración bloquea rutas de credenciales y archivos sensibles comunes (`.env`, claves, OAuth, secretos y `.github`). Limita cada archivo a 2 MiB y oculta el cuerpo de errores de GitHub para evitar registrar información del repositorio o de autenticación.

La prueba local simula la API; falta validar una conexión con el token real en una rama de desarrollo antes de usar esta función en producción.
