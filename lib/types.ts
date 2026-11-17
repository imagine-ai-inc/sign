export type Role = "owner" | "admin" | "member" | "viewer";
export type EnvelopeStatus = "draft" | "sent" | "completed" | "declined" | "voided" | "expired" | "template";
export type RecipientRole = "signer" | "cc" | "viewer" | "approver";
export type RecipientStatus = "created" | "sent" | "delivered" | "completed" | "declined" | "replaced";
export type FieldType =
  | "signature" | "initials" | "stamp" | "date_signed" | "name" | "first_name" | "last_name" | "email"
  | "company" | "title" | "text" | "number" | "date" | "checkbox" | "radio" | "dropdown" | "note"
  | "drawing" | "formula" | "attachment" | "approve" | "decline";

export interface AppUser {
  id: string;
  workspaceId: string;
  authUserId: string | null;
  email: string;
  name: string;
  title: string | null;
  company: string | null;
  role: Role;
  status: "active" | "invited" | "disabled";
  signature: SignatureAdoption | null;
  timezone: string;
  notificationPrefs: Record<string, boolean>;
  createdAt: Date;
  lastSeenAt: Date | null;
}

export interface SignatureAdoption {
  style: "font" | "draw" | "upload";
  font?: string | null;
  fullName: string;
  initials: string;
  signatureFileId: string;
  initialsFileId: string;
  stampFileId?: string | null; // company stamp image (Stamp field)
  signatureId?: string;
  adoptedAt: string;
  ip?: string | null;
}

export interface Envelope {
  id: string;
  workspaceId: string;
  ownerId: string;
  createdVia: "web" | "api" | "template" | "mcp";
  apiKeyId: string | null;
  templateId: string | null;
  status: EnvelopeStatus;
  subject: string;
  message: string;
  signingOrder: boolean;
  visibility: "workspace" | "private";
  reminderEnabled: boolean;
  reminderDelayDays: number;
  reminderFrequencyDays: number;
  expireAfterDays: number;
  expireWarnDays: number;
  expiresAt: Date | null;
  allowReassign: boolean;
  allowComments: boolean;
  metadata: Record<string, unknown>;
  sentAt: Date | null;
  completedAt: Date | null;
  voidedAt: Date | null;
  voidReason: string | null;
  declinedAt: Date | null;
  expiredAt: Date | null;
  deletedAt: Date | null;
  completedFileId: string | null;
  certificateFileId: string | null;
  completedSha256: string | null;
  senderName: string | null;
  senderEmail: string | null;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PageMeta { width: number; height: number; rotation: 0 | 90 | 180 | 270 }

export interface EnvelopeDocument {
  id: string;
  envelopeId: string;
  fileId: string;
  name: string;
  position: number;
  pageCount: number;
  pages: PageMeta[];
}

export interface Recipient {
  id: string;
  envelopeId: string;
  role: RecipientRole;
  name: string;
  email: string;
  routingOrder: number;
  position: number;
  colorIndex: number;
  templateRole: string | null;
  privateMessage: string | null;
  accessCodeHash: string | null;
  status: RecipientStatus;
  sentAt: Date | null;
  deliveredAt: Date | null;
  consentedAt: Date | null;
  completedAt: Date | null;
  declinedAt: Date | null;
  declineReason: string | null;
  lastRemindedAt: Date | null;
  reminderCount: number;
  ip: string | null;
  userAgent: string | null;
  geo: { city?: string; region?: string; country?: string } | null;
  signatureAdoption: SignatureAdoption | null;
  replacedBy: string | null;
  userId: string | null;
}

export interface Field {
  id: string;
  envelopeId: string;
  documentId: string;
  recipientId: string;
  type: FieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  readOnly: boolean;
  label: string | null;
  options: FieldOptions;
  value: string | null;
  filledAt: Date | null;
}

export interface FieldOptions {
  choices?: string[]; // dropdown
  group?: string; // radio group name
  optionValue?: string; // radio option value
  fontSize?: number;
  /** Text formatting (DocuSign "Formatting" panel) */
  font?: "helvetica" | "times" | "courier";
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontColor?: string; // hex like #141414
  placeholder?: string;
  tooltip?: string;
  /** Text validation (DocuSign "Validation" panel) */
  validation?: "none" | "email" | "number" | "date" | "zip" | "zip4" | "ssn" | "phone" | "regex";
  regex?: string;
  validationMessage?: string;
  maxLength?: number;
  /** Formula field: expression over other fields' data labels, e.g. "[qty] * [price]" */
  formula?: string;
  decimals?: number;
  /** Conditional logic: show this field only when the field with data label parentLabel matches */
  conditional?: { parentLabel: string; equals?: string | null } | null; // equals null/undefined = "has any value / checked"
  /** Signer attachment constraints */
  accept?: string; // e.g. ".pdf,.png,.jpg"
  maxMb?: number;
}

export interface EnvelopeEvent {
  id: number;
  envelopeId: string;
  recipientId: string | null;
  actorUserId: string | null;
  actorApiKeyId: string | null;
  type: string;
  description: string;
  ip: string | null;
  userAgent: string | null;
  geo: Record<string, string> | null;
  data: Record<string, unknown>;
  prevHash: string | null;
  hash: string;
  createdAt: Date;
}

export interface Template {
  id: string;
  workspaceId: string;
  ownerId: string;
  name: string;
  description: string;
  subject: string;
  message: string;
  signingOrder: boolean;
  shared: boolean;
  settings: Record<string, unknown>;
  useCount: number;
  lastUsedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateRole {
  id: string;
  templateId: string;
  name: string;
  role: RecipientRole;
  routingOrder: number;
  position: number;
  colorIndex: number;
  defaultName: string | null;
  defaultEmail: string | null;
  privateMessage: string | null;
}

export interface Comment {
  id: string;
  envelopeId: string;
  authorUserId: string | null;
  authorRecipientId: string | null;
  body: string;
  visibility: "internal" | "everyone";
  createdAt: Date;
}
