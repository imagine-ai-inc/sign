import type { FieldOptions } from "@/lib/types";

/** Shared conditional-logic check: a field is active when it has no condition or its parent matches. */
export function isFieldActive(options: FieldOptions | null | undefined, valueOfLabel: (label: string) => string | null | undefined): boolean {
  const c = options?.conditional;
  if (!c || !c.parentLabel) return true;
  const v = valueOfLabel(c.parentLabel);
  if (c.equals === undefined || c.equals === null || c.equals === "") return !!v && v !== "false";
  return (v ?? "") === c.equals;
}

export const VALIDATION_PATTERNS: Record<string, { re: RegExp; message: string }> = {
  email: { re: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email address" },
  number: { re: /^-?[\d,]*\.?\d+$/, message: "Enter a number" },
  date: { re: /^(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/\d{4}$/, message: "Use MM/DD/YYYY" },
  zip: { re: /^\d{5}$/, message: "Enter a 5 digit ZIP code" },
  zip4: { re: /^\d{5}-\d{4}$/, message: "Enter a ZIP+4 code (12345-6789)" },
  ssn: { re: /^\d{3}-?\d{2}-?\d{4}$/, message: "Enter a 9 digit SSN" },
  phone: { re: /^\+?[\d\s().-]{7,20}$/, message: "Enter a phone number" },
};

export function validateText(value: string, options: FieldOptions | null | undefined): string | null {
  if (!value) return null;
  const v = options?.validation;
  if (options?.maxLength && value.length > options.maxLength) return `Use ${options.maxLength} characters or fewer`;
  if (!v || v === "none") return null;
  if (v === "regex") {
    if (!options?.regex) return null;
    try { return new RegExp(`^(?:${options.regex})$`).test(value) ? null : options.validationMessage || "Check the format"; } catch { return null; }
  }
  const p = VALIDATION_PATTERNS[v];
  return p && !p.re.test(value) ? options?.validationMessage || p.message : null;
}
