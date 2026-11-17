"use client";
import { brand, serviceLine } from "@/lib/brand";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, FileText, Minus, Plus, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PdfDocument, type PageSize } from "@/components/pdf/pdf-document";
import { SignerFrame } from "@/components/signer/signer-frame";
import { AccessCodeForm } from "@/components/signer/access-code-form";
import { OtherActions, SignerDialogs, type OtherOutcome, type SignerDialog } from "@/components/signer/other-actions";
import { AdoptSignatureDialog, type Adopted } from "@/components/signer/adopt-signature-dialog";
import { AdoptStampDialog } from "@/components/signer/adopt-stamp-dialog";
import { FieldOverlay } from "@/components/signer/field-overlay";
import { CompletedScreen, DeclinedScreen, DoneScreen, ExpiredScreen, ReplacedScreen, StatusCard, VoidedScreen, WaitingScreen } from "@/components/signer/status-screens";
import { consentAction, finishAction } from "@/lib/actions/signer";
import { evaluateFormula, formatFormula } from "@/lib/formula";
import { isFieldActive, validateText } from "@/lib/conditions";
import type { SignerData, SignerField } from "@/components/signer/types";
import { cn } from "@/lib/cn";

const FILLABLE = new Set(["signature", "initials", "stamp", "text", "number", "date", "checkbox", "radio", "dropdown", "company", "title", "drawing", "attachment", "approve"]);
const TEXTUAL = new Set(["text", "number", "date", "company", "title"]);
const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 2];

export function SignerApp({ data }: { data: SignerData }) {
  const sender = { name: data.envelope.senderName, email: data.envelope.senderEmail };
  const [phase, setPhase] = useState<"review" | "sign" | "done" | "later" | "declined" | "reassigned">(data.recipient.consented ? "sign" : "review");
  const [envelopeCompleted, setEnvelopeCompleted] = useState(false);
  const [about, setAbout] = useState(false);
  const frame = { subject: data.envelope.subject, recipient: { name: data.recipient.name, email: data.recipient.email }, sender, onAbout: () => setAbout(true) };
  const aboutDialog = (
    <Dialog open={about} onOpenChange={setAbout}>
      <DialogContent title={`About ${brand.name}`}>
        <div className="text-sm text-ink-2 space-y-3">
          <p>{serviceLine()}. Documents signed here are sealed, hash-chained in an audit trail, and delivered with a Certificate of Completion.</p>
          <p className="font-mono text-[12px] text-muted">Envelope ID {data.envelope.idDisplay}</p>
        </div>
        <div className="mt-5 flex justify-end"><Button onClick={() => setAbout(false)}>Close</Button></div>
      </DialogContent>
    </Dialog>
  );

  if (data.needsAccessCode) return <SignerFrame {...frame}><AccessCodeForm token={data.token} sender={sender} subject={data.envelope.subject} />{aboutDialog}</SignerFrame>;

  switch (data.state) {
    case "waiting": return <SignerFrame {...frame}><WaitingScreen earlier={data.earlierSigners} subject={data.envelope.subject} />{aboutDialog}</SignerFrame>;
    case "done": return <SignerFrame {...frame}><DoneScreen subject={data.envelope.subject} token={data.token} completed={false} hasCertificate={false} />{aboutDialog}</SignerFrame>;
    case "completed": return <SignerFrame {...frame} right={<OtherActions token={data.token} allowReassign={false} sender={sender} envelopeId={data.envelope.idDisplay} recipientEmail={data.recipient.email} completed onOutcome={() => {}} />}><CompletedScreen subject={data.envelope.subject} token={data.token} hasCompletedFile={data.envelope.hasCompletedFile} hasCertificate={data.envelope.hasCertificate} />{aboutDialog}</SignerFrame>;
    case "voided": return <SignerFrame {...frame}><VoidedScreen subject={data.envelope.subject} reason={data.envelope.voidReason} sender={sender} />{aboutDialog}</SignerFrame>;
    case "declined": return <SignerFrame {...frame}><DeclinedScreen subject={data.envelope.subject} sender={sender} />{aboutDialog}</SignerFrame>;
    case "expired": return <SignerFrame {...frame}><ExpiredScreen subject={data.envelope.subject} sender={sender} />{aboutDialog}</SignerFrame>;
    case "replaced": return <SignerFrame {...frame}><ReplacedScreen subject={data.envelope.subject} />{aboutDialog}</SignerFrame>;
  }

  if (phase === "done") return <SignerFrame {...frame}><DoneScreen subject={data.envelope.subject} token={data.token} completed={envelopeCompleted} hasCertificate={envelopeCompleted} />{aboutDialog}</SignerFrame>;
  if (phase === "declined") return <SignerFrame {...frame}><DeclinedScreen subject={data.envelope.subject} sender={sender} />{aboutDialog}</SignerFrame>;
  if (phase === "reassigned") return <SignerFrame {...frame}><ReplacedScreen subject={data.envelope.subject} />{aboutDialog}</SignerFrame>;
  if (phase === "later") {
    return (
      <SignerFrame {...frame}>
        <StatusCard icon={<Clock size={28} className="text-rose-ink" />} title="Finish later" actions={<Button variant="secondary" onClick={() => setPhase("sign")}>Back to the document</Button>}>
          <p className="font-medium text-ink">{data.envelope.subject}</p>
          <p>No problem. The link in your email keeps working, so come back whenever you&apos;re ready. Nothing you entered was submitted yet.</p>
        </StatusCard>
        {aboutDialog}
      </SignerFrame>
    );
  }
  if (phase === "review") return <ReviewPanel data={data} sender={sender} frame={frame} onContinue={() => setPhase("sign")} onOutcome={(o) => setPhase(o)}>{aboutDialog}</ReviewPanel>;
  return <SigningView data={data} sender={sender} frame={frame} onDone={(completed) => { setEnvelopeCompleted(completed); setPhase("done"); }} onOutcome={(o) => setPhase(o)}>{aboutDialog}</SigningView>;
}

