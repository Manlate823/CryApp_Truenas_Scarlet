# Revisión de CryApp V2.8 (rama de desarrollo)

No desplegar esta rama en TrueNAS de producción hasta completar las pruebas.

## Cambios preparados
- Validación estricta de UUID en módulos.
- Errores 400 para JSON inválido y 413 para cuerpos demasiado grandes.
- La lista general de mensajes incluye mensajes recibidos además de enviados.

## Problemas identificados y pendientes
1. **Recuperación de contraseña:** el formulario existe en `web/index.html`, pero `backend/auth.js` no implementa solicitudes ni confirmación de recuperación. Requiere almacenamiento seguro de códigos con caducidad, limitación de intentos y un proveedor SMTP configurado; no simular correos enviados.
2. **Fotografías:** `backend/ejemplares.js` guarda archivos en `CRYAPP_UPLOAD_DIR` y `backend/server.js` los sirve desde la misma variable. Confirmar que el volumen Docker sea persistente y que Nginx envíe `/api/fotos/` al backend. Probar subida, lectura y reinicio.
3. **Registro/login:** `auth.js` requiere contraseña de 12 a 72 caracteres, crea el usuario y exige `activo=TRUE` al iniciar sesión. Verificar valor predeterminado de la columna `activo` en PostgreSQL y que la interfaz comunique la longitud mínima.
4. **Planes:** la interfaz permite acceso GRATIS a dashboard, perfil, ajustes y suscripciones; el backend bloquea módulos y ejemplares sin PRO/PREMIUM. Verificar que la base de datos tenga planes activos y suscripciones válidas. Comprobar que las rutas premium no puedan consultarse por API con cuentas PRO.
5. **Mensajería:** probar envío, recepción, conversación, borrado propio, contactos y límites de tamaño. Revisar privacidad de listados de usuarios y datos compartidos.
6. **Versiones:** web 2.8.0, health API 2.8.1; sincronizar tras validar lanzamiento.

## Pruebas de aceptación pendientes
- Crear cuenta nueva, iniciar sesión, cerrar sesión e iniciar de nuevo.
- Comprobar que un usuario GRATIS entra al dashboard pero no accede a módulos de pago por URL directa.
- Probar PRO y PREMIUM, incluidos endpoints API protegidos.
- Subir imagen JPG/PNG/WEBP de ejemplar, recargar y reiniciar contenedor: la foto debe persistir.
- Enviar mensajes entre dos cuentas distintas y verificar recepción en ambos lados.
- Probar JSON malformado y solicitudes excesivas en módulos: HTTP 400 y 413.
- Comprobar la recuperación real con correo de prueba una vez implementado SMTP.

## Seguridad y despliegue
No subir credenciales ni datos de usuarios. Trabajar con variables de entorno y base de datos de pruebas. Hacer respaldo verificable de PostgreSQL y del volumen de fotos antes de cualquier despliegue. Mantener `main` y producción intactos hasta aprobación.
