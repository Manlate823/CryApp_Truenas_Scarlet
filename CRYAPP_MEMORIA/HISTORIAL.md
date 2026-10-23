# Historial resumido

- 2026-10: desarrollo de CryApp web y CryApp Admin PRO, con PostgreSQL en TrueNAS, acceso por Cloudflare Tunnel y repositorio GitHub privado.
- 2026-10-22: repositorio y ramas comprobados mediante conector GitHub; backend y panel administrativo inspeccionados.
- 2026-10-22: creada admin/sql/003_usd_financial_adjustments.sql en desarrollo/admin-pro (commit 157f45b03b6d65ba4466ed65fcf72de52ddda34f).
- 2026-10-22: corregida la repetibilidad de las restricciones de migración (commit 27324c29064d1740f81ce05037812c2a2271e962).
- 2026-10-22: creada carpeta CRYAPP_MEMORIA para mantener contexto persistente.

- 2026-10-22: añadida regla de mantenimiento continuo de CRYAPP_MEMORIA en LEEME_PRIMERO.md (commit ad1271adc54d814b51b3481fed69cf1fc48237fc). Se actualizará durante futuras sesiones con acceso al repositorio; no es un proceso en segundo plano.

- 2026-10-22: corregidos delimitadores PostgreSQL DO $$ de admin/sql/003_usd_financial_adjustments.sql (commit e6b8975320627d9326ce39af737c1955e6cdb6ba). Cambio guardado en desarrollo/admin-pro, sin prueba SQL ni despliegue.

- 2026-10-22: creados admin/financial.js y admin/tests/financial.test.js (commits f89b00bccc58567fae1ff6697962a9fc8c77fcbc y b0fcf2f43248888cf27f6b4f59c735e20781b173). Calculadora aislada USD/DOP y pruebas escritas; no conectada a API ni ejecutadas pruebas.

- 2026-10-22: migración 003 actualizada para reembolsos con estados pending/confirmed/rejected, fecha de confirmación y múltiples reembolsos parciales (commit 667d7d625f56a5bd4390159903ff48761366d688). Solo GitHub desarrollo, sin ejecución SQL.
