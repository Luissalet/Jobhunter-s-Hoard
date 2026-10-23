export const RESPONSE_KINDS = [
  ['ack', 'Acuse de recibo'], ['info_request', 'Petición de información'],
  ['rejection', 'Rechazo'], ['interview', 'Entrevista'], ['offer', 'Oferta'], ['unknown', 'Sin clasificar'],
];

export function newResponseDraft() {
  return {externalId: `manual:${crypto.randomUUID()}`, kind: 'ack', evidence: '', receivedAt: '', interviewAt: '', notes: ''};
}

/** datetime-local inputs use the computer's displayed time zone; native code owns status changes. */
export function responsePayload(draft, timezone) {
  return {externalId: draft.externalId.trim(), kind: draft.kind, evidence: draft.evidence.trim(),
    receivedAt: new Date(draft.receivedAt).toISOString(), notes: draft.notes,
    ...(draft.kind === 'interview' && draft.interviewAt ? {interviewAt: new Date(draft.interviewAt).toISOString(), timezone} : {})};
}
