import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newResponseDraft, responsePayload, RESPONSE_KINDS} from '../client/src/employer-response.js';

test('one response draft retains its reference across retries; a new draft has its own reference', () => {
  const draft = {...newResponseDraft(), evidence: ' Mensaje recibido ', receivedAt: '2026-10-23T09:15:00Z', notes: 'Nota'};
  const first = responsePayload(draft, 'Europe/Madrid');
  const retry = responsePayload(draft, 'Europe/Madrid');
  assert.deepEqual(retry, first);
  assert.equal(first.externalId, draft.externalId);
  assert.equal(first.evidence, 'Mensaje recibido');
  assert.equal(first.receivedAt, '2026-10-23T09:15:00.000Z');
  assert.notEqual(newResponseDraft().externalId, draft.externalId);
  assert.equal('status' in first, false);
});

test('only a dated interview forwards interview time and visible zone; all native types remain available', () => {
  const draft = {...newResponseDraft(), evidence: 'Invitación', receivedAt: '2026-10-23T09:15:00Z',
    kind: 'interview', interviewAt: '2026-10-25T11:30:00Z'};
  const payload = responsePayload(draft, 'Europe/Madrid');
  assert.equal(payload.interviewAt, '2026-10-25T11:30:00.000Z');
  assert.equal(payload.timezone, 'Europe/Madrid');
  assert.equal('interviewAt' in responsePayload({...draft, kind: 'ack'}, 'Europe/Madrid'), false);
  assert.equal('timezone' in responsePayload({...draft, interviewAt: ''}, 'Europe/Madrid'), false);
  assert.deepEqual(RESPONSE_KINDS.map(([kind]) => kind), ['ack', 'info_request', 'rejection', 'interview', 'offer', 'unknown']);
});
