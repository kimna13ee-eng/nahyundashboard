/** Empty legacy content may omit a type; entered personal details may not. */
export function needsPersonalContentType(
  form: FormData,
  existingType?: unknown,
) {
  if (form.get("personal:type")) return false;
  if (existingType) return true;
  return Array.from(form.entries()).some(([key, value]) => {
    if (!key.startsWith("personal:") || key === "personal:type") return false;
    if (key === "personal:step" && value === "idea") return false;
    if (key === "personal:review" && value === "none") return false;
    return typeof value !== "string" || value.trim() !== "";
  });
}
