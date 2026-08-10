export const STATE_BACKUP_FORMAT = "uchit-state-backup/v1" as const;

export type StateBackupEnvelope = {
  format: typeof STATE_BACKUP_FORMAT;
  createdAt: string;
  sourceEnvironment: "local" | "staging";
  stateRevision: number;
  stateSha256: string;
  state: Record<string, unknown>;
  exclusions: { r2Bytes: true; secrets: true };
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonicalize(entry)]));
  return value;
}

export function canonicalStateJson(state: Record<string, unknown>) {
  return JSON.stringify(canonicalize(state));
}

export async function sha256Text(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validateNoProtectedMaterial(value: unknown, path = "state") {
  if (typeof value === "string" && (/^data:/i.test(value) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value))) throw new Error(`${path} contains embedded bytes or secret material.`);
  if (Array.isArray(value)) return value.forEach((entry, index) => validateNoProtectedMaterial(entry, `${path}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (/^(?:secret|password|apiKey|privateKey|accessToken)$/i.test(key)) throw new Error(`${path}.${key} is a secret-bearing field.`);
    validateNoProtectedMaterial(entry, `${path}.${key}`);
  }
}

export function validateBackupState(state: unknown): asserts state is Record<string, unknown> {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("Backup state must be an object.");
  for (const key of ["clients", "vastuCases", "reportVersions", "timelineEvents"]) if (!Array.isArray((state as Record<string, unknown>)[key])) throw new Error(`Backup state is missing required collection: ${key}.`);
  validateNoProtectedMaterial(state);
}

export async function createStateBackup(state: Record<string, unknown>, stateRevision: number, sourceEnvironment: "local" | "staging", createdAt = new Date().toISOString()): Promise<StateBackupEnvelope> {
  validateBackupState(state);
  if (!Number.isSafeInteger(stateRevision) || stateRevision < 0) throw new Error("State revision must be a safe non-negative integer.");
  return { format: STATE_BACKUP_FORMAT, createdAt, sourceEnvironment, stateRevision, stateSha256: await sha256Text(canonicalStateJson(state)), state: structuredClone(state), exclusions: { r2Bytes: true, secrets: true } };
}

export async function validateStateBackup(value: unknown): Promise<StateBackupEnvelope> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Backup envelope must be an object.");
  const backup = value as StateBackupEnvelope;
  if (backup.format !== STATE_BACKUP_FORMAT || !["local", "staging"].includes(backup.sourceEnvironment)) throw new Error("Unsupported backup format or environment.");
  if (!Number.isSafeInteger(backup.stateRevision) || backup.stateRevision < 0 || !/^\d{4}-\d{2}-\d{2}T/.test(backup.createdAt)) throw new Error("Backup metadata is invalid.");
  validateBackupState(backup.state);
  const actual = await sha256Text(canonicalStateJson(backup.state));
  if (actual !== backup.stateSha256) throw new Error("Backup hash does not match its state payload.");
  if (backup.exclusions?.r2Bytes !== true || backup.exclusions?.secrets !== true) throw new Error("Backup exclusions are not explicit.");
  return backup;
}
