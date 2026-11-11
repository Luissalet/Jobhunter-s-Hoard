# JobHunter's Hoard

Organiza contextos, ofertas y candidaturas locales. El catálogo MCP y las rutas HTTP existentes conservan su comportamiento.

La copia completa de Node commons se sincroniza desde Hoard Hub. El puente MCP entrega la biblioteca local de skills mediante `skills_list`, `skill_read`, instrucciones de conexión y prompts `skill-<slug>`; no necesita consultar la biblioteca original para leer la copia.

`export_job_calendar` devuelve el snapshot completo de eventos y el ICS, incluso por encima del límite normal de respuesta. La marca interna `__uncapped` no se expone ni modifica el resultado original. Las herramientas ordinarias mantienen su límite. La exportación no modifica ofertas ni sincroniza calendarios externos.

`npm test` incluye una comprobación con cliente MCP real de 1.100 eventos y más de 500 KB. `npm run build` prepara la interfaz local.
