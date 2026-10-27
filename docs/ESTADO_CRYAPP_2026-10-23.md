# CryApp — continuidad técnica (23 de octubre de 2026)

> Documento de trabajo. No contiene contraseñas, tokens ni secretos. Describe el estado conocido, no una verificación en vivo de TrueNAS. NO ejecutar cambios en producción sin aprobación explícita.

## Objetivo del flujo de trabajo acordado
1. Usuario solicita una modificación.
2. Asistente cambia archivos del repositorio privado GitHub, en rama de preparación/desarrollo.
3. TrueNAS consulta GitHub periódicamente (objetivo: cada 15 minutos, frecuencia efectiva de TEST aún sin confirmar), detecta nueva versión, verifica, respalda y actualiza TEST mediante scripts **existentes**.
4. Usuario prueba TEST y autoriza explícitamente publicación oficial.
5. Solo entonces desplegar en producción con verificaciones, respaldo y reversión. No crear actualizadores paralelos para cada cambio.
6. No tocar diseño ni datos oficiales para reparar TEST.

## Repositorio y ramas
- Repositorio privado: `Manlate823/CryApp_Truenas_Scarlet`.
- Rama oficial: `main`; NO actualizar sin aprobación.
- Desarrollo Admin PRO: `desarrollo/admin-pro`.
- Preparación web USD + perfil: `preparacion/usd-cryapp-web`.
- Preparación Admin USD: `preparacion/usd-admin-pro`.
- Archivos relevantes: `web/js/app.js`, `web/js/config.js`, `backend/auth.js`, `backend/subscriptions.js`, `backend/ejemplares.js`, `backend/server.js`, `admin/public/app.js`, `admin/server.js`, `admin/sql/003_usd_financial_adjustments.sql`.

## TrueNAS: rutas y servicios conocidos
- Base: `/mnt/Almacenamiento_HDD/BaseDatos`.
- Checkout GitHub: `CryApp_GitHub`.
- Scripts existentes: `CryApp_Deploy/cryapp_auto_update.sh`, `cryapp_actualizador.sh`, `cryapp_admin_deploy_v3.sh`, y `cryapp_test_update.sh` (este último se ejecutó manualmente para mostrar cambios de perfil en TEST).
- Oficial web: `CryApp/web/01_WEB`, contenedor `ix-cryapp-web-cryapp-web-1`, puerto 18091.
- Oficial API: `CryApp/backend`, contenedor `ix-cryapp-cryapp-api-1`, puerto 18090.
- Fotografías oficiales: `CryApp/fotos`. Una revisión encontró 4 archivos y 207 KB; no implica que todas las fotos esperadas estén presentes.
- PostgreSQL oficial: `ix-postgres-postgres-1`, BD `cryapp_db`.
- TEST web: `CryApp_TEST/web/01_WEB`, contenedor `cryapp-web-test`, puerto 18094; sitio `https://pruebatescryapp.jellyfinplux.uk/`.
- TEST nginx: `CryApp_TEST/nginx-test.conf`; compose: `CryApp_TEST/compose.web-test.yaml`.
- Contenedor PostgreSQL de restauración: `cryapp-restore-test-pg17`, BD `cryapp_restore_verificacion`, aún no acreditado como API aislada de TEST.
- Admin PRO TEST: `cryapp-admin-test-admin-test-1`, puerto 18093; PostgreSQL `cryapp-admin-test-postgres-test-1`.
- Admin oficial: `cryapp_admin-cryapp-admin-1`, puerto 18092.

## Advertencia crítica: TEST aún usa API oficial
La configuración nginx TEST compartida por el usuario proxifica a `172.16.15.1:18090` (API oficial) los siguientes endpoints:
- `POST /api/auth/login`, `GET /api/auth/me`, `GET /health/db`
- `GET /api/subscriptions/status`, `GET /api/subscriptions/plans`, `GET /api/subscriptions/requests`
- `GET /api/ejemplares`, `GET /api/modules/stats`
- El resto de `/api/` devuelve 503.
Esto permite leer datos oficiales desde TEST; no es aislamiento total. **No habilitar POST/DELETE hacia API oficial para probar funciones nuevas.** No ejecutar la eliminación de cuentas desde TEST mientras use API oficial.

## Fotografías en TEST — última tarea
Causa identificada: la API devuelve fotos con rutas `/api/fotos/<uuid>.(jpg|png|webp)`, pero nginx TEST no tenía ruta que las reenviara y el catch-all `/api/` respondía 503.
Se proporcionó al usuario un comando que:
1. Respalda `CryApp_TEST/nginx-test.conf` con sufijo timestamp.
2. Agrega `location ~ ^/api/fotos/[0-9a-fA-F-]{36}\\.(jpg|png|webp)$` con `limit_except GET { deny all; }` y `proxy_pass http://172.16.15.1:18090;`.
3. Ejecuta `docker exec cryapp-web-test nginx -t` y `nginx -s reload`.
**No se recibió confirmación de ejecución ni de visualización correcta**. Si se retoma, comprobar estado real antes de modificar.

## Cambios de precios USD pendientes
Precios solicitados: GRATIS US$0, PRO US$30, PREMIUM US$50, tanto CryApp oficial como Admin PRO oficial.
- La rama `preparacion/usd-admin-pro` contiene cambios de Admin y migración `admin/sql/003_usd_financial_adjustments.sql` para `price_usd`, `currency`, `amount_usd`.
- La rama `preparacion/usd-cryapp-web` contiene ajustes de visualización web y `backend/subscriptions.js` USD.
- Conservar historial de pagos DOP. **No aplicar migración sin copia de seguridad y validación de esquema; no publicar backend USD antes de migrar DB.**
- No hay confirmación de publicación en producción.

## Perfil: exportación y eliminación
En rama `preparacion/usd-cryapp-web` se guardaron:
- `web/js/app.js`: sección de seguridad en Perfil con botones para exportar y solicitar eliminación.
- `backend/auth.js`: `GET /api/auth/backup` (JSON con datos propios, sin archivos binarios de fotos) y `POST /api/auth/delete-account` (confirmación y contraseña, transacción).
- Commits relacionados: `f3417457be6b432040319e280348c42211109935`, `a79d6d8c76d3832f7479a535819170290252d4f4`, `079df22ba7c5d9873c154b8cc8f104230f434f30`.
- Usuario confirmó que tras ejecutar el actualizador manual de TEST los controles se veían.
- **No están validados ni son seguros para uso en producción**: exportación es JSON, no ZIP; no incluye binarios de fotos; revisar estructura real de tablas, dependencias de mensajes/pagos, retención legal, permisos, flujo de sesión y transacciones. En particular no probar eliminación con TEST apuntando a producción.

## Política de producto
- Plan GRATIS permite iniciar sesión y ver la app, pero mantiene bloqueadas casi todas las funciones.
- PRO y PREMIUM desbloquean funciones correspondientes.
- Mantener diseño actual negro/rojo/dorado; no sustituirlo por interfaces genéricas.

## Reglas para el próximo asistente
- Empezar por el cambio que pida el usuario; trabajar directamente en GitHub cuando sea posible.
- No prometer ejecución en TrueNAS: la Shell no está conectada al asistente.
- No decir que está desplegado solo porque el commit existe; confirmar versión en TEST.
- Priorizar scripts existentes, no introducir otros sin necesidad.
- Nunca modificar `main` o producción sin autorización expresa.
- No copiar secretos, credenciales, JWT, contraseñas ni datos privados al repositorio.
