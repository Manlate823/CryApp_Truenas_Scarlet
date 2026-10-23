# CryApp — estado y continuidad (23 octubre 2026)

## Objetivo acordado
- Moneda predeterminada USD para **CryApp principal** y **CryApp Admin PRO**.
- Mantener importes históricos DOP separados, **sin convertirlos ni reinterpretarlos como USD**.
- Plan GRATIS mantiene acceso restringido; PRO y PREMIUM desbloquean funciones.
- Conservar diseño negro, rojo y dorado.
- Cambios de código vía GitHub; evitar pedir al usuario que copie comandos de edición de archivos.

## Infraestructura
- Repo: Manlate823/CryApp_Truenas_Scarlet (privado).
- Admin TEST: rama de despliegue desarrollo/admin-pro; cron de TrueNAS cada 15 min.
- Admin TEST: /mnt/Almacenamiento_HDD/BaseDatos/CryApp_Admin_Test.
- Admin TEST PostgreSQL: cryapp_admin_test; contenedor cryapp-admin-test-postgres-test-1.
- Admin TEST app: cryapp-admin-test-admin-test-1, puerto 18093, /health.
- Auto-deploy Admin TEST: /mnt/Almacenamiento_HDD/BaseDatos/CryApp_Admin_Test_Deploy/cryapp_admin_test_auto.sh.
- El deploy actual copia server.js, setup-owner.js, package.json, package-lock.json, public/app.js, public/index.html; **NO aplica SQL automáticamente**.
- No modificar producción ni cron de producción sin autorización.

## Ramas preparatorias
- preparacion/usd-admin-pro: ajustes frontend y API Admin PRO para USD.
- preparacion/usd-cryapp-web: primer ajuste de visualización de planes en CryApp web; aún no listo para despliegue.
- Estas ramas **no** se despliegan por cron de TEST automáticamente.

## Pendiente antes de publicar en ramas de despliegue
1. Verificar sintaxis JS y pruebas en ambiente aislado.
2. Comprobar si SQL 003 ya se aplicó en PostgreSQL TEST. Si no, hacer copia de seguridad y aplicar migración **solo en TEST** con aprobación explícita.
3. Definir precios USD de PRO y PREMIUM; no convertir 299/599 DOP automáticamente. El Admin debe exigir precio USD configurado para aceptar nuevos pagos.
4. Verificar API de planes consumida por CryApp web y compatibilidad del backend compartido.
5. Revisar Marketplace: el campo price actual no contiene moneda explícita; no relabelar datos históricos como USD. Añadir campo moneda o migración segura antes de activar USD allí.
6. Revisar el deploy y su lista de archivos si se agregan dependencias; no asumir migraciones automáticas.
7. Solo después de validar, publicar en rama de despliegue TEST y comprobar /health, interfaz y operaciones. Producción después de aprobación.

## Principio operativo
El usuario pidió que el asistente haga los cambios en GitHub y que TrueNAS los descargue automáticamente. Solicitar comandos al usuario solo cuando sea imprescindible por acceso a TrueNAS o a su base de datos; no declarar un despliegue completado sin verificarlo.
