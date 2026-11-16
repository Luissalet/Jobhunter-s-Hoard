# JobHunter's Hoard

Organiza contextos, ofertas y candidaturas locales. El catálogo MCP y las rutas HTTP existentes conservan su comportamiento.

La copia completa de Node commons se sincroniza desde Hoard Hub. El puente MCP entrega la biblioteca local de skills mediante `skills_list`, `skill_read`, instrucciones de conexión y prompts `skill-<slug>`; no necesita consultar la biblioteca original para leer la copia.

`export_job_calendar` devuelve el snapshot completo de eventos y el ICS, incluso por encima del límite normal de respuesta. La marca interna `__uncapped` no se expone ni modifica el resultado original. Las herramientas ordinarias mantienen su límite. La exportación no modifica ofertas ni sincroniza calendarios externos.

`npm test` incluye una comprobación con cliente MCP real de 1.100 eventos y más de 500 KB. `npm run build` prepara la interfaz local.

`score_job_fit` guarda el encaje de una oferta requisito por requisito: peso de cada requisito en ese anuncio, de dónde sale el peso (cita literal, estructura o deducción del mercado), si el CV lo cumple con la cita que lo sostiene, y lo que falta. La puntuación la calcula la app con esos pesos; el modelo no escribe el número. Un peso deducido del mercado nunca es crítico ni alto, y un «obligatorio» sin su cita baja a estructural. El resultado incluye las carencias que bloquean con su riesgo en entrevista y su mitigación, y un plan de candidatura derivado de la puntuación. `get_job_fit` lo lee y `rank_jobs_by_fit` ordena las ofertas que ya lo tienen. La ficha de la oferta muestra la tabla por criterio, las carencias y el plan, y el botón «Analizar por criterio» usa el proveedor configurado en Ajustes.
