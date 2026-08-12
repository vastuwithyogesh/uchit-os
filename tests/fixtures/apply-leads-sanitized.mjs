export const applyLeadHeaders = [
  "id", "name", "email", "phone", "dob", "city", "created_at", "status", "notes", "source",
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "landing_page", "referrer",
  "assigned_to", "deleted_at", "property_stage", "submission_count", "last_submitted_at", "client_code"
];

function quote(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function phoneFor(index) {
  if (index <= 74) return String(9000000000 + index);
  if (index <= 87) return `+1415555${String(index).padStart(4, "0")}`;
  if (index <= 94) return `${String(9000000000 + index).slice(0, 5)} ${String(9000000000 + index).slice(5)}`;
  if (index === 95) return "+44 7700 900095";
  if (index === 96) return "91900000096";
  return "919000000097";
}

export function buildSanitizedApplyLeadsCsv() {
  const rows = Array.from({ length: 97 }, (_, offset) => {
    const index = offset + 1;
    const propertyStage = index <= 5 ? "existing" : index <= 7 ? "new" : "";
    const values = [
      `synthetic-source-${String(index).padStart(3, "0")}`,
      `Synthetic Lead ${String(index).padStart(3, "0")}`,
      `synthetic-${String(index).padStart(3, "0")}@example.test`,
      phoneFor(index),
      index % 3 === 0 ? "1990-01-01" : "",
      index === 10 ? "305406" : "Synthetic City",
      `2026-08-11T${String(index % 24).padStart(2, "0")}:00:00.000Z`,
      index === 95 ? "lost" : "new",
      index === 12 ? "Source-labelled synthetic note" : "",
      "apply-form",
      "synthetic", "test", "founder-import", "", "",
      index === 20 ? `/apply?${"campaign=synthetic&".repeat(8)}source=test` : "/apply",
      "https://example.test/reference?source=synthetic",
      index % 4 === 0 ? "Source operator" : "",
      "",
      propertyStage,
      String((index % 4) + 1),
      `2026-08-11T${String(index % 24).padStart(2, "0")}:30:00.000Z`,
      `SYN-${String(index).padStart(4, "0")}`
    ];
    return values.map(quote).join(",");
  });
  return `${applyLeadHeaders.join(",")}\n${rows.join("\n")}`;
}
