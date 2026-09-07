// Adaptador LLM: OpenAI-compatible (Mistral/Groq/OpenRouter — gratis en España), Gemini y Ollama. Sin SDKs, solo fetch.
import { getSettings } from './store.js';
import { CONTEXT_RULES } from './context.js';

const GEMINI_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

async function callGemini(prompt, { temperature = 0.4 } = {}) {
  const { geminiKey, geminiModel } = getSettings();
  if (!geminiKey) throw new Error('Falta la API key de Gemini. Ojo: su free tier no funciona en España/UE — usa Mistral o Groq en Ajustes.');
  const models = [geminiModel, ...GEMINI_FALLBACKS.filter((m) => m !== geminiModel)];
  let lastErr = null;
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature, responseMimeType: 'application/json' },
          }),
          signal: AbortSignal.timeout(90_000),
        }
      );
      if (res.status === 404) { lastErr = new Error(`Modelo ${model} no disponible`); continue; }
      if (res.status === 429) {
        const err = new Error('Límite de peticiones de Gemini alcanzado (free tier). Espera un minuto y reintenta.');
        err.rateLimited = true;
        throw err;
      }
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
      if (!text) throw new Error('Gemini devolvió una respuesta vacía.');
      return text;
    } catch (e) {
      if (e.message.includes('no disponible')) { lastErr = e; continue; }
      throw e;
    }
  }
  throw lastErr || new Error('Ningún modelo de Gemini disponible.');
}

async function callOllama(prompt, { temperature = 0.4 } = {}) {
  const { ollamaUrl, ollamaModel } = getSettings();
  const res = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ollamaModel,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      format: 'json',
      options: { temperature },
    }),
    signal: AbortSignal.timeout(300_000),
  }).catch((e) => {
    throw new Error(`No se pudo conectar con Ollama en ${ollamaUrl}. ¿Está arrancado? (${e.message})`);
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data?.message?.content || '';
}

function parseJson(text) {
  // tolerante con fences y texto alrededor
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('El LLM no devolvió JSON válido.');
  }
}

