# Jubhunter's Hoard

Espacio local para buscar empleo con un asistente: perfil reutilizable, contextos de búsqueda, documentos enlazados, preparación de candidaturas y registro de resultados por MCP.

## Abrir

Necesita Node.js 22.13 o posterior. En Windows, abre **Iniciar Jubhunter's Hoard.cmd**. También puedes ejecutar:

```sh
npm install
npm run build
npm start
```

La aplicación está en `http://127.0.0.1:5178`. Para desarrollo, `npm run dev` inicia también Vite (puerto 5173, o 5174 si está ocupado).

## Preparar tu espacio

1. En **Mi contexto → Perfil personal**, revisa datos de contacto, LinkedIn, portfolio, disponibilidad, permiso de trabajo y trayectoria. Estos datos son comunes a tus búsquedas.
2. En **Lo que busco**, configura puestos, ubicaciones, remoto/híbrido/presencial, movilidad, salario mínimo y objetivo, empresas excluidas y otras prioridades.
3. En **Instrucciones**, define cómo evaluar ofertas y redactar. **Nuevo contexto** permite separar distintas búsquedas. Cada candidatura conserva su contexto original aunque cambies el selector.
4. En **Fuentes**, usa **Elegir carpeta** o **Elegir archivo** para abrir el selector de Windows; el nombre se completa al seleccionar. También puedes pegar una ruta, escribir notas o enlazar páginas web. Las fuentes de una búsqueda no se consultan desde otra. La IA solo lee; no puede modificar los originales.
5. En **Respuestas**, guarda respuestas verificadas a preguntas repetidas. Lo desconocido queda pendiente; no se inventa. Cada respuesta muestra su ámbito (perfil o candidatura), procedencia, oferta de origen y fecha; las variantes de una misma pregunta se agrupan en un desplegable sin perder ninguna. El filtro **Solo pendientes** y **Recuperar de borradores** (con informe y copia de seguridad) ayudan a poner la biblioteca al día. Detalle completo en [`docs/ANSWER-LIBRARY.md`](docs/ANSWER-LIBRARY.md).

Los archivos PDF con texto, DOCX, Markdown, texto, CSV/TSV y archivos de código admitidos se leen en su versión actual. Una carpeta se consulta bajo demanda. El sistema excluye archivos ocultos, directorios de dependencias y nombres habituales de credenciales. No sigue enlaces que escapen de una carpeta autorizada. Estas exclusiones no sustituyen elegir cuidadosamente qué carpeta enlazar.

Un enlace web es una referencia: puedes pegar su texto, pero guardarlo **no descarga la página ni inicia sesión en LinkedIn**. Los PDF escaneados necesitan una transcripción; no hay OCR.

## Conectar una IA con navegador

En **Conectar IA**, copia la configuración de MCP a un cliente compatible con servidores locales por stdio. Incluye rutas absolutas a Node, al adaptador y al archivo de token. Mantén Jubhunter's Hoard abierto durante las sesiones.

El cliente aporta el modelo y el navegador; Jubhunter's Hoard aporta el contexto y el registro. No necesitas configurar una segunda clave de IA para utilizar MCP. Los botones internos de análisis, generación, entrevista y seguimiento sí usan el proveedor opcional de **Ajustes**.

