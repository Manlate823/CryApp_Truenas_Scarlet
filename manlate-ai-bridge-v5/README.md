# Manlate AI Bridge V5

Estado: desarrollo. No instalar en producción todavía.

Objetivo: conectar ChatGPT, GitHub y TrueNAS para trabajar por instrucciones en lenguaje natural, con memoria persistente, respaldos y operaciones verificables.

La carpeta referencia-v4 contiene los archivos facilitados por el propietario. No contiene el archivo de secreto OAuth. V4 publica solo herramientas de lectura; sus módulos de edición existen pero no están registrados en tools/list. El manejador consultar_hash_cryapp utiliza argumentos sin inicializar.

Pendiente: diseñar e implementar servidor V5, autenticación y permisos, integración GitHub, memoria persistente, respaldos, instalador, pruebas, conexión ChatGPT y validación en TrueNAS. El acceso de Docker al host no equivale por sí solo a acceso a la shell del host. La compatibilidad real OAuth y el dominio de V5 deben verificarse en el entorno del usuario antes de instalar.
