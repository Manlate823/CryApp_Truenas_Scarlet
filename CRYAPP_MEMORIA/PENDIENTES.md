# Pendientes priorizados — 2026-10-22

## Alta prioridad: USD y contabilidad
- Revisar y probar migración 003_usd_financial_adjustments.sql en PostgreSQL TEST.
- Definir precios reales USD para PRO y PREMIUM antes de activar nuevas solicitudes USD. No asumir equivalencias con RD$299/RD$599.
- Actualizar backend/subscriptions.js para nuevas solicitudes USD y lectura explícita de moneda.
- Actualizar admin/server.js: planes USD, pagos USD, balance neto USD y reembolsos auditados. Mantener DOP histórico separado.
- Actualizar admin/public/app.js e index.html para mostrar moneda correcta y distinguir ingresos brutos/netos.
- Evitar doble reembolso; validar que un reembolso no supere lo cobrado y que no se aplique sobre pagos rechazados.
- Probar flujos: GRATIS, aprobación, cancelación sin reembolso, reembolso confirmado, duplicados, renovaciones y permisos.
- Solo tras pruebas y aprobación, desplegar producción.

## Otros asuntos conocidos
- Revisar login/registro de nuevos usuarios y carga/visualización de fotos.
- Mantener apariencia del HTML original de CryApp.
- Comprobar actualizador y restauración/rollback antes de desplegar.