// Proveedores compatibles con la API de OpenAI: Mistral (gratis, UE), Groq (gratis),
// OpenRouter, o cualquier endpoint /chat/completions personalizado.
async function callOpenAICompat(prompt, { temperature = 0.4, jsonMode = true } = {}) {
  const { oaiBaseUrl, oaiKey, oaiModel } = getSettings();
  if (!oaiKey) {
    throw new Error('Falta la API key. En Ajustes elige proveedor (Mistral y Groq son gratis y funcionan en España) y pega tu key.');
  }
  const body = {
    model: oaiModel,
    messages: [{ role: 'user', content: prompt }],
    temperature,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const res = await fetch(`${(oaiBaseUrl || '').replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${oaiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (res.status === 429) {
    const err = new Error('Límite de peticiones alcanzado (free tier). Espera un momento y reintenta.');
    err.rateLimited = true;
    throw err;
  }
  // Algunos modelos no soportan response_format → reintenta sin él
  if (res.status === 400 && jsonMode) {
    return callOpenAICompat(prompt, { temperature, jsonMode: false });
  }
  if (res.status === 401) throw new Error('API key inválida o caducada. Revisa Ajustes.');
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('El LLM devolvió una respuesta vacía.');
  return text;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CALLERS = { gemini: callGemini, ollama: callOllama, openai: callOpenAICompat };

export async function llmJson(prompt, opts = {}) {
  const { provider } = getSettings();
  const call = CALLERS[provider] || callOpenAICompat;
  try {
    return parseJson(await call(prompt, opts));
  } catch (e) {
    // Retry único ante rate limit: espera 25s (los límites free suelen ser por minuto)
    if (e.rateLimited) {
      await sleep(25_000);
      return parseJson(await call(prompt, opts));
    }
    throw e;
  }
}

// ---------- Prompts ----------

export function extractPrompt(rawText, sourceUrl) {
  return `${CONTEXT_RULES}
Eres un parser de ofertas de empleo. A partir del texto siguiente (puede venir de una web con ruido de navegación), extrae la oferta.

Devuelve SOLO un JSON con estas claves:
{
  "title": "puesto",
  "company": "empresa (o '' si no aparece)",
  "location": "ciudad/país o 'Remote'",
  "remote": true | false | null,
  "salary": "rango salarial como texto, o ''",
  "lang": "código ISO del idioma de la oferta, ej 'es' o 'en'",
  "tags": ["skills", "tecnologías", "máx 12"],
  "applyUrl": "URL de aplicación si aparece explícita, si no ''",
  "description": "la oferta limpia en markdown (responsabilidades, requisitos, beneficios). Máx ~600 palabras. Sin menús ni cookies ni ruido."
}

URL de origen: ${sourceUrl || 'n/a'}

TEXTO:
${rawText.slice(0, 28000)}`;
}

export function scorePrompt(profileMd, job) {
  return `${CONTEXT_RULES}
Eres un asesor de carrera crítico y realista. Evalúa el encaje entre este candidato y esta oferta.

PERFIL DEL CANDIDATO (markdown):
${profileMd}

OFERTA:
Puesto: ${job.title}
Empresa: ${job.company}
Ubicación: ${job.location} ${job.remote ? '(remoto)' : ''}
Descripción:
${(job.description || '').slice(0, 12000)}

Devuelve SOLO JSON:
{
  "score": 0-100 (encaje real, sé exigente: 80+ solo si cumple casi todos los requisitos),
  "verdict": "una frase en español resumiendo el encaje",
  "strengths": ["3-5 puntos fuertes concretos del candidato PARA ESTA oferta"],
  "gaps": ["carencias o riesgos concretos frente a los requisitos"],
  "keywords": ["palabras clave ATS de la oferta que el CV adaptado debería incluir"]
}`;
}

export function tailorPrompt(profileMd, job, personal, lang) {
  const langName = lang === 'es' ? 'español' : lang === 'en' ? 'inglés' : lang;
  return `${CONTEXT_RULES}
Eres un experto en redacción de CVs y cartas de presentación que pasan filtros ATS.

PERFIL COMPLETO DEL CANDIDATO (fuente de verdad, NO inventes nada que no esté aquí):
${profileMd}

DATOS DE CONTACTO:
Nombre: ${personal.name} · Email: ${personal.email} · Tel: ${personal.phone || 'n/a'} · Ubicación: ${personal.location}
GitHub: ${personal.github} · Portfolio: ${personal.portfolio} ${personal.linkedin ? '· LinkedIn: ' + personal.linkedin : ''}

OFERTA OBJETIVO:
Puesto: ${job.title} · Empresa: ${job.company} · Ubicación: ${job.location}
${job.scoreDetails?.keywords?.length ? 'Keywords ATS detectadas: ' + job.scoreDetails.keywords.join(', ') : ''}
Descripción:
${(job.description || '').slice(0, 10000)}

TAREA: genera un CV adaptado y una carta de presentación, ambos en ${langName}.

Reglas del CV:
- NUNCA inventes experiencia, títulos ni fechas. Solo reordena, selecciona y reformula el perfil.
- Prioriza y expande lo relevante para ESTA oferta; comprime o elimina lo irrelevante.
- Integra las keywords de la oferta de forma veraz y natural.
- Verbos de acción + métricas cuando existan en el perfil.
- Estructura markdown: "# Nombre" seguido de línea de contacto, luego "## Resumen" (3-4 líneas orientadas a la oferta), "## Experiencia", "## Proyectos destacados" (solo los relevantes), "## Educación", "## Skills" (agrupadas).
- Longitud objetivo: 1 página A4 (~450-550 palabras).

Reglas de la carta:
- 180-250 palabras, específica para ${job.company} y el puesto, sin plantilla genérica.
- Tono profesional cercano, un gancho concreto del perfil que conecte con lo que piden, cierre con disponibilidad.
- Formato markdown simple (párrafos, sin encabezados).

Devuelve SOLO JSON: { "cvMarkdown": "...", "letterMarkdown": "..." }`;
}

export function followupPrompt(profileMd, job, personal, lang) {
  const langName = lang === 'es' ? 'español' : 'inglés';
  const applied = job.appliedAt ? new Date(job.appliedAt).toLocaleDateString('es-ES') : 'hace unos días';
  return `${CONTEXT_RULES}
Redacta un email de follow-up breve y profesional en ${langName} para una candidatura sin respuesta.

Contexto:
- Candidato: ${personal.name} (${personal.email})
- Puesto: ${job.title} en ${job.company}
- Fecha de aplicación: ${applied}
- Resumen del perfil (para reforzar 1 punto de valor, máx 1 frase): ${profileMd}

Reglas: 90-130 palabras, tono cordial y directo, reitera interés, aporta UN dato de valor del perfil relevante al puesto, pregunta por el estado del proceso, sin sonar desesperado ni genérico.

Devuelve SOLO JSON: { "subject": "asunto del email", "body": "cuerpo en texto plano con saltos de línea" }`;
}

export function prepPrompt(profileMd, job, lang) {
  const langName = lang === 'es' ? 'español' : 'inglés';
  return `${CONTEXT_RULES}
Eres un coach de entrevistas técnicas. Prepara al candidato para la entrevista de esta oferta.

PERFIL DEL CANDIDATO:
${profileMd}

OFERTA:
Puesto: ${job.title} · Empresa: ${job.company}
${(job.description || '').slice(0, 10000)}

Genera en ${langName}:
1. Preguntas probables de la entrevista (mezcla técnicas y de comportamiento, específicas de ESTA oferta) con una respuesta sugerida basada SOLO en el perfil real del candidato (método STAR cuando aplique, concisa, 3-5 frases).
2. Las 2-3 preguntas más incómodas dado el perfil (huecos, cambios, tecnologías que no domina) y cómo manejarlas con honestidad.
3. Preguntas inteligentes para hacer al entrevistador, específicas de la empresa/puesto.

Devuelve SOLO JSON:
{
  "questions": [{ "q": "pregunta", "a": "respuesta sugerida" }],  // 6-8
  "tough": [{ "q": "pregunta incómoda", "a": "cómo manejarla" }], // 2-3
  "forInterviewer": ["pregunta 1", "pregunta 2", "pregunta 3"],
  "tips": ["2-3 consejos específicos para esta entrevista"]
}`;
}


