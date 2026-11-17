import { brand, serviceLine } from "../../lib/brand";
import * as React from "react";
import {
  Body, Button, Container, Head, Hr, Html, Img, Link, Preview, Section, Text,
} from "@react-email/components";

/** Palette (mirrors app/globals.css). */
export const c = {
  paper: "#F4F1EF",
  card: "#FFFFFF",
  ink: "#141414",
  ink2: "#3D3A39",
  muted: "#77706D",
  hairline: "#D9D3D0",
  blush: "#F3D7D5",
  blush1: "#F7E4E2",
  rose: "#F6A1A8",
  roseInk: "#955C67",
  bad: "#B23A48",
};

export const font = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";

const s = {
  body: { backgroundColor: c.paper, margin: 0, padding: 0, fontFamily: font, color: c.ink, width: "100%", WebkitTextSizeAdjust: "100%" },
  container: { maxWidth: "600px", width: "100%", margin: "0 auto", boxSizing: "border-box" as const },
  card: { backgroundColor: c.card, border: `1px solid ${c.hairline}`, borderRadius: "4px", overflow: "hidden", width: "100%", boxSizing: "border-box" as const },
  logoRow: { padding: "22px 28px 18px" },
  panel: { backgroundColor: c.blush1, borderTop: `1px solid ${c.hairline}`, borderBottom: `1px solid ${c.hairline}`, padding: "36px 28px 34px", textAlign: "center" as const },
  panelTitle: { fontSize: "18px", lineHeight: "26px", color: c.ink, margin: "14px 0 22px", fontWeight: 400 },
  button: { backgroundColor: c.ink, color: "#FFFFFF", fontSize: "13px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const, padding: "14px 28px", borderRadius: "3px", textDecoration: "none", display: "inline-block" },
  main: { padding: "26px 28px 8px" },
  footer: { padding: "18px 28px 26px" },
  small: { fontSize: "12px", lineHeight: "18px", color: c.muted, margin: "0 0 14px" },
  smallTitle: { fontSize: "12px", lineHeight: "18px", color: c.ink, fontWeight: 700, margin: "0 0 2px" },
  link: { color: c.roseInk, textDecoration: "underline" },
};

export function Logo({ appUrl }: { appUrl: string }) {
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0}>
      <tbody>
        <tr>
          <td>
            {brand.emailLogo ? (
              <Img src={brand.emailLogo.startsWith("http") ? brand.emailLogo : `${appUrl}${brand.emailLogo}`} width="112" alt={brand.name} style={{ display: "block", height: "auto" }} />
            ) : brand.isDefault ? (
              <Img src={`${appUrl}/brand/imagine-logo.png`} width="112" height="35" alt="Imagine" style={{ display: "block" }} />
            ) : (
              <span style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "22px", color: c.ink }}>{brand.name}</span>
            )}
          </td>
          {!brand.emailLogo && brand.isDefault ? (
            <td style={{ paddingLeft: "10px", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "18px", color: c.roseInk, verticalAlign: "middle" }}>
              Sign
            </td>
          ) : null}
        </tr>
      </tbody>
    </table>
  );
}

