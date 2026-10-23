# Punto exacto para continuar

Fecha: 2026-10-22.
Último cambio verificado: admin/sql/003_usd_financial_adjustments.sql, corrección de bloques DO $$ en commit e6b8975320627d9326ce39af737c1955e6cdb6ba, rama desarrollo/admin-pro.
Estado: guardado en GitHub; NO ejecutado en PostgreSQL TEST ni desplegado en producción.

Próximo paso:
1. Validar migración contra esquema real en TEST (incluidos gen_random_uuid, restricciones y referencias).
2. Implementar precios USD, cobros USD y devoluciones auditadas, conservando DOP histórico.
3. Probar cancelación sin reembolso y reembolso real; no publicar sin validación.

Regla: actualizar memoria después de cada cambio y no pedir al usuario repetir contexto.

## Avance de código 2026-10-22
Archivos nuevos: admin/financial.js y admin/tests/financial.test.js, rama desarrollo/admin-pro. Módulo puro que separa USD/DOP, calcula bruto/reembolsos confirmados/neto y rechaza reembolsos excesivos; pruebas unitarias escritas pero NO ejecutadas. No conectado a endpoints ni desplegado.
Siguiente: ejecutar node --test admin/tests/financial.test.js en TEST, ajustar el esquema SQL para status='confirmed' de reembolsos, conectar el cálculo al API y panel, validar antes de producción.

## Última actualización
Commit 667d7d625f56a5bd4390159903ff48761366d688: SQL de reembolsos alineado con admin/financial.js. NO ejecutado ni probado en TrueNAS. Próximo: validar migración en PostgreSQL TEST, ejecutar pruebas unitarias y conectar endpoints con transacciones que impidan reembolsos excesivos o duplicados. No desplegar producción todavía.

## Petición más reciente
El usuario quiere poder quitar un plan incluso al administrador. Eliminada en admin/server.js la validación que rechazaba b.userId===u.id, commit 50f824745b5ec4ca87b0585585b827ad6aa0a7db. Se mantiene rol de admin independiente de suscripción. Pendiente probar cancelación de la cuenta propietaria en TEST y desplegar tras validación; no afirmar que ya aparece en producción.

## Comprobación TrueNAS reportada por usuario (2026-10-23)
El usuario eliminó manualmente del archivo /mnt/Almacenamiento_HDD/BaseDatos/CryApp_Admin/server.js el bloqueo para cancelar su propia suscripción y reinició cryapp_admin-cryapp-admin-1. Docker ps mostró el contenedor Up y el puerto 127.0.0.1:18092->3000. Aún NO está comprobado que el endpoint permita la operación ni que el cambio persista tras un despliegue automático. El comando node --check que mostró el usuario parece apuntar a /app/server.jss, por lo que falta verificar /app/server.js y /health. No cancelar realmente la suscripción para probar sin aprobación explícita.
