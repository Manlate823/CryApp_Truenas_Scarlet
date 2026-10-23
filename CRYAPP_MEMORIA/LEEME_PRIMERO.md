# Memoria de trabajo de CryApp
Actualizado: 2026-10-22

Esta carpeta es el punto de referencia persistente para continuar CryApp y CryApp Admin PRO. Antes de modificar código: leer ESTADO_ACTUAL.md, DECISIONES.md, PENDIENTES.md y CONTINUAR_AQUI.md. Confirmar el estado real del repositorio y de las pruebas; la documentación no sustituye una comprobación.

Reglas: nunca publicar directamente en main ni alterar producción sin pruebas y autorización. Mantener el diseño existente. No almacenar contraseñas, secretos, tokens ni datos personales. Actualizar estos archivos después de cambios importantes.

Archivos:
- ESTADO_ACTUAL.md: componentes confirmados y límites.
- DECISIONES.md: decisiones del producto y contabilidad.
- TRUENAS.md: infraestructura sin secretos.
- GITHUB.md: repositorio, ramas y despliegue.
- PENDIENTES.md: lista de trabajo.
- CONTINUAR_AQUI.md: próximo paso preciso.
- HISTORIAL.md: cambios comprobados.

## Regla permanente de actualización automática de documentación
- En cada sesión de trabajo sobre CryApp, consultar primero esta carpeta.
- Cuando el usuario indique una nueva función, requisito, corrección, preferencia o decisión, registrarla en DECISIONES.md o PENDIENTES.md según corresponda, sin esperar a que vuelva a pedirlo.
- Después de CADA cambio real de código, configuración o infraestructura que se pueda verificar, actualizar ESTADO_ACTUAL.md, HISTORIAL.md y CONTINUAR_AQUI.md en el mismo flujo de trabajo, incluyendo fecha, archivos afectados, rama, commit y si está probado/desplegado o no.
- Al concluir cada intervención, registrar lo pendiente y el próximo paso concreto en CONTINUAR_AQUI.md.
- Nunca marcar algo como implementado o desplegado por haberlo propuesto; distinguir solicitado, en progreso, guardado en GitHub, probado en TEST y publicado en producción.
- Evitar duplicar contenido extenso; usar referencias y resúmenes compactos.
- No almacenar secretos ni datos sensibles.
- Este protocolo se aplica cuando el asistente tenga acceso de escritura al repositorio y esté trabajando en él; no implica un proceso en segundo plano ni sincronización autónoma fuera de las conversaciones.
