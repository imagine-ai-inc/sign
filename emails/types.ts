/**
 * Email templates contract (consumed by lib/email/send.ts).
 *
 * Each template is a React Email component in emails/<name>.tsx with a default
 * export taking the props below, plus a named export `subject(props)` returning
 * the subject line. lib/email/send.ts renders with @react-email/render and sends
 * through Resend (attachments are added by the sender, not the template).
 *
 * Look: mirror DocuSign's notification emails (logo row, big colored panel with
 * the call to action, sender block, message, "Do not share this email" block,
 * "Alternate signing method", "About <brand>", "Questions about the
 * document?" footer) in the app palette:
 *   paper #F4F1EF background, white card, ink #141414 text and primary buttons,
 *   rose #F6A1A8 / blush #F3D7D5 accents, rose-ink #955C67 for small accents,
 *   hairline #D9D3D0. Inter / Helvetica fallback. Logo: NEXT_PUBLIC_BRAND_EMAIL_LOGO or {appUrl}/brand/imagine-logo.png
 * Never write "DocuSign" anywhere in the emails.
 */

export interface BaseEmailProps {
  appUrl: string; // e.g. https://sign.example.com
  envelopeId: string; // uppercase UUID
}

export interface SigningRequestEmailProps extends BaseEmailProps {
  senderName: string;
  senderEmail: string;
  recipientName: string;
  subject: string; // envelope email subject
  message: string; // envelope message (may be empty), plain text with \n
  privateMessage?: string | null; // recipient-specific note
  documentNames: string[];
  action: "sign" | "view" | "approve";
  url: string; // unique signing link
  expiresAt?: string | null; // ISO
  isReminder?: boolean; // reminder variant ("Reminder: ...")
  isCorrection?: boolean; // envelope was corrected and re-sent
}

export interface CompletedEmailProps extends BaseEmailProps {
  recipientName: string;
  senderName: string;
  subject: string;
  documentNames: string[];
  url: string; // link to view/download the completed document
  completedAt: string; // ISO
  hasAttachment: boolean;
}

export interface DeclinedEmailProps extends BaseEmailProps {
  recipientName: string; // who receives this email (sender or other recipients)
  declinerName: string;
  declinerEmail: string;
  reason: string;
  subject: string;
  url: string; // envelope details page (internal) or empty for externals
}

export interface VoidedEmailProps extends BaseEmailProps {
  recipientName: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  reason: string;
}

export interface ActivityEmailProps extends BaseEmailProps {
  // notifications to the sender: "<name> viewed / signed <subject>"
  recipientName: string; // the sender
  actorName: string;
  actorEmail: string;
  activity: "viewed" | "signed" | "approved" | "reassigned" | "bounced";
  subject: string;
  url: string; // envelope details page
  detail?: string | null;
}

export interface CommentEmailProps extends BaseEmailProps {
  recipientName: string;
  authorName: string;
  body: string;
  subject: string;
  url: string;
}

export interface ExpiringEmailProps extends BaseEmailProps {
  recipientName: string;
  senderName: string;
  subject: string;
  url: string;
  expiresAt: string;
}

export interface LoginCodeEmailProps {
  appUrl: string;
  code: string; // 6 digits
}

/**
 * Files expected:
 *   emails/signing-request.tsx  (SigningRequestEmailProps)
 *   emails/completed.tsx        (CompletedEmailProps)
 *   emails/declined.tsx         (DeclinedEmailProps)
 *   emails/voided.tsx           (VoidedEmailProps)
 *   emails/activity.tsx         (ActivityEmailProps)
 *   emails/comment.tsx          (CommentEmailProps)
 *   emails/expiring.tsx         (ExpiringEmailProps)
 *   emails/login-code.tsx       (LoginCodeEmailProps)
 *   emails/components/*         shared layout pieces
 */
export {};