/** Round icon above the panel title. Hosted PNG (circle baked in, 3x) so the glyph is centered the same in every client. */
export function PanelIcon({ kind, appUrl }: { kind: "doc" | "check" | "x" | "clock" | "bubble" | "key" | "eye"; appUrl: string }) {
  return (
    <table role="presentation" align="center" cellPadding={0} cellSpacing={0} style={{ margin: "0 auto" }}>
      <tbody>
        <tr>
          <td align="center" style={{ width: "52px", height: "52px", lineHeight: "0", fontSize: "0" }}>
            <Img src={`${appUrl}/brand/email/icon-${kind}.png`} width="52" height="52" alt="" style={{ display: "block", width: "52px", height: "52px", margin: "0 auto", border: 0 }} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export interface LayoutProps {
  appUrl: string;
  envelopeId?: string;
  preview: string;
  icon: React.ComponentProps<typeof PanelIcon>["kind"];
  title: React.ReactNode;
  cta?: { label: string; href: string };
  panelNote?: React.ReactNode;
  children?: React.ReactNode;
  /** DocuSign-style security footer blocks (signing emails only). */
  signingFooter?: boolean;
  /** Show "Questions about the document?" with the sender's address. */
  questionsTo?: { name: string; email: string } | null;
}

export function Layout(p: LayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{p.preview}</Preview>
      <Body style={s.body}>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ width: "100%", backgroundColor: c.paper, borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: "24px 12px" }}>
        <Container style={s.container}>
          <Section style={s.card}>
            <Section style={s.logoRow}>
              <Logo appUrl={p.appUrl} />
            </Section>
            <Section style={s.panel}>
              <PanelIcon kind={p.icon} appUrl={p.appUrl} />
              <Text style={s.panelTitle}>{p.title}</Text>
              {p.cta ? (
                <Button href={p.cta.href} style={s.button}>
                  {p.cta.label}
                </Button>
              ) : null}
              {p.panelNote ? <Text style={{ ...s.small, margin: "18px 0 0" }}>{p.panelNote}</Text> : null}
            </Section>
            {p.children ? <Section style={s.main}>{p.children}</Section> : null}
            <Section style={{ padding: "8px 28px 0" }}><Hr style={{ borderColor: c.hairline, margin: 0, width: "100%" }} /></Section>
            <Section style={s.footer}>
              {p.signingFooter ? (
                <>
                  <Text style={s.smallTitle}>Do not share this email</Text>
                  <Text style={s.small}>
                    This email contains a secure link to {brand.name}. Please do not share this email, link, or access code with others.
                  </Text>
                  <Text style={s.smallTitle}>About {brand.name}</Text>
                  <Text style={s.small}>
                    Sign documents electronically in just minutes. It&apos;s safe, secure, and legally binding. Whether you&apos;re at your desk or on your phone, {brand.name} works on any device.
                  </Text>
                </>
              ) : null}
              {p.questionsTo ? (
                <>
                  <Text style={s.smallTitle}>Questions about the document?</Text>
                  <Text style={s.small}>
                    If you need to modify the document or have questions about the details in the document, please reach out to the sender by emailing them directly at{" "}
                    <Link href={`mailto:${p.questionsTo.email}`} style={s.link}>{p.questionsTo.email}</Link>.
                  </Text>
                </>
              ) : null}
              <Text style={{ ...s.small, margin: "6px 0 0" }}>
                Sent by {serviceLine()}.
                {p.envelopeId ? <> Envelope ID {p.envelopeId}.</> : null}
              </Text>
            </Section>
          </Section>
        </Container>
              </td>
            </tr>
          </tbody>
        </table>
      </Body>
    </Html>
  );
}

export function SenderBlock({ name, email }: { name: string; email: string }) {
  return (
    <>
      <Text style={{ fontSize: "15px", lineHeight: "20px", fontWeight: 700, color: c.ink, margin: "0" }}>{name}</Text>
      <Link href={`mailto:${email}`} style={{ fontSize: "13px", lineHeight: "20px", color: c.roseInk, textDecoration: "none" }}>{email}</Link>
    </>
  );
}

/** Plain text message with preserved line breaks. */
export function Message({ text, label }: { text?: string | null; label?: string }) {
  if (!text || !text.trim()) return null;
  return (
    <>
      {label ? <Text style={{ fontSize: "12px", color: c.muted, margin: "16px 0 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</Text> : null}
      <Text style={{ fontSize: "14px", lineHeight: "22px", color: c.ink2, margin: label ? "0 0 14px" : "16px 0 14px", whiteSpace: "pre-wrap" }}>{text}</Text>
    </>
  );
}

export function DocList({ names }: { names: string[] }) {
  if (!names.length) return null;
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ width: "100%", margin: "6px 0 18px", borderTop: `1px solid ${c.hairline}` }}>
      <tbody>
        {names.map((n) => (
          <tr key={n}>
            <td style={{ padding: "9px 0", borderBottom: `1px solid ${c.hairline}`, fontSize: "13px", color: c.ink, fontFamily: font }}>
              <span style={{ display: "inline-block", width: "8px", height: "8px", backgroundColor: c.rose, borderRadius: "1px", marginRight: "10px", verticalAlign: "middle" }} />
              {n}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: "12px", lineHeight: "18px", color: c.muted, margin: "0 0 12px" }}>{children}</Text>;
}

export function hostOf(url: string) {
  try { return new URL(url).host; } catch { return url; }
}

export function fmtDate(iso: string | null | undefined, tz = "America/Los_Angeles") {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return iso;
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(d);
}

export function firstName(full: string) {
  return (full || "").trim().split(/\s+/)[0] || full;
}