type Frame = { subject: string; recipient: { name: string; email: string }; sender: { name: string; email: string }; onAbout: () => void };

function ReviewPanel({ data, sender, frame, onContinue, onOutcome, children }: { data: SignerData; sender: { name: string; email: string }; frame: Frame; onContinue: () => void; onOutcome: (o: OtherOutcome) => void; children?: React.ReactNode }) {
  const [agreed, setAgreed] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const verb = data.recipient.role === "viewer" ? "view" : data.recipient.role === "approver" ? "approve" : "sign";
  return (
    <SignerFrame {...frame} right={<OtherActions token={data.token} allowReassign={data.envelope.allowReassign && data.recipient.role === "signer"} sender={sender} envelopeId={data.envelope.idDisplay} recipientEmail={data.recipient.email} onOutcome={onOutcome} />}>
      <div className="bg-blush-1 border-b border-rose-1/60">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <p className="text-[12px] uppercase tracking-wide text-rose-ink font-semibold">{sender.name} &middot; {sender.email}</p>
          <h1 className="font-serif text-[28px] sm:text-[34px] leading-tight mt-1">Please review and act on these documents.</h1>
          {data.envelope.message ? <p className="mt-3 text-[15px] text-ink-2 whitespace-pre-line max-w-[720px]">{data.envelope.message}</p> : null}
          <ul className="mt-4 flex flex-wrap gap-2">
            {data.documents.map((d) => <li key={d.id} className="inline-flex items-center gap-1.5 bg-white/70 border border-rose-1/60 rounded-md px-2.5 py-1 text-[13px]"><FileText size={14} className="text-rose-ink" />{d.name}.pdf <span className="text-muted">&middot; {d.pageCount} {d.pageCount === 1 ? "page" : "pages"}</span></li>)}
          </ul>
          <div className="mt-6 bg-white rounded-lg border border-hairline p-4 sm:p-5 max-w-[720px]">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-ink" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span className="text-[15px]">I agree to use electronic records and signatures. <button type="button" className="text-rose-ink underline" onClick={(e) => { e.preventDefault(); setShowDisclosure(true); }}>Read the Electronic Record and Signature Disclosure</button></span>
            </label>
            {error ? <p className="text-sm text-bad mt-3">{error}</p> : null}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button size="lg" className="uppercase tracking-wide text-[13px] font-semibold" disabled={!agreed || pending} onClick={() => start(async () => {
                const r = await consentAction(data.token);
                if (!r.ok) setError(r.error); else onContinue();
              })}>{pending ? "One moment..." : "Continue"}</Button>
              <span className="text-[12px] text-muted">Envelope ID {data.envelope.idDisplay}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 text-sm text-muted">
        Documents open after you agree to {verb}. Questions about the document? Email <a className="text-rose-ink underline" href={`mailto:${sender.email}`}>{sender.email}</a>.
      </div>
      <Dialog open={showDisclosure} onOpenChange={setShowDisclosure}>
        <DialogContent title="Electronic Record and Signature Disclosure" wide>
          <div className="text-[13px] leading-relaxed text-ink-2 whitespace-pre-wrap max-h-[60vh] overflow-y-auto pr-2">{data.disclosure}</div>
          <div className="mt-4 flex justify-end"><Button onClick={() => { setAgreed(true); setShowDisclosure(false); }}>I agree</Button></div>
        </DialogContent>
      </Dialog>
      {children}
    </SignerFrame>
  );
}

