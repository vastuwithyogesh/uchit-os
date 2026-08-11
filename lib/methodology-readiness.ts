import type { MethodologyModule } from "./domain.ts";
import type { AppState } from "./store.ts";

export function getActiveMethodologyVersion(state: Pick<AppState, "methodologyVersions">, organisationId: string, module: MethodologyModule) {
  return state.methodologyVersions.find((item) => item.organisationId === organisationId && item.module === module && item.lifecycleStatus === "ACTIVE");
}

export function getMethodologyReadiness(state: Pick<AppState, "methodologyVersions" | "methodologyRules" | "methodologyGoldenFixtures">, organisationId: string, module: MethodologyModule) {
  const version = getActiveMethodologyVersion(state, organisationId, module);
  if (!version) return { ready: false, status: "BLOCKED_METHOD_INPUT" as const, reason: `No active approved ${module} methodology version exists.` };
  const rules = state.methodologyRules.filter((item) => item.organisationId === organisationId && item.methodologyVersionId === version.id);
  const fixtures = state.methodologyGoldenFixtures.filter((item) => item.organisationId === organisationId && item.methodologyVersionId === version.id);
  const registryApproved = rules.length > 0 && rules.every((item) => item.decisionStatus === "APPROVED") && fixtures.length > 0 && fixtures.every((item) => item.decisionStatus === "APPROVED");
  const ready = registryApproved && Boolean(version.executionAdapterVersion);
  return { ready, status: ready ? "APPROVED" as const : "REVIEW_REQUIRED" as const,
    reason: !registryApproved ? "Active methodology has unresolved rules or golden fixtures."
      : !version.executionAdapterVersion ? "The approved register is not yet bound to a reviewed deterministic execution adapter." : "Active methodology, fixtures, and execution adapter are approved.",
    version, rules, fixtures };
}
