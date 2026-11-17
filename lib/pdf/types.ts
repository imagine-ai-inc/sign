/**
 * PDF engine contract (consumed by the app).
 *
 * Coordinates: every field/anchor position is NORMALIZED to the page as it is
 * DISPLAYED (after /Rotate is applied), origin TOP-LEFT, values 0..1.
 *   x = left / displayedWidth, y = top / displayedHeight,
 *   width = w / displayedWidth, height = h / displayedHeight.
 * The engine converts to PDF user space (bottom-left origin, CropBox offsets,
 * page rotation) internally.
 */

export type Rotation = 0 | 90 | 180 | 270;

export interface PageInfo {
  index: number; // 0-based
  width: number; // displayed width in PDF points (rotation applied)
  height: number; // displayed height in PDF points (rotation applied)
  rotation: Rotation;
}

export interface PdfInfo {
  pageCount: number;
  pages: PageInfo[];
  encrypted: boolean;
  hasAcroForm: boolean;
}

export type FieldType =
  | "signature"
  | "initials"
  | "date_signed"
  | "name"
  | "first_name"
  | "last_name"
  | "email"
  | "company"
  | "title"
  | "text"
  | "number"
  | "date"
  | "checkbox"
  | "radio"
  | "dropdown"
  | "note"
  | "stamp"
  | "drawing"
  | "formula"
  | "attachment"
  | "approve"
  | "decline";

export interface RenderField {
  id: string;
  documentIndex: number; // index into RenderInput.documents
  page: number; // 0-based page within that document
  x: number;
  y: number;
  width: number;
  height: number;
  type: FieldType;
  /** Text value to print. checkbox: "true"/"false". radio: selected option value. date_signed: already formatted string. */
  value: string | null;
  /** PNG bytes for signature / initials. */
  imagePng?: Uint8Array | null;
  /** For radio: this field's own option value (it is drawn as selected when value === optionValue). */
  optionValue?: string;
  fontSize?: number; // points; engine auto-fits when omitted
  /** Text formatting for text-like fields */
  format?: { font?: "helvetica" | "times" | "courier"; bold?: boolean; italic?: boolean; underline?: boolean; color?: string } | null;
  /** Signature stamp frame (left bracket, label above, short signature id below), like DocuSign's "DocuSigned by:" stamp. */
  stamp?: { label: string; id?: string | null } | null;
  /** Fields with type "note" or empty optional values are skipped. */
}

export interface CertificateRecipient {
  name: string;
  email: string;
  role: "signer" | "cc" | "viewer" | "approver";
  routingOrder: number;
  status: "created" | "sent" | "delivered" | "completed" | "declined" | "replaced";
  securityLevel: string; // e.g. "Email, Account Authentication (None)" or "Email, Access Code"
  signatureImagePng?: Uint8Array | null;
  signatureAdoption?: "Pre-selected Style" | "Drawn on Device" | "Uploaded Signature" | null;
  signatureId?: string | null; // full signature id (uppercase GUID); the stamp shows its first 15 hex chars
  ip?: string | null;
  userAgent?: string | null;
  location?: string | null; // "San Francisco, CA, US"
  sentAt?: string | null; // ISO
  viewedAt?: string | null;
  signedAt?: string | null; // signed / viewed-completed / approved
  declinedAt?: string | null;
  declineReason?: string | null;
  consent?: { acceptedAt: string; id: string } | null; // e-records disclosure acceptance
}

export interface CertificateEvent {
  at: string; // ISO
  type: string; // e.g. "envelope.sent"
  description: string; // human readable
  actor?: string | null;
  ip?: string | null;
}

export interface CertificateData {
  envelopeId: string; // uppercase UUID as displayed
  subject: string;
  status: "completed" | "declined" | "voided" | "sent";
  timezone: string; // IANA, e.g. "America/Los_Angeles" (all times printed in this zone with offset)
  documents: { name: string; pageCount: number; sha256: string }[];
  signatureCount: number;
  initialsCount: number;
  sender: { name: string; email: string; ip?: string | null; company?: string | null };
  createdAt: string;
  sentAt?: string | null;
  completedAt?: string | null;
  recipients: CertificateRecipient[];
  events: CertificateEvent[];
  disclosureText: string; // full Electronic Record and Signature Disclosure (plain text, \n\n paragraphs)
  attachments?: { name: string; recipient: string; contentType: string; sha256: string }[];
}

export interface RenderInput {
  documents: { name: string; bytes: Uint8Array }[];
  fields: RenderField[];
  envelopeId: string; // uppercase UUID
  /** Stamp "Imagine Sign Envelope ID: <id>" at the top-left margin of every page (like DocuSign). */
  stampEnvelopeId: boolean;
  certificate: CertificateData;
  /** Signer attachments appended after the documents (PDFs as pages, PNG/JPEG as one page each). */
  attachments?: { name: string; bytes: Uint8Array; contentType: string }[];
}

export interface RenderOutput {
  /** All documents merged, fields flattened, envelope id stamped, certificate pages appended. NOT sealed. */
  combined: Uint8Array;
  /** Certificate of Completion alone. NOT sealed. */
  certificate: Uint8Array;
  certificatePageCount: number;
}

export interface SealOptions {
  p12: Uint8Array;
  passphrase: string;
  name: string; // "Acme Inc."
  reason: string; // "Signed and sealed by <brand>"
  location: string; // "San Francisco, CA"
  contactInfo: string; // "sign@example.com"
}

export interface AnchorHit {
  anchor: string;
  page: number; // 0-based
  x: number; // normalized, top-left of the matched text box
  y: number;
  width: number;
  height: number;
}

/**
 * Functions exported from lib/pdf/index.ts (all server-side, Node runtime):
 *
 *   getPdfInfo(bytes: Uint8Array): Promise<PdfInfo>
 *   normalizePdf(bytes: Uint8Array): Promise<Uint8Array>   // flattens AcroForm fields, throws PdfError('encrypted') for encrypted files
 *   findAnchors(bytes: Uint8Array, anchors: string[]): Promise<AnchorHit[]>  // every occurrence, all pages
 *   renderCompleted(input: RenderInput): Promise<RenderOutput>
 *   sealPdf(bytes: Uint8Array, opts: SealOptions): Promise<Uint8Array>      // PAdES (adbe.pkcs7.detached / ETSI.CAdES.detached), visible: false
 *   sha256Hex(bytes: Uint8Array): string
 *   class PdfError extends Error { code: 'encrypted' | 'invalid' | 'too_large' | 'unsupported' }
 */
export {};
