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

## Solicitud de perfil y mensajería — 2026-10-23
- Mostrar foto de perfil y nombre del destinatario en lista de chats, encabezado de conversación y ficha del contacto; avatar CryApp por defecto. Investigar el origen actual de avatar y su URL antes de implementar.
- En Mi perfil > Seguridad y cuenta, permitir solicitar eliminación definitiva de la propia cuenta con autenticación reciente, confirmación explícita, revocación de sesiones y tratamiento documentado de registros y datos compartidos. No ejecutar eliminaciones durante pruebas ni tocar cuentas ajenas.
- En Mi perfil > Mis copias de seguridad, permitir exportación privada y restauración validada de los datos propios (ejemplares, genealogía, camadas, registros y archivos asociados), con control de propiedad, límites, versiones y protección frente a duplicados. Probar en entorno aislado primero.
- Preservar interfaz negro/rojo/dorado y el diseño HTML existente. Aún NO implementado ni desplegado. Usuario proporcionó capturas de perfil y modal de chat.
