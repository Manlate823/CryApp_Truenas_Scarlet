# Punto exacto para continuar

Fecha: 2026-10-22.
Última acción: documentación de memoria creada en GitHub en la rama desarrollo/admin-pro. No se ha ejecutado migración SQL en servidor TEST ni se ha cambiado producción.
Archivo preparatorio: admin/sql/003_usd_financial_adjustments.sql.
Último commit previo de esa migración: 27324c29064d1740f81ce05037812c2a2271e962.

Próximo paso técnico:
1. Revisar esquema existente y compatibilidad de la migración con tipos de columnas de pagos y usuarios.
2. Implementar backend + admin para moneda explícita USD y reembolsos reales auditados.
3. Probar en TEST. No aplicar en producción hasta validación.

No pedir al usuario que vuelva a explicar el contexto ni que ejecute comandos innecesarios. Leer esta carpeta al retomar.
