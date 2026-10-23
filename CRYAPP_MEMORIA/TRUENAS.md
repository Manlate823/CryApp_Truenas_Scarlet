# TrueNAS — referencias operativas (sin secretos)

Sistema: TrueNAS SCALE.
CryApp producción: API puerto 18090, web puerto 18091.
CryApp Admin PRO: contenedor cryapp_admin-cryapp-admin-1, puerto local 127.0.0.1:18092; dominio admin-cryapp.jellyfinplux.uk vía Cloudflare Tunnel.
PostgreSQL producción: ix-postgres-postgres-1.
Código admin: /mnt/Almacenamiento_HDD/BaseDatos/CryApp_Admin/
Deploy admin: /mnt/Almacenamiento_HDD/BaseDatos/CryApp_Admin_Deploy/cryapp_admin_deploy_v3.sh
GitHub clone: /mnt/Almacenamiento_HDD/BaseDatos/CryApp_GitHub
Actualizadores: se configuraron comprobaciones cada 15 minutos; verificar estado antes de asumir despliegue.

Entorno de pruebas aislado:
Código: /mnt/Almacenamiento_HDD/BaseDatos/CryApp_Admin_Test/
Compose: compose.test.yaml
Proyecto Docker: cryapp-admin-test
Admin test: cryapp-admin-test-admin-test-1, 127.0.0.1:18093
PostgreSQL test: cryapp-admin-test-postgres-test-1
DB test: cryapp_admin_test; usuario cryapp_test.
Últimas comprobaciones reportadas: /health y login/lecturas administrativas respondían. Volver a comprobar antes de nuevas migraciones.

No incluir credenciales, variables secretas, cookies ni tokens en esta carpeta.