La implementación utiliza el [SDK oficial de MCP](https://ts.sdk.modelcontextprotocol.io/server). El adaptador stdio envía las peticiones al servidor local autenticado. Solo el proceso HTTP escribe la base de datos: varios asistentes no mantienen copias independientes ni sobrescriben el registro entre sí. Se rechazan peticiones HTTP desde otras webs y el servidor escucha únicamente en `127.0.0.1`.

Herramientas disponibles:

| Herramienta | Uso |
| --- | --- |
| `list_contexts`, `get_context` | Elegir una búsqueda y obtener instrucciones, perfil, preferencias y referencias. |
| `list_sources`, `list_source_files` | Descubrir fuentes y archivos enlazados. |
| `read_source`, `search_context` | Leer PDF/Word/texto o buscar evidencias dentro del contexto. |
| `list_jobs` | Consultar candidaturas por contexto, estado o búsqueda, con paginación. |
| `capture_job` | Registrar una oferta leída en el navegador; deduplicar URLs. |
| `update_job_facts` | Guardar condiciones verificadas, descripción, notas y próxima acción. |
| `remember_answer` | Guardar una pregunta y su respuesta (o dejarla pendiente) sin sobrescribir variantes existentes. |
| `get_application` | Obtener el dossier específico y las condiciones pendientes. |
| `save_application_draft` | Guardar CV, carta, respuestas, referencias y datos que faltan. |
| `start_application` | Reservar un intento y comprobar condiciones, revisión y límite diario. |
| `record_application_result` | Registrar confirmación visible, bloqueo o resultado incierto. |
| `record_employer_response` | Registrar un mensaje de la empresa (acuse, petición de información, rechazo, entrevista u oferta) por su id, de forma idempotente. |

Son 15 herramientas en total. `GET /api/agent/config` y `list_tools` del propio cliente MCP siempre reflejan el recuento real.

Las herramientas no exponen claves de proveedores ni permiten cambiar instrucciones, preferencias o fuentes permanentes. Esas decisiones se editan en la interfaz. Los documentos y las ofertas se identifican como datos de referencia, separados de las instrucciones del usuario.

### Flujo de candidatura

El asistente lee la oferta con su navegador, la registra, consulta las fuentes pertinentes y guarda los documentos y respuestas. En modo **Revisar antes de enviar**, debes aprobar el borrador en la ficha. En **Avanzar automáticamente**, puede iniciar intentos que cumplan las condiciones configuradas y no tengan datos pendientes.

Los controles automáticos comprueban modalidad, traslado, mínimo salarial anual comparable, exclusiones de empresas, datos básicos, borrador y límite diario. Los criterios de texto libre —puesto, ubicación, otras preferencias e instrucciones— requieren valoración de la IA. El modo automático no es un planificador autónomo: necesita que un cliente MCP esté trabajando y no sustituye los permisos de ese cliente.

Antes de rellenar/enviar, `start_application` devuelve un identificador de intento. Un intento en curso o incierto bloquea otro envío, incluso después de reiniciar. Para resolverlo, el asistente debe comprobar el portal y registrar qué ocurrió. Una confirmación observada marca **Aplicada** y programa seguimiento a diez días; un bloqueo o incertidumbre no lo hace. La confirmación es evidencia declarada por el asistente, no una verificación independiente del portal.

Jubhunter's Hoard no abre sesiones, supera CAPTCHAs, acepta acuerdos ni ejecuta clics por sí mismo. No se han enviado candidaturas reales durante el desarrollo.

## Organizar candidaturas y reutilizar textos

- En **Candidaturas**, combina búsqueda con los filtros exactos de **Estado** y **Modalidad**. **Ordenar por** permite ordenar por actualización, fecha de envío, modalidad o estado. La fecha sigue visible en móvil; **Sin fecha** indica que no está registrada. Cambia un estado desde su fila o marca varias candidaturas y usa **Aplicar a seleccionadas**. **Seleccionar visibles** afecta a la vista filtrada; cambiar filtros, búsqueda o contexto limpia la selección.
- Abre una candidatura y usa **Oferta → Editar datos** para corregir sus datos y completar la fecha real de envío. Confirma con **Guardar datos**; deja la fecha vacía si no la conoces.
- En **Seguimiento → Sin próxima acción**, programa la próxima revisión de candidaturas enviadas, con respuesta o en entrevista que aún no tienen revisión ni entrevista futura. Puedes elegir una fecha o **Revisar mañana**, aunque falte la fecha de envío. **Redactar mensaje** prepara un borrador; no lo envía.
- **Resultados** incluye rechazos entre las respuestas y conserva hitos de entrevista y oferta registrados en el historial. Compara estado actual, modalidad, actividad de ocho semanas y fuente. Los envíos sin fecha cuentan en los totales, pero no en la actividad semanal.
- En la ficha de una candidatura, la pestaña **Actividad** lista también las respuestas de la empresa (acuse, petición de información, rechazo, entrevista u oferta) que el asistente registró con `record_employer_response`, con su fecha y evidencia recortada. Un acuse de recibo nunca cambia el estado ni equivale a una entrevista.
- En **Mi contexto → Respuestas**, busca por pregunta o respuesta, copia un texto o edítalo. **Terminar edición** cierra la fila; **Guardar cambios** guarda tus modificaciones.
- En **Mi contexto → Cartas**, crea o selecciona una carta, edita su nombre, idioma español/inglés y texto base. Puedes incluir `{{puesto}}` y `{{empresa}}`. **Puesto** y **Empresa** cambian solo la vista previa; **Copiar carta preparada** copia el resultado cuando las variables están completas. **Guardar cambios** guarda las plantillas de ese contexto, incluidas altas, ediciones y eliminaciones.

## Traer tu Google Sheet

En **Candidaturas → Importar hoja**, pega las celdas con cabeceras o carga CSV/TSV. Se reconocen `LINK`, `EMPRESA`, `PUESTO`, `TIPO`, `ESTADO`, ubicación, notas y fecha de envío. Primero se muestra una vista previa con duplicados y estados no reconocidos. Las fechas históricas ausentes se mantienen desconocidas, sin contarlas como envíos de hoy. Se admiten hasta 2.000 filas por importación. No hay sincronización continua con Google Sheets.

La exportación CSV incluye modalidad y contexto; neutraliza fórmulas procedentes de texto importado. La copia JSON incluye el registro completo, ajustes, perfil y contextos. No incluye los archivos originales de las carpetas enlazadas ni la credencial del puente MCP.

## Datos y límites

- `data/db.json`: candidaturas, contextos, respuestas y ajustes. Escritura atómica antes de confirmar la operación.
- `data/profile.md`: trayectoria común. Se conserva el perfil preexistente al migrar.
- `data/mcp-token`: credencial local creada al iniciar; no se publica ni se incluye en backups.
- Datos locales en disco, sin cifrado propio. Un proveedor de IA externo recibe el dossier al usar sus botones; el asistente externo recibe los datos que consulta por MCP.
- Lectura: máximo 8 MB por archivo y 80 páginas por PDF; respuestas paginadas de hasta 20.000 caracteres. La búsqueda examina hasta 60 archivos, 20.000 caracteres por archivo, y comunica cobertura parcial y errores. Los listados de carpetas tienen límites de profundidad y recorrido.
- El dossier incluye fragmentos de fuentes directas con un presupuesto de 20.000 caracteres; las carpetas quedan bajo demanda. Los errores y recortes son explícitos.
- El límite de intentos diarios se cuenta por contexto y fecha UTC. Cambiar datos personales, instrucciones, fuentes o condiciones invalida aprobaciones pendientes.
- Una base de datos ilegible detiene el arranque en lugar de reemplazar el registro por uno vacío.

Variables opcionales: `PORT`, `JOBHUNT_DATA_DIR`; adaptador MCP: `JOBHUNT_URL`, `JOBHUNT_TOKEN_FILE` o `JOBHUNT_TOKEN`. `JOBHUNT_URL` debe ser local.

`GET /api/health` responde `{service, version, dataDirConfigured}` sin autenticación ni datos personales, para que un supervisor externo distinga la aplicación apagada de un adaptador roto.

## Verificación

```sh
npm test
npm run build
npm audit
```

Las pruebas usan directorios temporales: aislamiento entre contextos, rutas y enlaces, lectura actual de PDF/DOCX, deduplicación, estados de candidatura, importación de hojas, persistencia y comunicación con un cliente del SDK MCP. `node scripts/ui-fixture.mjs` abre una instancia de demostración aislada en el puerto 19579 con datos ficticios; no toca tu registro.

Diseño y decisiones: `PRODUCT.md`, `DESIGN.md` y `.impeccable/direction.md`.
