# Biblioteca de respuestas y respuestas de empresa

Referencia técnica de `server/answer-library.js`, `server/answer-recovery.js`
y de la herramienta/endpoint `record_employer_response`
(`server/applications.js`). Complementa a `README.md`; aquí se documentan
esquema, endpoints y reglas exactas.

## Esquema de una respuesta

Cada entrada de `context.answers[]` (validada por `answerSchema` en
`server/answer-library.js`):

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | string ≤100 | Asignado con `crypto.randomUUID()` al crear si falta. Estable: nunca se reasigna mientras la entrada exista. |
| `question` | string 1–2000 | Se guarda tal cual (recortada de espacios en los extremos). |
| `answer` | string ≤20000 | Puede quedar vacía (dato pendiente). |
| `source` | string ≤2000, opcional | Procedencia legible: nombre de fichero, "Borrador: <oferta>", etc. |
| `jobId` | string ≤100, opcional | Debe pertenecer al mismo contexto; si no, se rechaza. |
| `scope` | `"profile" \| "application"`, por defecto `"application"` | Ver "Ámbito y variantes". |
| `needsReview` | boolean | `true` si la respuesta llegó vacía o si ya existía otra respuesta distinta a la misma pregunta (variante). |
| `learnedAt` | string ISO | Fecha de alta; no cambia en ediciones posteriores. |
| `updatedAt` | string ISO | Se actualiza en cada edición (PATCH, fusión de PUT o recuperación). |
| `revision` | entero ≥0 | `0` al crear, `+1` en cada edición. Una respuesta migrada de antes de esta versión puede no tener `revision`: se trata como `0` al comparar. |

`context.answersRevision` (entero, ausente ⇒ `0`) crece en cada alta, edición,
borrado o recuperación de respuestas de ese contexto. Es un contador agregado
para que un cliente sepa que la lista cambió; no sustituye a `revision` por
respuesta, que es lo que protege una edición concurrente concreta.

`context.deletedAnswerIds` (array acotado a 5000 ids, FIFO) registra qué
respuestas se borraron de verdad, para que ninguna recuperación posterior
las resucite.

### Normalización para comparar (`key()`)

Dos respuestas se consideran la "misma pregunta" o la "misma respuesta" solo
si coinciden tras: NFKC → NFD sin marcas diacríticas (quita acentos) →
minúsculas → quitar `¿`, `?`, `*` → colapsar espacios → recortar extremos.
Esta normalización es **solo para comparar**: el texto guardado nunca se
altera, y dos preguntas distintas nunca se fusionan solo por parecerse — la
igualdad exige coincidencia exacta tras normalizar, no una comparación
aproximada.

## Ámbito y variantes: nunca se degrada el perfil

`rememberAnswer(contextId, entry)`:

1. Busca respuestas existentes con la misma pregunta normalizada.
2. Si alguna tiene también la misma respuesta normalizada, la reutiliza
   (`added: false`) sin tocar nada.
3. Si no, añade una entrada nueva (`added: true`). Si ya había alguna
   respuesta a esa pregunta con texto distinto, la nueva se marca
   `needsReview: true`: es una **variante**, nunca sustituye a la anterior.

Esto es válido tanto si la respuesta anterior era de `scope: "profile"` como
si no: una respuesta de candidatura ("Docker+Kubernetes: 0") jamás sobrescribe
ni borra una de perfil ("Docker: 2 años"); ambas quedan visibles como
entradas independientes. La única forma de que una respuesta desaparezca es
un borrado explícito (`DELETE`), nunca una fusión automática.

Límite: 2000 respuestas por contexto (`rememberAnswer` y la fusión de `PUT`
lo comprueban explícitamente, además del límite ya existente en
`contextSchema`).

## Endpoints HTTP

Todos bajo `server/workspace-routes.js`, mismo origen/host que el resto de la
aplicación (middleware de `server/index.js`).

| Método y ruta | Cuerpo | Respuesta |
| --- | --- | --- |
| `GET /api/contexts/:id/answers` | — | `{ answers, revision }` (`revision` = `context.answersRevision`) |
| `POST /api/contexts/:id/answers` | `{ entry }` (forma de `answerSchema`) | `201 { answer, added }` |
| `PATCH /api/contexts/:id/answers/:answerId` | `{ question?, answer?, scope?, needsReview?, source?, ifRevision? }` | `200 { answer }`, o `409 { conflict: true, current }` si `ifRevision` no coincide con la revisión actual |
| `DELETE /api/contexts/:id/answers/:answerId` | — | `204` sin cuerpo. Registra el id en `deletedAnswerIds`. |
| `POST /api/contexts/:id/answers/recover` | — (`?force=1` opcional) | Ver "Recuperación" |
| `POST /api/answers/recover` | — (`?force=1` opcional) | Igual, para todos los contextos |
| `POST /api/answers/recover-files` | `{ dir, contextId? }` | Ver "Recuperación desde ficheros" |

