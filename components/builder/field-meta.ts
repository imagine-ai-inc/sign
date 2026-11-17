import type { FieldType } from "@/lib/types";

export interface FieldMeta { type: FieldType; label: string; short: string; group: "sign" | "auto" | "input" | "choice"; w: number; h: number }
export const FIELD_GROUPS: { key: FieldMeta["group"]; label: string }[] = [
  { key: "sign", label: "Signature" },
  { key: "auto", label: "Auto-filled" },
  { key: "input", label: "Signer input" },
  { key: "choice", label: "Choices and actions" },
];

/** Default sizes in PDF points (converted to normalized per page when placed). */
export const FIELD_META: FieldMeta[] = [
  { type: "signature", label: "Signature", short: "Sign", group: "sign", w: 160, h: 50 },
  { type: "initials", label: "Initial", short: "Initial", group: "sign", w: 56, h: 46 },
  { type: "stamp", label: "Stamp", short: "Stamp", group: "sign", w: 110, h: 110 },
  { type: "date_signed", label: "Date Signed", short: "Date Signed", group: "auto", w: 100, h: 18 },
  { type: "name", label: "Name", short: "Name", group: "auto", w: 150, h: 18 },
  { type: "first_name", label: "First Name", short: "First Name", group: "auto", w: 100, h: 18 },
  { type: "last_name", label: "Last Name", short: "Last Name", group: "auto", w: 100, h: 18 },
  { type: "email", label: "Email Address", short: "Email", group: "auto", w: 170, h: 18 },
  { type: "company", label: "Company", short: "Company", group: "input", w: 150, h: 18 },
  { type: "title", label: "Title", short: "Title", group: "input", w: 150, h: 18 },
  { type: "text", label: "Text", short: "Text", group: "input", w: 150, h: 18 },
  { type: "number", label: "Number", short: "Number", group: "input", w: 90, h: 18 },
  { type: "date", label: "Date", short: "Date", group: "input", w: 100, h: 18 },
  { type: "checkbox", label: "Checkbox", short: "", group: "choice", w: 14, h: 14 },
  { type: "radio", label: "Radio", short: "", group: "choice", w: 14, h: 14 },
  { type: "dropdown", label: "Dropdown", short: "Dropdown", group: "choice", w: 130, h: 18 },
  { type: "note", label: "Note", short: "Note", group: "input", w: 160, h: 40 },
  { type: "drawing", label: "Drawing", short: "Draw", group: "input", w: 200, h: 100 },
  { type: "formula", label: "Formula", short: "Formula", group: "input", w: 100, h: 18 },
  { type: "attachment", label: "Attachment", short: "Attach", group: "input", w: 24, h: 24 },
  { type: "approve", label: "Approve", short: "Approve", group: "choice", w: 80, h: 24 },
  { type: "decline", label: "Decline", short: "Decline", group: "choice", w: 80, h: 24 },
];

export function fieldMeta(type: FieldType): FieldMeta {
  return FIELD_META.find((m) => m.type === type) ?? FIELD_META[9];
}

export const ROLE_OPTIONS = [
  { value: "signer", label: "Needs to Sign" },
  { value: "approver", label: "Needs to Approve" },
  { value: "viewer", label: "Needs to View" },
  { value: "cc", label: "Receives a Copy" },
] as const;
