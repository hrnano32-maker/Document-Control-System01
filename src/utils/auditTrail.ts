import type { AuditLogEntry } from '../types';

// Server maintenance events do not all describe a document. Preserve them in
// the timeline without inferring a document number, a person or a revision.
export type AuditTrailRow = Omit<AuditLogEntry, 'actionType' | 'actorDept'> & {
  actionType: string;
  actorDept: string;
};

const textField = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

function timestampText(value: unknown): string {
  if (value == null) return '';
  let date: Date;
  if (typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number') {
    const nanos = 'nanoseconds' in value && typeof value.nanoseconds === 'number' ? value.nanoseconds : 0;
    date = new Date(value.seconds * 1000 + nanos / 1e6);
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string' || typeof value === 'number') {
    date = new Date(value);
  } else return '';
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

export function readAuditEntry(id: string, data: Record<string, unknown>): AuditTrailRow {
  const uid = textField(data.actorUid);
  return {
    id,
    timestamp: timestampText(data.timestamp) || timestampText(data.createdAt),
    actor: textField(data.actor) || (uid ? `UID: ${uid}` : ''),
    actorDept: textField(data.actorDept),
    actionType: textField(data.actionType),
    docNo: textField(data.docNo),
    revision: textField(data.revision),
    description: textField(data.description),
    details: data.details && typeof data.details === 'object' ? data.details as Record<string, unknown> : undefined,
    ipAddress: textField(data.ipAddress),
  };
}