function SigningView({ data, sender, frame, onDone, onOutcome, children }: { data: SignerData; sender: { name: string; email: string }; frame: Frame; onDone: (completed: boolean) => void; onOutcome: (o: OtherOutcome) => void; children?: React.ReactNode }) {
  const router = useRouter();
  const myFields = useMemo(() => data.fields.filter((f) => f.mine), [data.fields]);
  const mine = useMemo(() => myFields.filter((f) => !f.readOnly && FILLABLE.has(f.type)), [myFields]);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of myFields) if (f.value && !["signature", "initials", "stamp", "drawing", "attachment", "approve", "formula"].includes(f.type)) v[f.id] = f.value;
    return v;
  });
  const [adopted, setAdopted] = useState<Adopted | null>(data.recipient.adoption ? {
    fullName: data.recipient.adoption.fullName, initials: data.recipient.adoption.initials, signatureId: data.recipient.adoption.signatureId,
    signaturePng: `/api/s/${data.token}/signature`, initialsPng: `/api/s/${data.token}/signature?kind=initials`,
    stampPng: data.recipient.adoption.hasStamp ? `/api/s/${data.token}/signature?kind=stamp` : null,
  } : null);
  const [adoptFor, setAdoptFor] = useState<SignerField | null>(null);
  const [stampFor, setStampFor] = useState<SignerField | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [invalid, setInvalid] = useState<Record<string, string>>({});
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [dialog, setDialog] = useState<SignerDialog>(null);
  const [pending, start] = useTransition();
  const refs = useRef(new Map<string, HTMLElement>());

  // label -> value (mine + other recipients), for conditional logic and formulas
  const byLabel = useCallback((label: string): string | null => {
    const f = myFields.find((x) => x.label === label);
    if (f) {
      if (f.readOnly) return f.value;
      if (f.type === "radio") { const sel = myFields.find((g) => g.type === "radio" && (g.options?.group ?? g.id) === (f.options?.group ?? f.id) && values[g.id] === "true"); return sel ? sel.options?.optionValue ?? "x" : null; }
      return values[f.id] ?? null;
    }
    return data.otherValues[label] ?? null;
  }, [myFields, values, data.otherValues]);

  const hidden = useMemo(() => new Set(myFields.filter((f) => !isFieldActive(f.options, byLabel)).map((f) => f.id)), [myFields, byLabel]);
  const formulas = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of myFields.filter((x) => x.type === "formula")) {
      const n = f.options?.formula ? evaluateFormula(f.options.formula, byLabel) : null;
      out[f.id] = formatFormula(n, f.options?.decimals ?? 2);
    }
    return out;
  }, [myFields, byLabel]);

  const isFilled = useCallback((f: SignerField) => {
    const v = values[f.id];
    if (f.type === "signature") return v === "signed";
    if (f.type === "initials") return v === "initialed";
    if (f.type === "stamp") return v === "stamped";
    if (f.type === "checkbox") return v === "true";
    if (f.type === "approve") return v === "approved";
    if (f.type === "radio") return mine.some((g) => g.type === "radio" && (g.options?.group ?? g.id) === (f.options?.group ?? f.id) && values[g.id] === "true");
    return !!(v && v.trim());
  }, [values, mine]);

  const active = useMemo(() => mine.filter((f) => !hidden.has(f.id)), [mine, hidden]);
  const required = useMemo(() => active.filter((f) => f.required && f.type !== "approve"), [active]);
  const requiredDone = required.filter(isFilled).length;
  const allDone = requiredDone === required.length && Object.keys(invalid).length === 0;
  const missing = useMemo(() => new Set(showMissing ? required.filter((f) => !isFilled(f)).map((f) => f.id) : []), [showMissing, required, isFilled]);
  const ordered = useMemo(() => {
    const docIndex = new Map(data.documents.map((d, i) => [d.id, i]));
    return [...active].sort((a, b) => (docIndex.get(a.documentId)! - docIndex.get(b.documentId)!) || a.page - b.page || a.y - b.y || a.x - b.x);
  }, [active, data.documents]);
  const nextTarget = ordered.find((f) => f.required && !isFilled(f)) ?? ordered.find((f) => !isFilled(f) && f.type !== "approve") ?? null;

  function scrollTo(id: string) {
    const el = refs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if ("focus" in el) (el as HTMLElement).focus({ preventScroll: true });
  }

  function setValue(id: string, v: string) {
    setStarted(true);
    setValues((x) => ({ ...x, [id]: v }));
  }
  function clearValue(id: string) { setValues((x) => { const n = { ...x }; delete n[id]; return n; }); }

  function stampSig(f: SignerField) { setValue(f.id, f.type === "signature" ? "signed" : "initialed"); }

  function onSignatureClick(f: SignerField) {
    setStarted(true);
    const v = values[f.id];
    if (v === "signed" || v === "initialed") { if (!f.required) clearValue(f.id); return; }
    if (!adopted) { setAdoptFor(f); return; }
    stampSig(f);
  }
  function onStampClick(f: SignerField) {
    setStarted(true);
    if (values[f.id] === "stamped") { if (!f.required) clearValue(f.id); return; }
    if (!adopted) { setAdoptFor(f); return; }
    if (!adopted.stampPng) { setStampFor(f); return; }
    setValue(f.id, "stamped");
  }
  function onRadio(group: string | undefined, f: SignerField) {
    setStarted(true);
    setValues((v) => {
      const n = { ...v };
      for (const g of mine) if (g.type === "radio" && (g.options?.group ?? g.id) === (group ?? f.id)) delete n[g.id];
      n[f.id] = "true";
      return n;
    });
  }
  function onBlur(f: SignerField) {
    if (!TEXTUAL.has(f.type)) return;
    const msg = validateText(values[f.id] ?? "", f.options);
    setInvalid((x) => { const n = { ...x }; if (msg) n[f.id] = msg; else delete n[f.id]; return n; });
  }

  function finish(extra?: Record<string, string>) {
    setError(null);
    const vals = { ...values, ...(extra ?? {}) };
    // validation pass
    const bad: Record<string, string> = {};
    for (const f of active) if (TEXTUAL.has(f.type)) { const m = validateText(vals[f.id] ?? "", f.options); if (m) bad[f.id] = m; }
    setInvalid(bad);
    const firstBad = active.find((f) => bad[f.id]);
    if (firstBad) { scrollTo(firstBad.id); setError(`${firstBad.label || "A field"}: ${bad[firstBad.id]}`); return; }
    const first = required.find((f) => !isFilled(f));
    if (first) { setShowMissing(true); scrollTo(first.id); setError(`${required.length - requiredDone} required ${required.length - requiredDone === 1 ? "field is" : "fields are"} still empty.`); return; }
    start(async () => {
      const payload: Record<string, string> = {};
      for (const f of mine) if (vals[f.id] !== undefined && !hidden.has(f.id)) payload[f.id] = vals[f.id];
      const r = await finishAction(data.token, payload);
      if (!r.ok) {
        if (r.code === "access_code_required" || r.code === "invalid_link" || r.code === "closed") router.refresh();
        setError(r.error);
        return;
      }
      onDone(!!r.data?.envelopeCompleted);
    });
  }

  const finishLabel = data.recipient.role === "viewer" ? "Acknowledge" : data.recipient.role === "approver" ? "Approve" : "Finish";
  const prefill = { name: data.recipient.name, email: data.recipient.email, today: data.todayLabel };
  const maxWidth = Math.round(900 * zoom);
  const zoomIdx = ZOOMS.indexOf(zoom);
  const otherProps = { token: data.token, allowReassign: data.envelope.allowReassign && data.recipient.role === "signer", sender, envelopeId: data.envelope.idDisplay, recipientEmail: data.recipient.email, onOutcome };

  return (
    <SignerFrame {...frame}>
      <div className="sticky top-14 z-30 bg-white border-b border-hairline">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-[240px]">
            <p className={cn("text-[13px] sm:text-sm sm:truncate leading-snug", allDone ? "text-ok font-medium" : "text-ink")}><span className="sm:hidden">{allDone ? `All set. Tap ${finishLabel.toUpperCase()} to continue.` : "Complete the required fields below."}</span><span className="hidden sm:inline">{allDone ? `You've completed all required fields. Select ${finishLabel.toUpperCase()} to continue.` : `Please review the ${data.documents.length === 1 ? "document" : "documents"} below and complete the required fields.`}</span></p>
            {required.length ? <p className="text-[12px] text-muted">{requiredDone} of {required.length} required {required.length === 1 ? "field" : "fields"} complete</p> : null}
          </div>
          <div className="hidden md:flex items-center gap-1 text-[12px] text-ink-2 border border-hairline rounded-[6px] px-1 h-8">
            <button type="button" className="p-1 rounded hover:bg-paper-2 disabled:opacity-40" aria-label="Zoom out" disabled={zoomIdx <= 0} onClick={() => setZoom(ZOOMS[Math.max(0, zoomIdx - 1)])}><Minus size={13} /></button>
            <span className="w-11 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button type="button" className="p-1 rounded hover:bg-paper-2 disabled:opacity-40" aria-label="Zoom in" disabled={zoomIdx >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zoomIdx + 1)])}><Plus size={13} /></button>
            <button type="button" className="p-1 rounded hover:bg-paper-2" aria-label="Fit width" title="Fit width" onClick={() => setZoom(1)}><Maximize2 size={13} /></button>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button onClick={() => finish()} disabled={pending} className="uppercase tracking-wide text-[12px] font-semibold">{pending ? "Finishing..." : finishLabel}</Button>
            <OtherActions {...otherProps} disabled={pending} dialog={dialog} onDialogChange={setDialog} />
          </div>
        </div>
        {error ? <div className="bg-bad-bg text-bad text-sm px-4 sm:px-6 py-2 text-center">{error}</div> : null}
      </div>

      <main className="flex-1 w-full mx-auto px-2 sm:px-6 pl-2 sm:pl-[60px] py-6 space-y-10 overflow-x-auto" style={{ maxWidth: Math.max(1100, maxWidth + 200) }}>
        {data.documents.map((doc, di) => {
          const docFields = data.fields.filter((f) => f.documentId === doc.id);
          return (
            <section key={doc.id}>
              <div className="flex items-center gap-2 text-[12px] text-muted mb-2 px-1 flex-wrap">
                <span className="uppercase tracking-wide font-semibold text-[11px]">Document {di + 1} of {data.documents.length}</span>
                <span className="text-ink-2 font-medium inline-flex items-center gap-1"><FileText size={13} className="text-muted" />{doc.name}.pdf</span>
                <span>&middot; {doc.pageCount} {doc.pageCount === 1 ? "page" : "pages"}</span>
              </div>
              <PdfDocument
                url={`/api/s/${data.token}/documents/${doc.id}`}
                pageCount={doc.pageCount}
                maxWidth={maxWidth}
                pageClassName="overflow-visible"
                renderOverlay={(pageIndex: number, size: PageSize) => (
                  <>
                    <span className="absolute left-[3.5%] top-[1.2%] text-[#77706D] font-sans pointer-events-none select-none whitespace-nowrap" style={{ fontSize: Math.max(6, size.width * 0.0095) }}>{brand.name} Envelope ID: {data.envelope.idDisplay}</span>
                    <FieldOverlay
                      fields={docFields.filter((f) => f.page === pageIndex)}
                      size={size}
                      pageMeta={doc.pages[pageIndex]}
                      values={values}
                      missing={missing}
                      invalid={invalid}
                      hidden={hidden}
                      formulas={formulas}
                      readOnly={false}
                      adopted={adopted}
                      prefill={prefill}
                      token={data.token}
                      onChange={setValue}
                      onBlur={onBlur}
                      onSignatureClick={onSignatureClick}
                      onStampClick={onStampClick}
                      onRadio={onRadio}
                      onApprove={(f) => { setStarted(true); setValues((x) => ({ ...x, [f.id]: "approved" })); finish({ [f.id]: "approved" }); }}
                      onDecline={() => setDialog("decline")}
                      registerRef={(id, el) => { if (el) refs.current.set(id, el); else refs.current.delete(id); }}
                      nextTarget={nextTarget?.id ?? null}
                      onNext={() => { setStarted(true); if (nextTarget) scrollTo(nextTarget.id); }}
                      started={started}
                    />
                  </>
                )}
              />
            </section>
          );
        })}
        <div className={cn("bg-white border border-hairline rounded-xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 max-w-[1100px]", allDone ? "border-ok/40" : "")}>
          <div className="flex-1">
            <p className="font-medium">{allDone ? `You've completed all required fields. Select ${finishLabel.toUpperCase()} to continue.` : `${required.length - requiredDone} required ${required.length - requiredDone === 1 ? "field" : "fields"} left.`}</p>
            <p className="text-sm text-muted">Envelope ID {data.envelope.idDisplay}</p>
          </div>
          <Button size="lg" onClick={() => finish()} disabled={pending} className="uppercase tracking-wide text-[13px] font-semibold">{pending ? "Finishing..." : finishLabel}</Button>
        </div>
      </main>

      <AdoptSignatureDialog
        open={!!adoptFor}
        onOpenChange={(o) => { if (!o) setAdoptFor(null); }}
        token={data.token}
        defaultName={data.recipient.name}
        onAdopted={(a) => { setAdopted({ ...a, stampPng: adopted?.stampPng ?? null }); if (adoptFor) { if (adoptFor.type === "stamp") setStampFor(adoptFor); else stampSig(adoptFor); } setAdoptFor(null); }}
      />
      <AdoptStampDialog
        open={!!stampFor}
        onOpenChange={(o) => { if (!o) setStampFor(null); }}
        token={data.token}
        onAdopted={(png) => { setAdopted((a) => (a ? { ...a, stampPng: png } : a)); if (stampFor) setValue(stampFor.id, "stamped"); setStampFor(null); }}
      />
      {/* dialogs opened from field buttons (Decline) are rendered by OtherActions via the controlled `dialog` prop */}
      {children}
    </SignerFrame>
  );
}

// keep SignerDialogs referenced for tree-shaking clarity (rendered inside OtherActions)
void SignerDialogs;
