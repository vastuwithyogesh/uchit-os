import type { ClientRecord, ExternalClientLinkRecord } from "./domain.ts";

export type IdentityMatchResult =
  | { status: "EXACT_MATCH"; clientId: string; matchMethod: "EXACT_EMAIL" | "EXACT_PHONE"; identityKey: string }
  | { status: "NEW_CLIENT"; identityKey: string }
  | { status: "REVIEW_REQUIRED"; identityKey?: string; reason: string };

export function normalizeIdentityEmail(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  const at = normalized.indexOf("@");
  if (at <= 0) return normalized;
  const domain = normalized.slice(at + 1);
  const localPart = normalized.slice(0, at);
  const local = (domain === "gmail.com" || domain === "googlemail.com") ? localPart.split("+")[0].replace(/\./g, "") : localPart;
  return `${local}@${domain}`;
}

export function normalizeIdentityPhone(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/[\s().-]/g, "").trim();
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : normalized;
}

export function identityKeys(input: { email?: unknown; phone?: unknown }) {
  const email = normalizeIdentityEmail(input.email);
  const phone = normalizeIdentityPhone(input.phone);
  return { email: email ? `email:${email}` : undefined, phone: phone ? `phone:${phone}` : undefined };
}

export function reconcileExternalIdentity(input: {
  organisationId: string;
  email?: unknown;
  phone?: unknown;
  clients: readonly (Pick<ClientRecord, "id" | "email" | "phone"> & { organisationId?: string })[];
  links?: readonly (Pick<ExternalClientLinkRecord, "sourceRecordType" | "sourceRecordId" | "clientId" | "status"> & { organisationId?: string })[];
  sourceRecordType?: string;
  sourceRecordId?: string;
}): IdentityMatchResult {
  const keys = identityKeys(input);
  if (!input.organisationId.trim()) return { status: "REVIEW_REQUIRED", reason: "Organisation scope is required." };
  const linked = input.links?.find((link) => link.sourceRecordType === input.sourceRecordType && link.sourceRecordId === input.sourceRecordId && link.status !== "REVOKED" && link.organisationId === input.organisationId);
  if (linked) return { status: "EXACT_MATCH", clientId: linked.clientId, matchMethod: "EXACT_EMAIL", identityKey: keys.email ?? keys.phone ?? `source:${input.sourceRecordId ?? "unknown"}` };
  const scopedClients = input.clients.filter((client) => client.organisationId === input.organisationId);
  const emailMatches = keys.email ? scopedClients.filter((client) => normalizeIdentityEmail(client.email) === keys.email!.slice(6)) : [];
  const phoneMatches = keys.phone ? scopedClients.filter((client) => normalizeIdentityPhone(client.phone) === keys.phone!.slice(6)) : [];
  const unique = new Set([...emailMatches, ...phoneMatches].map((client) => client.id));
  if (emailMatches.length && phoneMatches.length && new Set([...emailMatches, ...phoneMatches].map((client) => client.id)).size > 1) {
    return { status: "REVIEW_REQUIRED", identityKey: keys.email ?? keys.phone, reason: "Email and phone identity signals point to different clients." };
  }
  if (unique.size === 1) {
    const clientId = [...unique][0];
    return { status: "EXACT_MATCH", clientId, matchMethod: emailMatches.length ? "EXACT_EMAIL" : "EXACT_PHONE", identityKey: keys.email ?? keys.phone ?? `client:${clientId}` };
  }
  if (unique.size > 1) return { status: "REVIEW_REQUIRED", identityKey: keys.email ?? keys.phone, reason: "Identity signals match multiple clients." };
  if (!keys.email && !keys.phone) return { status: "REVIEW_REQUIRED", reason: "At least one normalized email or phone identity signal is required." };
  return { status: "NEW_CLIENT", identityKey: keys.email ?? keys.phone! };
}