`ifRevision` ausente en el PATCH aplica el cambio sin comprobar nada (edición
directa tras releer la lista). `ifRevision` presente que no coincide con
`answer.revision` (tratando su ausencia como `0`) no aplica ningún cambio y
devuelve el valor actual para que quien llama decida qué hacer.

### `PUT /api/contexts/:id` ya no sobrescribe `answers` a ciegas

Si el cuerpo de la petición **no incluye** la clave `answers`, el contexto se
reemplaza igual que antes pero **sin tocar las respuestas existentes**. Si la
incluye, se fusiona por `id`:

- Una entrada del body con `id` que ya existe **edita** esa entrada in situ
  (revisión `+1`, `updatedAt` actual).
- Una entrada del body con `id` que no existe se añade tal cual (si no supera
  el límite de 2000).
- Una entrada del body con `id` que está en `deletedAnswerIds` se descarta:
  nunca resucita una respuesta borrada, ni siquiera desde un `PUT` con una
  copia obsoleta que aún la traía.
- Una entrada del body **sin** `id` se añade con la misma deduplicación que
  `remember_answer` (por pregunta+respuesta normalizadas).
- Cualquier respuesta existente **cuyo id no aparece** en el body se
  conserva sin cambios. El borrado real solo ocurre por
  `DELETE /answers/:answerId`.

## Recuperación con backup y sin resurrección

`recoverHistoricalAnswers({ contextId?, force })` (usada por los tres
endpoints anteriores):

1. **Antes de cambiar nada**, hace una copia real del fichero
   `data/db.json` (no del objeto en memoria) con
   `store.backupNow()`: fuerza un `save()` para que el fichero refleje el
   estado ya persistido y lo copia a
   `data/db.json.bak-<timestamp>` (timestamp sin `:` para ser válido en
   Windows). La ruta se devuelve en `backup`.
2. Recorre los contextos indicados (uno concreto o todos), y dentro de cada
   uno, sus candidaturas y los `draft.answers` / `draft.missing` ya
   guardados en cada una.
3. Genera un id **determinista** (hash de contexto+pregunta+respuesta
   normalizadas) para cada candidato, en vez de uno aleatorio. Esto permite
   distinguir, en una segunda pasada, "esto ya se añadió y sigue igual"
   (se salta por duplicado) de "esto se añadió y el usuario lo borró aposta"
   (se salta por `deletedAnswerIds`, sin volver a añadirlo).
4. Un contexto ya marcado con `answersRecoveredAt` no se vuelve a escanear a
   menos que se pida `force=1`; con `force=1` sí se recorre de nuevo, pero la
   deduplicación por clave y por id borrado hace que una segunda pasada no
   añada nada nuevo (`added: 0`) si no hay borradores nuevos desde la
   primera.
5. Devuelve exactamente
   `{ contexts, jobsScanned, draftsScanned, added, skippedDuplicates, skippedDeleted, backup }`.

No se ejecuta nunca automáticamente al arrancar el servidor ni al instalar
las rutas: solo bajo demanda explícita (botón "Recuperar de borradores" en la
UI, o llamando a los endpoints).

## Recuperación desde ficheros privados

`server/answer-recovery.js::extractFromFiles(dir)`, usada por
`POST /api/answers/recover-files`:

- Solo lee texto con `fs.readFileSync` de un directorio **absoluto** que
  indica el usuario (validado: ruta absoluta, sin segmentos `..`, debe
  existir). Nunca recorre subcarpetas ni sale del directorio indicado.
- Ficheros `*-attempt.json` y `*-result*.json`: se intenta `JSON.parse` y se
  recorre el resultado buscando pares pregunta/respuesta bajo las claves
  habituales `question`/`answer`, `label`/`value`, dentro de arrays anidados
  como `questions`, `answers`, `fields`, `items`, `responses`.
