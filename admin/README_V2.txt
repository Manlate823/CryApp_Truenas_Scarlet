CryApp Admin PRO V2.0 — instalación segura

1. RESPALDO: guardar copia del directorio actual y la base de datos antes de reemplazar archivos.
2. Extraer este ZIP en carpeta temporal y revisar diferencias. NO sobrescribir .env; este paquete NO incluye credenciales.
3. Copiar los archivos actualizados al directorio CryApp_Admin.
4. En TrueNAS: cd /mnt/Almacenamiento_HDD/BaseDatos/CryApp_Admin
5. Reconstruir: sudo docker compose --env-file .env up -d --build --force-recreate
6. IMPORTANTE: crear propietario ANTES de intentar entrar. El script vincula el propietario al superadmin existente para conservar referencias de auditoría y NO cambia las cuentas normales de CryApp.
7. Ejecutar desde la terminal de TrueNAS:
   read -rsp 'Nueva clave del propietario: ' ADMINPASS; echo
   printf '%s\n' "$ADMINPASS" | sudo docker exec -i cryapp_admin-cryapp-admin-1 node setup-owner.js
   unset ADMINPASS
   Nota: se recomienda usar una contraseña NUEVA y distinta de la compartida por chat.
8. Abrir https://admin-cryapp.jellyfinplux.uk y entrar con manlate823@gmail.com y la contraseña recién configurada.
9. Activar Cloudflare Access con política restrictiva antes de manejar pagos reales.
10. El compose agrega la red ix-cloudflared_default permanentemente; verificar que exista.

El acceso administrativo usa la tabla cryapp_admin_owner y no altera la contraseña de la cuenta normal. Las tablas originales y los pagos permanecen.
