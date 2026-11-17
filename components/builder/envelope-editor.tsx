"use client";
import { brand } from "@/lib/brand";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  X, UploadCloud, FileText, Trash2, ChevronUp, ChevronDown, Plus, GripVertical, MoreHorizontal, KeyRound, MessageSquareText,
  UserPlus, Loader2, ChevronRight, Settings2, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FirstPageThumb } from "@/components/builder/first-page";
import {
  attachUploadAction, removeDocumentAction, renameDocumentAction, reorderDocumentsAction, saveDraftAction, searchContactsAction,
} from "@/lib/actions/envelopes";
import { updateTemplateHeaderAction } from "@/lib/actions/builder";
import { uploadPdf } from "@/lib/upload-client";
import { recipientColor } from "@/lib/colors";
import { ROLE_OPTIONS } from "@/components/builder/field-meta";
import type { RecipientRole } from "@/lib/types";
import { cn } from "@/lib/cn";

interface Doc { id: string; name: string; pageCount: number; fileId: string; position: number }
interface Rec {
  key: string;
  id: string | null;
  name: string;
  email: string;
  role: RecipientRole;
  routingOrder: number;
  colorIndex: number;
  templateRole: string | null;
  privateMessage: string | null;
  hasAccessCode: boolean;
  accessCode?: string | null; // undefined = unchanged
}
interface EnvelopeSettings {
  id: string; subject: string; message: string; signingOrder: boolean; reminderEnabled: boolean; reminderDelayDays: number; reminderFrequencyDays: number;
  expireAfterDays: number; expireWarnDays: number; allowReassign: boolean; allowComments: boolean; visibility: "workspace" | "private";
}

let keySeq = 0;
const newKey = () => `r${Date.now()}${keySeq++}`;

function blankRecipient(existing: { colorIndex: number }[], index: number, order: number, template: boolean): Rec {
  let c = 0;
  const used = new Set(existing.map((r) => r.colorIndex));
  while (used.has(c)) c++;
  return { key: newKey(), id: null, name: "", email: "", role: "signer", routingOrder: order, colorIndex: c, templateRole: template ? `Signer ${index + 1}` : null, privateMessage: null, hasAccessCode: false };
}