- Ficheros `prepare-*.mjs`: **nunca** `import()` ni `eval()`. Se buscan por
  regex literales de tipo `{ question: "...", answer: "..." }` o
  `{ label: "...", value: "..." }` (comillas simples, dobles o backtick, en
  cualquier orden de claves), con un desescapado mínimo de `\n`, `\t`, `\\`,
  comillas y backtick.
- Un fichero que no da ningún candidato (JSON inválido, o ninguna literal
  reconocible en un `.mjs`) se añade a `unparsed` con su nombre: el informe
  nunca promete haber recuperado lo que no pudo leerse.
- El endpoint añade cada candidato con `rememberAnswer(scope: "application",
  source: "<nombre de fichero>", needsReview: true)`, así que sigue la misma
  deduplicación por pregunta+respuesta que el resto de la biblioteca.
- Devuelve `{ filesScanned, candidates, added, skipped, unparsed }`.

Fixtures de prueba (inventadas, sin datos personales) en
`tests/fixtures/recovery/`.

## `record_employer_response`

Herramienta MCP (`server/agent-tools.js`) y endpoint REST equivalente
`POST /api/jobs/:id/responses` (`server/workspace-routes.js`), implementados
en `applications.js::recordEmployerResponse`.

### Contrato

```
record_employer_response({
  jobId,
  externalId,      // string, 1–300
  kind,            // "ack" | "info_request" | "rejection" | "interview" | "offer" | "unknown"
  evidence,        // string, 1–10000
  receivedAt,      // datetime ISO
  interviewAt?,    // datetime ISO
  timezone?,       // IANA, ≤64
  calendarEventId?,// ≤200
  notes?,
})
→ { job, applied: boolean, reason?: string, response }
```

### Idempotencia por `externalId`

Cada mensaje de empresa se guarda en `job.responses[]` con
`{ id, externalId, kind, evidence, receivedAt, interviewAt, timezone, calendarEventId, notes, recordedAt }`.
Repetir el mismo `externalId`:

- Sin cambios de por medio → `applied: false, reason: "already recorded"`,
  no se modifica nada.
- Si la llamada repetida trae `calendarEventId` y la entrada guardada no
  tenía uno (la ejecución anterior se cortó justo después de guardar la
  respuesta pero antes de anotar el evento de calendario) → se guarda
  **solo** ese campo, `applied: true, reason: "calendar event linked"`. El
  resto de la llamada repetida (kind, evidence, etc.) se ignora.

### Transiciones de estado

| `kind` | Efecto |
| --- | --- |
| `ack` | Nunca cambia `status`. Un acuse de recibo no es una aceptación ni una entrevista. |
| `info_request` | Pasa a `answered` **solo si** el estado actual es `applied`. En cualquier otro estado, no hace nada. |
| `rejection` | Pasa a `rejected`. |
| `interview` | Pasa a `interview`; `job.interviewAt` se actualiza **solo si** la llamada trae `interviewAt` (nunca se inventa una fecha). |
| `offer` | Pasa a `offer`. |
| `unknown` | No cambia nada. |

**Estados terminales** (`offer`, `rejected`, `discarded`) se preservan: una
respuesta posterior con `kind` `interview`/`offer`/`rejection` solo los
cambia si su `receivedAt` es **posterior** al momento real de la última
transición registrada en `job.history`. Cuando eso ocurre, el `response`
guarda en sus `notes` el texto `overrode terminal state <estado anterior>`.
Un `ack` posterior a esa reversión sigue sin cambiar nada, como siempre.

`job.history` recibe la transición a través del mismo `store.updateJob` que
ya la registra para cualquier otro cambio de estado; no hay una ruta
paralela de historial para las respuestas de empresa.

`application.attempts` (y la evidencia de cada intento de envío) nunca se
toca desde aquí: son dos historiales distintos — el de lo que hizo el
asistente al enviar, y el de lo que respondió la empresa después.

### Anotaciones MCP e instrucciones

La herramienta se registra con `idempotentHint: true` y `readOnlyHint:
false`. `AGENT_INSTRUCTIONS` incluye: «Las respuestas de empresa se
registran con record_employer_response con el id del mensaje; un acuse de
recibo no es aceptación ni entrevista.»

### En la interfaz

La pestaña **Actividad** de una candidatura lista `job.responses` en solo
lectura: tipo, fecha y evidencia recortada a 280 caracteres, más la fecha de
entrevista cuando la trae. No hay edición manual de respuestas de empresa
desde la UI: se registran por MCP o por el endpoint REST.
