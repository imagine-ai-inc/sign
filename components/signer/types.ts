import type { FieldType, FieldOptions, PageMeta, RecipientRole, RecipientStatus } from "@/lib/types";
import type { SignerState } from "@/lib/services/signing";

export interface SignerField {
  id: string;
  documentId: string;
  recipientId: string;
  mine: boolean;
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
  ownerName: string;
  ownerColorIndex: number;
}

export interface SignerData {
  token: string;
  state: SignerState;
  needsAccessCode: boolean;
  envelope: {
    id: string;
    idDisplay: string;
    subject: string;
    message: string;
    status: string;
    senderName: string;
    senderEmail: string;
    allowReassign: boolean;
    voidReason: string | null;
    expiresAt: string | null;
    hasCompletedFile: boolean;
    hasCertificate: boolean;
  };
  recipient: {
    id: string;
    name: string;
    email: string;
    role: RecipientRole;
    status: RecipientStatus;
    consented: boolean;
    adoption: { fullName: string; initials: string; style: string; signatureId: string | null; hasStamp: boolean } | null;
    colorIndex: number;
  };
  documents: { id: string; name: string; pageCount: number; pages: PageMeta[] }[];
  fields: SignerField[];
  otherRecipients: { id: string; name: string; email: string; role: RecipientRole; status: RecipientStatus; routingOrder: number; colorIndex: number }[];
  earlierSigners: string[];
  disclosure: string;
  todayLabel: string;
  /** label -> value for other recipients' completed fields (formulas / conditional logic) */
  otherValues: Record<string, string>;
}
