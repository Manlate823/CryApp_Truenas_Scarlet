# Estado actual — 2026-10-22

## Producto
CryApp es una aplicación web para registro y administración de aves, genealogía, camadas, sanidad, mensajería, marketplace y funciones PRO. La interfaz existente utiliza negro, rojo y dorado. CryApp Admin PRO administra usuarios, planes, solicitudes de pago, suscripciones, auditoría e ingresos.

## Código verificado en GitHub
Repositorio privado: Manlate823/CryApp_Truenas_Scarlet.
Rama inspeccionada: desarrollo/admin-pro.
Archivos existentes verificados: admin/server.js, admin/public/app.js, admin/public/index.html, admin/sql/001_admin.sql, backend/subscriptions.js.
El código actual usa price_dop y amount_dop. El endpoint de cancelación elimina la suscripción; el panel suma pagos aprobados en DOP.

## Trabajo reciente
Creada migración preparatoria admin/sql/003_usd_financial_adjustments.sql en desarrollo/admin-pro. La migración añade price_usd, amount_usd, currency y tabla de ajustes; no está aplicada ni probada en PostgreSQL según las acciones realizadas desde esta conversación.
No afirmar que USD o ajustes contables ya funcionan en producción.

## Alcance de acceso
GitHub conectado y con permisos de escritura comprobados. No hay acceso directo comprobado al terminal de TrueNAS desde esta conversación.