export function EnvelopeEditor(props: {
  me: { name: string; email: string };
  startOnlyMe?: boolean;
  template: { id: string; name: string; description: string; shared: boolean } | null;
  envelope: EnvelopeSettings;
  documents: Doc[];
  recipients: Omit<Rec, "key">[];
}) {
  const router = useRouter();
  const isTemplate = !!props.template;
  const [docs, setDocs] = useState<Doc[]>(props.documents);
  const [settings, setSettings] = useState<EnvelopeSettings>(props.envelope);
  const [recs, setRecs] = useState<Rec[]>(() => {
    const list = props.recipients.map((r) => ({ ...r, key: newKey() }));
    return list.length ? list : [blankRecipient([], 0, 1, isTemplate)];
  });
  const [tpl, setTpl] = useState(props.template);
  const [uploading, setUploading] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [preview, setPreview] = useState<Doc | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [onlyMe, setOnlyMe] = useState(() => !isTemplate && props.recipients.length === 1 && props.recipients[0].email.toLowerCase() === props.me.email.toLowerCase() && props.recipients[0].role === "signer" && (props.startOnlyMe ?? false));
  const [contactsOpen, setContactsOpen] = useState(false);
  useEffect(() => {
    if (props.startOnlyMe && !isTemplate) {
      setOnlyMe(true);
      setRecs([{ key: newKey(), id: props.recipients[0]?.id ?? null, name: props.me.name, email: props.me.email, role: "signer", routingOrder: 1, colorIndex: 0, templateRole: null, privateMessage: null, hasAccessCode: false }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usedColors = useMemo(() => new Set(recs.map((r) => r.colorIndex)), [recs]);


  async function onFiles(files: File[]) {
    setError(null);
    for (const f of files) {
      setUploading((u) => [...u, f.name]);
      try {
        const path = await uploadPdf(f);
        const res = await attachUploadAction(settings.id, path, f.name);
        if (!res.ok) throw new Error(res.error);
        const d = res.data!;
        setDocs((cur) => [...cur, { id: d.id, name: d.name, pageCount: d.pageCount, fileId: d.fileId, position: d.position }]);
        if (!settings.subject) setSettings((s) => ({ ...s, subject: s.subject || (isTemplate ? d.name : `Complete with ${brand.name}: ${d.name}`) }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading((u) => u.filter((n) => n !== f.name));
      }
    }
  }

  async function removeDoc(d: Doc) {
    const res = await removeDocumentAction(settings.id, d.id);
    if (!res.ok) return setError(res.error);
    setDocs((cur) => cur.filter((x) => x.id !== d.id));
  }
  async function moveDoc(i: number, dir: -1 | 1) {
    const next = [...docs];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setDocs(next);
    await reorderDocumentsAction(settings.id, next.map((d) => d.id));
  }
  async function renameDoc(d: Doc, name: string) {
    if (!name.trim() || name === d.name) return;
    setDocs((cur) => cur.map((x) => (x.id === d.id ? { ...x, name } : x)));
    await renameDocumentAction(settings.id, d.id, name);
  }

  function updateRec(key: string, patch: Partial<Rec>) {
    setRecs((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addRecipient(prefill?: Partial<Rec>) {
    setRecs((cur) => {
      let c = 0;
      while (cur.some((r) => r.colorIndex === c)) c++;
      const order = settings.signingOrder ? Math.max(0, ...cur.map((r) => r.routingOrder)) + 1 : 1;
      return [...cur, { key: newKey(), id: null, name: "", email: "", role: "signer", routingOrder: order, colorIndex: c, templateRole: isTemplate ? `Signer ${cur.length + 1}` : null, privateMessage: null, hasAccessCode: false, ...prefill }];
    });
  }
  function removeRecipient(key: string) {
    setRecs((cur) => cur.filter((r) => r.key !== key));
  }

  function validate(): string | null {
    if (!docs.length) return "Add at least one document.";
    if (!recs.length) return "Add at least one recipient.";
    for (const r of recs) {
      if (isTemplate) {
        if (!r.templateRole?.trim() && !r.name.trim()) return "Every role needs a name.";
        if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) return `"${r.email}" isn't a valid email.`;
      } else {
        if (!r.name.trim()) return "Every recipient needs a name.";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())) return `${r.name || "A recipient"} needs a valid email.`;
      }
    }
    if (!isTemplate && !settings.subject.trim()) return "Add an email subject.";
    return null;
  }

  async function save(next?: "fields" | "close") {
    setError(null);
    const problem = next === "fields" ? validate() : null;
    if (problem) { setError(problem); return; }
    startSaving(async () => {
      if (tpl) {
        const t = await updateTemplateHeaderAction(tpl.id, { name: tpl.name, description: tpl.description, shared: tpl.shared });
        if (!t.ok) { setError(t.error); return; }
      }
      const res = await saveDraftAction(
        settings.id,
        {
          subject: settings.subject, message: settings.message, signingOrder: settings.signingOrder, reminderEnabled: settings.reminderEnabled,
          reminderDelayDays: settings.reminderDelayDays, reminderFrequencyDays: settings.reminderFrequencyDays, expireAfterDays: settings.expireAfterDays,
          expireWarnDays: settings.expireWarnDays, allowReassign: settings.allowReassign, allowComments: settings.allowComments, visibility: settings.visibility,
        },
        recs.map((r, i) => ({
          id: r.id, name: r.name, email: r.email, role: r.role, routingOrder: settings.signingOrder ? r.routingOrder : 1, templateRole: isTemplate ? (r.templateRole || r.name || `Role ${i + 1}`) : r.templateRole,
          privateMessage: r.privateMessage, accessCode: r.accessCode, colorIndex: r.colorIndex,
        })),
      );
      if (!res.ok) { setError(res.error); return; }
      const saved = res.data?.recipients;
      if (saved) setRecs((cur) => saved.map((s, i) => ({ ...(cur[i] ?? cur[0]), id: s.id, colorIndex: s.colorIndex, accessCode: undefined, hasAccessCode: cur[i]?.accessCode ? true : cur[i]?.accessCode === "" ? false : cur[i]?.hasAccessCode ?? false })));
      if (next === "fields") router.push(`/envelopes/${settings.id}/fields`);
      if (next === "close") router.push(isTemplate ? "/templates" : "/agreements?folder=drafts");
    });
  }

  // Cmd/Ctrl+S saves
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); save(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  return (
    <div className="min-h-screen flex flex-col">
      <header className="min-h-14 bg-white border-b border-hairline sticky top-0 z-30 flex flex-wrap items-center px-3 sm:px-4 py-2 gap-2 sm:gap-3">
        <button onClick={() => save("close")} className="p-2 rounded hover:bg-paper-2" aria-label="Save and close"><X size={18} /></button>
        <div className="flex items-center gap-1.5">
          <img src={brand.mark} alt="" className="h-6" />
          <span className="font-serif text-[20px] text-rose-ink leading-none mt-0.5">Sign</span>
        </div>
        <span className="h-5 w-px bg-hairline mx-1" />
        <div className="hidden sm:block text-sm font-medium truncate">{isTemplate ? `Edit template: ${tpl?.name || "Untitled"}` : "Prepare envelope"}</div>
        <Steps current={0} isTemplate={isTemplate} />
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" onClick={() => save("close")} disabled={saving}>Save and close</Button>
          <Button onClick={() => save("fields")} disabled={saving || uploading.length > 0}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : null} Next
          </Button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[920px] mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-5 sm:space-y-6 pb-32">
        {error ? <div className="rounded-md border border-bad/30 bg-bad-bg text-bad text-sm px-4 py-3">{error}</div> : null}

        {tpl ? (
          <Section title="Template details" icon={<Settings2 size={18} />}>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Template name</Label>
                <Input value={tpl.name} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} placeholder="SaaS Services Order Form" />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input value={tpl.description} onChange={(e) => setTpl({ ...tpl, description: e.target.value })} placeholder="What it's for" />
              </div>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={tpl.shared} onChange={(e) => setTpl({ ...tpl, shared: e.target.checked })} className="accent-ink h-4 w-4" />
              Share with everyone in this workspace
            </label>
          </Section>
        ) : null}

        <Section title="Add documents" icon={<FileText size={18} />}>
          <div className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
            {docs.map((d, i) => (
              <div key={d.id} className="group rounded-lg border border-hairline bg-white overflow-hidden">
                <button onClick={() => setPreview(d)} className="block w-full h-[200px] bg-paper overflow-hidden relative" aria-label={`Preview ${d.name}`}>
                  <div className="absolute inset-0 flex justify-center pt-3 pointer-events-none"><FirstPage fileId={d.fileId} /></div>
                </button>
                <div className="p-3 border-t border-hairline-2">
                  <input defaultValue={d.name} onBlur={(e) => renameDoc(d, e.target.value)} className="w-full text-sm font-medium bg-transparent outline-none focus:bg-paper rounded px-1 -mx-1" />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted">{d.pageCount} {d.pageCount === 1 ? "page" : "pages"}</span>
                    <Menu>
                      <MenuTrigger className="p-1 rounded hover:bg-paper-2" aria-label="Document actions"><MoreHorizontal size={16} /></MenuTrigger>
                      <MenuContent>
                        <MenuItem onSelect={() => setPreview(d)}><FileText size={15} /> View</MenuItem>
                        <MenuItem onSelect={() => moveDoc(i, -1)} disabled={i === 0}><ChevronUp size={15} /> Move earlier</MenuItem>
                        <MenuItem onSelect={() => moveDoc(i, 1)} disabled={i === docs.length - 1}><ChevronDown size={15} /> Move later</MenuItem>
                        <MenuSeparator />
                        <MenuItem danger onSelect={() => removeDoc(d)}><Trash2 size={15} /> Delete</MenuItem>
                      </MenuContent>
                    </Menu>
                  </div>
                </div>
              </div>
            ))}
            {uploading.map((n) => (
              <div key={n} className="rounded-lg border border-hairline bg-white h-[262px] flex flex-col items-center justify-center text-center p-4">
                <Loader2 className="animate-spin text-muted" />
                <div className="text-xs text-muted mt-2 break-all">Uploading {n}</div>
              </div>
            ))}
            <div
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(Array.from(e.dataTransfer.files)); }}
              onClick={() => fileInput.current?.click()}
              className={cn("rounded-lg border-2 border-dashed h-[262px] flex flex-col items-center justify-center text-center p-4 cursor-pointer transition-colors", over ? "border-ink bg-white" : "border-hairline hover:border-ink-2")}
            >
              <UploadCloud size={30} className="text-muted" strokeWidth={1.4} />
              <div className="text-sm font-medium mt-2">Drop documents here</div>
              <div className="text-xs text-muted mt-1">or click to upload a PDF</div>
              <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => { onFiles(Array.from(e.target.files || [])); e.target.value = ""; }} />
            </div>
          </div>
        </Section>

        <Section
          title={isTemplate ? "Add roles" : "Add recipients"}
          icon={<Users size={18} />}
          right={
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="accent-ink h-4 w-4" checked={settings.signingOrder} onChange={(e) => {
                const on = e.target.checked;
                setSettings((s) => ({ ...s, signingOrder: on }));
                if (on) setRecs((cur) => cur.map((r, i) => ({ ...r, routingOrder: i + 1 })));
              }} />
              Set signing order
            </label>
          }
        >
          {!isTemplate ? (
            <label className="flex items-center gap-2 text-sm mb-4 cursor-pointer">
              <input type="checkbox" className="accent-ink h-4 w-4" checked={onlyMe} onChange={(e) => {
                const on = e.target.checked;
                setOnlyMe(on);
                if (on) setRecs([{ key: newKey(), id: recs.find((r) => r.email.toLowerCase() === props.me.email.toLowerCase())?.id ?? null, name: props.me.name, email: props.me.email, role: "signer", routingOrder: 1, colorIndex: 0, templateRole: null, privateMessage: null, hasAccessCode: false }]);
                else if (recs.length === 1 && recs[0].email.toLowerCase() === props.me.email.toLowerCase()) setRecs([blankRecipient([], 0, 1, false)]);
              }} />
              I&apos;m the only signer
            </label>
          ) : null}
          {onlyMe ? (
            <p className="text-sm text-muted">You&apos;ll sign this yourself right after you add your fields. Nobody else gets an email.</p>
          ) : null}
          <div className={cn("space-y-3", onlyMe && "hidden")}>
            {recs.map((r, i) => (
              <RecipientCard
                key={r.key}
                r={r}
                index={i}
                isTemplate={isTemplate}
                signingOrder={settings.signingOrder}
                canDelete={recs.length > 1}
                onChange={(p) => updateRec(r.key, p)}
                onDelete={() => removeRecipient(r.key)}
                onMove={(dir) => setRecs((cur) => {
                  const next = [...cur]; const j = i + dir; if (j < 0 || j >= next.length) return cur;
                  [next[i], next[j]] = [next[j], next[i]];
                  return settings.signingOrder ? next.map((x, k) => ({ ...x, routingOrder: k + 1 })) : next;
                })}
              />
            ))}
          </div>
          <div className={cn("mt-4 flex items-center gap-2 flex-wrap", onlyMe && "hidden")}>
            <Button variant="secondary" onClick={() => addRecipient()}><Plus size={15} /> {isTemplate ? "Add role" : "Add recipient"}</Button>
            {!isTemplate ? <Button variant="ghost" onClick={() => setContactsOpen(true)}><Users size={15} /> Add from contacts</Button> : null}
            {!isTemplate && !recs.some((r) => r.email.toLowerCase() === props.me.email.toLowerCase()) ? (
              <Button variant="ghost" onClick={() => {
                const empty = recs.find((r) => !r.name && !r.email);
                if (empty) updateRec(empty.key, { name: props.me.name, email: props.me.email });
                else addRecipient({ name: props.me.name, email: props.me.email });
              }}><UserPlus size={15} /> Add me</Button>
            ) : null}
          </div>
          {usedColors.size > 0 ? null : null}
        </Section>

        <Section title="Add message" icon={<MessageSquareText size={18} />}>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between"><Label>Email subject</Label><span className="text-xs text-muted">{settings.subject.length}/100</span></div>
              <Input value={settings.subject} maxLength={100} onChange={(e) => setSettings((s) => ({ ...s, subject: e.target.value }))} placeholder={`Complete with ${brand.name}: Order Form`} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between"><Label>Email message</Label><span className="text-xs text-muted">{settings.message.length}/10000</span></div>
              <Textarea rows={5} maxLength={10000} value={settings.message} onChange={(e) => setSettings((s) => ({ ...s, message: e.target.value }))} placeholder="Enter a message for all recipients" />
            </div>
          </div>
        </Section>

        <div className="rounded-xl border border-hairline bg-white">
          <button className="w-full flex items-center gap-2 px-6 py-4 text-left" onClick={() => setShowAdvanced((v) => !v)}>
            <ChevronRight size={16} className={cn("transition-transform", showAdvanced && "rotate-90")} />
            <span className="font-semibold">Advanced options</span>
            <span className="text-sm text-muted ml-2">Reminders, expiration, sharing</span>
          </button>
          {showAdvanced ? (
            <div className="px-6 pb-6 grid sm:grid-cols-2 gap-6 border-t border-hairline-2 pt-5">
              <div className="space-y-3">
                <div className="text-sm font-semibold">Reminders</div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ink h-4 w-4" checked={settings.reminderEnabled} onChange={(e) => setSettings((s) => ({ ...s, reminderEnabled: e.target.checked }))} /> Send automatic reminders</label>
                <div className="flex items-center gap-2 text-sm">First reminder after <NumberBox value={settings.reminderDelayDays} onChange={(v) => setSettings((s) => ({ ...s, reminderDelayDays: v }))} /> days</div>
                <div className="flex items-center gap-2 text-sm">Then every <NumberBox value={settings.reminderFrequencyDays} onChange={(v) => setSettings((s) => ({ ...s, reminderFrequencyDays: v }))} /> days</div>
              </div>
              <div className="space-y-3">
                <div className="text-sm font-semibold">Expiration</div>
                <div className="flex items-center gap-2 text-sm">Expires after <NumberBox value={settings.expireAfterDays} onChange={(v) => setSettings((s) => ({ ...s, expireAfterDays: v }))} max={999} /> days</div>
                <div className="flex items-center gap-2 text-sm">Warn recipients <NumberBox value={settings.expireWarnDays} onChange={(v) => setSettings((s) => ({ ...s, expireWarnDays: v }))} /> days before</div>
              </div>
              <div className="space-y-3">
                <div className="text-sm font-semibold">Recipient permissions</div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ink h-4 w-4" checked={settings.allowReassign} onChange={(e) => setSettings((s) => ({ ...s, allowReassign: e.target.checked }))} /> Allow recipients to assign to someone else</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ink h-4 w-4" checked={settings.allowComments} onChange={(e) => setSettings((s) => ({ ...s, allowComments: e.target.checked }))} /> Allow comments</label>
              </div>
              <div className="space-y-3">
                <div className="text-sm font-semibold">Who on the team can see it</div>
                <NativeSelect value={settings.visibility} onChange={(e) => setSettings((s) => ({ ...s, visibility: e.target.value as "workspace" | "private" }))}>
                  <option value="workspace">Everyone in this workspace</option>
                  <option value="private">Only me and people I share with</option>
                </NativeSelect>
              </div>
            </div>
          ) : null}
        </div>
      </main>

      <ContactsDialog open={contactsOpen} onClose={() => setContactsOpen(false)} onPick={(c) => { const empty = recs.find((r) => !r.name && !r.email); if (empty) updateRec(empty.key, { name: c.name, email: c.email }); else addRecipient({ name: c.name, email: c.email }); }} />

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        {preview ? (
          <DialogContent title={preview.name} wide>
            <div className="max-h-[70vh] overflow-y-auto bg-paper p-4 rounded">
              <PreviewDoc fileId={preview.fileId} />
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function Steps({ current, isTemplate }: { current: number; isTemplate: boolean }) {
  const steps = isTemplate ? ["Documents and roles", "Fields"] : ["Documents and recipients", "Fields", "Send"];
  return (
    <ol className="hidden lg:flex items-center gap-2 ml-6 text-[13px]">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className={cn("h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-semibold", i <= current ? "bg-ink text-white" : "bg-paper-2 text-muted")}>{i + 1}</span>
          <span className={i === current ? "text-ink font-medium" : "text-muted"}>{s}</span>
          {i < steps.length - 1 ? <span className="w-6 h-px bg-hairline" /> : null}
        </li>
      ))}
    </ol>
  );
}

function Section({ title, icon, right, children }: { title: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-hairline bg-white">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-hairline-2">
        <span className="text-ink-2">{icon}</span>
        <h2 className="font-semibold">{title}</h2>
        <div className="ml-auto">{right}</div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

function NumberBox({ value, onChange, max = 60 }: { value: number; onChange: (v: number) => void; max?: number }) {
  return <input type="number" min={0} max={max} value={value} onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))} className="h-8 w-16 rounded border border-hairline px-2 text-sm" />;
}

function RecipientCard({ r, index, isTemplate, signingOrder, canDelete, onChange, onDelete, onMove }: {
  r: Rec; index: number; isTemplate: boolean; signingOrder: boolean; canDelete: boolean;
  onChange: (p: Partial<Rec>) => void; onDelete: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const color = recipientColor(r.colorIndex);
  const [suggest, setSuggest] = useState<{ name: string; email: string }[]>([]);
  const [focus, setFocus] = useState<"name" | "email" | null>(null);
  const [showCode, setShowCode] = useState(r.hasAccessCode || false);
  const [showNote, setShowNote] = useState(!!r.privateMessage);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function lookup(q: string) {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setSuggest([]); return; }
    timer.current = setTimeout(async () => {
      const res = await searchContactsAction(q);
      if (res.ok) setSuggest(res.data ?? []);
    }, 180);
  }

  return (
    <div className="relative rounded-lg border border-hairline bg-white flex">
      <div className="w-1.5 rounded-l-lg shrink-0" style={{ background: color.solid }} />
      {signingOrder ? (
        <div className="flex flex-col items-center justify-center gap-1 px-2 border-r border-hairline-2">
          <button onClick={() => onMove(-1)} className="text-muted hover:text-ink" aria-label="Move up"><ChevronUp size={14} /></button>
          <input value={r.routingOrder} onChange={(e) => onChange({ routingOrder: Math.max(1, Number(e.target.value) || 1) })} className="w-8 h-7 text-center text-sm border border-hairline rounded" aria-label="Signing order" />
          <button onClick={() => onMove(1)} className="text-muted hover:text-ink" aria-label="Move down"><ChevronDown size={14} /></button>
        </div>
      ) : (
        <div className="flex items-center px-2 text-muted"><GripVertical size={16} /></div>
      )}
      <div className="flex-1 p-4 space-y-3 min-w-0">
        <div className="grid sm:grid-cols-[1fr_1fr_190px] gap-3">
          {isTemplate ? (
            <div className="space-y-1.5 sm:col-span-3 sm:max-w-[320px]">
              <Label>Role</Label>
              <Input value={r.templateRole ?? ""} onChange={(e) => onChange({ templateRole: e.target.value })} placeholder="Customer" />
            </div>
          ) : null}
          <div className="space-y-1.5 relative">
            <Label>{isTemplate ? "Name (optional)" : "Name"} {!isTemplate ? <span className="text-bad">*</span> : null}</Label>
            <Input value={r.name} onFocus={() => setFocus("name")} onBlur={() => setTimeout(() => setFocus(null), 150)} onChange={(e) => { onChange({ name: e.target.value }); lookup(e.target.value); }} placeholder="Full name" autoComplete="off" />
            {focus === "name" && suggest.length ? <Suggestions list={suggest} onPick={(s) => { onChange({ name: s.name, email: s.email }); setSuggest([]); }} /> : null}
          </div>
          <div className="space-y-1.5 relative">
            <Label>{isTemplate ? "Email (optional)" : "Email"} {!isTemplate ? <span className="text-bad">*</span> : null}</Label>
            <Input value={r.email} type="email" onFocus={() => setFocus("email")} onBlur={() => setTimeout(() => setFocus(null), 150)} onChange={(e) => { onChange({ email: e.target.value }); lookup(e.target.value); }} placeholder="name@company.com" autoComplete="off" />
            {focus === "email" && suggest.length ? <Suggestions list={suggest} onPick={(s) => { onChange({ name: s.name, email: s.email }); setSuggest([]); }} /> : null}
          </div>
          <div className="space-y-1.5">
            <Label>Action</Label>
            <NativeSelect className="w-full" value={r.role} onChange={(e) => onChange({ role: e.target.value as RecipientRole })}>
              {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              <option disabled>In Person Signer (coming soon)</option>
            </NativeSelect>
          </div>
        </div>
        {showCode ? (
          <div className="flex items-center gap-2">
            <KeyRound size={15} className="text-muted" />
            <Input className="max-w-[260px]" placeholder={r.hasAccessCode ? "Access code set (type to change)" : "Access code"} value={r.accessCode ?? ""} onChange={(e) => onChange({ accessCode: e.target.value })} />
            <span className="text-xs text-muted">Share it with them outside email.</span>
            <button className="text-xs text-rose-ink hover:underline" onClick={() => { onChange({ accessCode: "" }); setShowCode(false); }}>Remove</button>
          </div>
        ) : null}
        {showNote ? (
          <div className="space-y-1.5">
            <Label>Private message for {r.name || "this recipient"}</Label>
            <Textarea rows={2} value={r.privateMessage ?? ""} onChange={(e) => onChange({ privateMessage: e.target.value })} />
          </div>
        ) : null}
      </div>
      <div className="flex flex-col items-center gap-1 p-2">
        <Menu>
          <MenuTrigger className="p-1.5 rounded hover:bg-paper-2 text-sm text-ink-2 flex items-center gap-1" aria-label="Customize">Customize <ChevronDown size={13} /></MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={() => setShowCode(true)}><KeyRound size={15} /> Add access code</MenuItem>
            <MenuItem onSelect={() => setShowNote(true)}><MessageSquareText size={15} /> Add private message</MenuItem>
          </MenuContent>
        </Menu>
        {canDelete ? <button onClick={onDelete} className="p-1.5 rounded text-muted hover:text-bad hover:bg-paper-2" aria-label={`Remove recipient ${index + 1}`}><Trash2 size={16} /></button> : null}
      </div>
    </div>
  );
}

function Suggestions({ list, onPick }: { list: { name: string; email: string }[]; onPick: (s: { name: string; email: string }) => void }) {
  return (
    <div className="absolute z-20 left-0 right-0 top-full mt-1 rounded-md border border-hairline bg-white shadow-lg py-1">
      {list.map((s) => (
        <button key={s.email} onMouseDown={(e) => { e.preventDefault(); onPick(s); }} className="w-full text-left px-3 py-2 hover:bg-paper-2">
          <div className="text-sm">{s.name}</div>
          <div className="text-xs text-muted">{s.email}</div>
        </button>
      ))}
    </div>
  );
}

function FirstPage({ fileId }: { fileId: string }) {
  return <FirstPageThumb url={`/api/files/${fileId}`} width={140} />;
}

function PreviewDoc({ fileId }: { fileId: string }) {
  const [Comp, setComp] = useState<null | typeof import("@/components/pdf/pdf-document").PdfDocument>(null);
  useEffect(() => { import("@/components/pdf/pdf-document").then((m) => setComp(() => m.PdfDocument)); }, []);
  if (!Comp) return <div className="text-sm text-muted p-6">Loading...</div>;
  return <Comp url={`/api/files/${fileId}`} maxWidth={680} />;
}

function ContactsDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (c: { name: string; email: string }) => void }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<{ name: string; email: string }[]>([]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    searchContactsAction(q || "a").then((r) => { if (alive && r.ok) setList(r.data ?? []); });
    return () => { alive = false; };
  }, [q, open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Add from contacts" description="People you've sent to before and your team.">
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" />
        <ul className="mt-3 max-h-[320px] overflow-y-auto divide-y divide-hairline-2 border border-hairline rounded-md">
          {list.length === 0 ? <li className="px-3 py-6 text-sm text-muted text-center">No matches</li> : null}
          {list.map((c) => (
            <li key={c.email}>
              <button className="w-full text-left px-3 py-2.5 hover:bg-paper-2 flex items-center justify-between gap-3" onClick={() => { onPick(c); onClose(); }}>
                <span><span className="block text-sm">{c.name}</span><span className="block text-xs text-muted">{c.email}</span></span>
                <Plus size={15} className="text-muted" />
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
