"use client";
import { brand } from "@/lib/brand";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X, PenLine, Type, Calendar, User, Mail, Building2, BadgeCheck, CheckSquare, CircleDot, ChevronDown, StickyNote, Hash,
  CalendarDays, Trash2, Copy, Loader2, ArrowLeft, Check, AlertCircle, ListFilter, Signature, Stamp, Brush, Sigma, Paperclip, ThumbsUp, ThumbsDown,
  Undo2, Redo2, ZoomIn, ZoomOut, Bold, Italic, Underline, ChevronRight, Plus, Minus, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "@/components/ui/menu";
import { PdfDocument } from "@/components/pdf/pdf-document";
import { saveFieldsAction, sendEnvelopeAction } from "@/lib/actions/envelopes";
import { touchTemplateAction } from "@/lib/actions/builder";
import { FIELD_META, FIELD_GROUPS, fieldMeta } from "@/components/builder/field-meta";
import { recipientColor } from "@/lib/colors";
import type { FieldOptions, FieldType, PageMeta, RecipientRole } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/use-media";
import { Sheet } from "@/components/ui/sheet";

interface Doc { id: string; name: string; fileId: string; pageCount: number; pages: PageMeta[] }
interface Rec { id: string; name: string; email: string; role: RecipientRole; colorIndex: number; templateRole: string | null; routingOrder: number }
export interface TagField {
  id: string; documentId: string; recipientId: string; type: FieldType; page: number;
  x: number; y: number; width: number; height: number; required: boolean; readOnly: boolean;
  label: string | null; options: FieldOptions; value: string | null;
}

const ICONS: Record<FieldType, React.ComponentType<{ size?: number; className?: string }>> = {
  signature: Signature, initials: PenLine, stamp: Stamp, date_signed: Calendar, name: User, first_name: User, last_name: User, email: Mail,
  company: Building2, title: BadgeCheck, text: Type, number: Hash, date: CalendarDays, checkbox: CheckSquare, radio: CircleDot,
  dropdown: ListFilter, note: StickyNote, drawing: Brush, formula: Sigma, attachment: Paperclip, approve: ThumbsUp, decline: ThumbsDown,
};
const TEXTUAL: FieldType[] = ["text", "number", "date", "company", "title", "formula", "name", "first_name", "last_name", "email", "date_signed", "dropdown"];
const AUTO: FieldType[] = ["date_signed", "name", "first_name", "last_name", "email"];
const NO_REQUIRED: FieldType[] = [...AUTO, "note", "formula", "approve", "decline"];

const DRAG_MIME = "application/x-imagine-field";
let seq = 0;
const tmpId = () => `tmp_${Date.now().toString(36)}_${seq++}`;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
function recLabel(r: Rec) {
  return r.name || r.templateRole || r.email || "Recipient";
}

export function FieldTagger(props: {
  envelopeId: string;
  subject: string;
  isTemplate: boolean;
  templateId: string | null;
  documents: Doc[];
  recipients: Rec[];
  fields: TagField[];
}) {
  const router = useRouter();
  const fieldRecipients = props.recipients.filter((r) => r.role === "signer" || r.role === "approver");
  const [fields, setFieldsRaw] = useState<TagField[]>(props.fields);
  const [selected, setSelected] = useState<string[]>([]);
  const [current, setCurrent] = useState<string>(fieldRecipients[0]?.id ?? "");
  const [placing, setPlacing] = useState<FieldType | null>(null);
  const [status, setStatus] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [paletteQ, setPaletteQ] = useState("");
  const [, bump] = useState(0);
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [sheet, setSheet] = useState<null | "fields" | "props" | "pages">(null);
  const clipboard = useRef<TagField[]>([]);
  const history = useRef<{ past: TagField[][]; future: TagField[][] }>({ past: [], future: [] });
  const pageRefs = useRef<Record<string, React.MutableRefObject<(HTMLDivElement | null)[]>>>({});
  for (const d of props.documents) if (!pageRefs.current[d.id]) pageRefs.current[d.id] = { current: [] };

  const recById = useMemo(() => new Map(props.recipients.map((r) => [r.id, r])), [props.recipients]);
  const docById = useMemo(() => new Map(props.documents.map((d) => [d.id, d])), [props.documents]);
  const sel = fields.filter((f) => selected.includes(f.id));
  const one = sel.length === 1 ? sel[0] : null;

  // ---------------------------------------------------------------- saving
  const latest = useRef(fields);
  latest.current = fields;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<Promise<boolean> | null>(null);

  const doSave = useCallback(async (): Promise<boolean> => {
    setStatus("saving");
    const payload = latest.current.map((f) => ({
      documentId: f.documentId, recipientId: f.recipientId, type: f.type, page: f.page, x: f.x, y: f.y, width: f.width, height: f.height,
      required: f.required, readOnly: f.readOnly, label: f.label, options: f.options, value: f.value,
    }));
    const res = await saveFieldsAction(props.envelopeId, payload);
    if (!res.ok) { setStatus("error"); setSaveError(res.error); return false; }
    setSaveError(null);
    setStatus((s) => (s === "saving" ? "saved" : s));
    return true;
  }, [props.envelopeId]);

  const markDirty = useCallback(() => {
    setStatus("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saving.current = doSave(); }, 900);
  }, [doSave]);

  async function flush(): Promise<boolean> {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (saving.current) await saving.current;
    return doSave();
  }

  /** Every edit goes through here so undo/redo and autosave stay in sync. */
  const commit = useCallback((next: TagField[] | ((cur: TagField[]) => TagField[])) => {
    const cur = latest.current;
    const n = typeof next === "function" ? next(cur) : next;
    history.current.past.push(cur);
    if (history.current.past.length > 100) history.current.past.shift();
    history.current.future = [];
    latest.current = n;
    setFieldsRaw(n);
    markDirty();
  }, [markDirty]);
  function undo() {
    const prev = history.current.past.pop();
    if (!prev) return;
    history.current.future.push(latest.current);
    latest.current = prev;
    setFieldsRaw(prev);
    markDirty();
  }
  function redo() {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(latest.current);
    latest.current = next;
    setFieldsRaw(next);
    markDirty();
  }
  function update(ids: string[], patch: Partial<TagField> | ((f: TagField) => Partial<TagField>)) {
    commit((cur) => cur.map((f) => (ids.includes(f.id) ? { ...f, ...(typeof patch === "function" ? patch(f) : patch) } : f)));
  }
  function remove(ids: string[]) {
    commit((cur) => cur.filter((f) => !ids.includes(f.id)));
    setSelected([]);
  }

  // ---------------------------------------------------------------- placing
  function createField(type: FieldType, docId: string, page: number, cx: number, cy: number) {
    const doc = docById.get(docId);
    if (!doc) return;
    const rec = recById.get(current) ?? fieldRecipients[0];
    if (!rec) return;
    const pm = doc.pages[page] ?? doc.pages[0];
    const meta = fieldMeta(type);
    const w = Math.min(0.9, meta.w / pm.width);
    const h = Math.min(0.5, meta.h / pm.height);
    // place the field's top-left under the cursor (what people expect when clicking a spot), clamp to the page
    const x = clamp(cx - 0.004, 0, 1 - w);
    const y = clamp(cy - h / 2, 0, 1 - h);
    const options: FieldOptions = {};
    if (type === "dropdown") options.choices = ["Option 1", "Option 2"];
    if (type === "radio") {
      const lastRadio = [...latest.current].reverse().find((f) => f.type === "radio" && f.recipientId === rec.id);
      options.group = lastRadio?.options.group || "Radio Group 1";
      const n = latest.current.filter((f) => f.type === "radio" && f.options.group === options.group).length + 1;
      options.optionValue = `Option ${n}`;
    }
    if (type === "note") options.placeholder = "Note to recipient";
    if (type === "formula") { options.formula = ""; options.decimals = 2; }
    if (type === "attachment") { options.accept = ".pdf,.png,.jpg,.jpeg"; options.maxMb = 25; }
    const count = latest.current.filter((f) => f.type === type).length + 1;
    const label = ["text", "number", "date", "company", "title", "dropdown", "checkbox", "formula", "drawing", "attachment"].includes(type) ? `${meta.label} ${count}` : null;
    const f: TagField = {
      id: tmpId(), documentId: docId, recipientId: rec.id, type, page, x, y, width: w, height: h,
      required: !NO_REQUIRED.includes(type) && type !== "checkbox" && type !== "radio", readOnly: false, label, options, value: type === "note" ? "" : null,
    };
    commit((cur) => [...cur, f]);
    setSelected([f.id]);
    setPlacing(null);
  }

  // ---------------------------------------------------------------- dragging / resizing
  const drag = useRef<null | { ids: string[]; mode: "move" | "resize"; startX: number; startY: number; orig: Map<string, TagField>; before: TagField[]; pw: number; ph: number; moved: boolean }>(null);

  function startDrag(e: React.PointerEvent, f: TagField, mode: "move" | "resize", size: { width: number; height: number }) {
    e.stopPropagation();
    e.preventDefault();
    const ids = selected.includes(f.id) && mode === "move" ? selected : [f.id];
    if (!selected.includes(f.id)) setSelected(e.shiftKey ? [...selected, f.id] : [f.id]);
    const orig = new Map(latest.current.filter((x) => ids.includes(x.id)).map((x) => [x.id, x]));
    drag.current = { ids, mode, startX: e.clientX, startY: e.clientY, orig, before: latest.current, pw: size.width, ph: size.height, moved: false };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }
  function onMove(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / d.pw;
    const dy = (e.clientY - d.startY) / d.ph;
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 2) d.moved = true;
    const next = latest.current.map((f) => {
      const o = d.orig.get(f.id);
      if (!o) return f;
      if (d.mode === "move") return { ...f, x: clamp(o.x + dx, 0, 1 - f.width), y: clamp(o.y + dy, 0, 1 - f.height) };
      const square = f.type === "checkbox" || f.type === "radio";
      let w = clamp(o.width + dx, 0.012, 1 - f.x);
      let h = clamp(o.height + dy, 0.008, 1 - f.y);
      if (square) { const s = Math.max(w * d.pw, h * d.ph); w = s / d.pw; h = s / d.ph; }
      return { ...f, width: w, height: h };
    });
    latest.current = next;
    setFieldsRaw(next);
  }
  function onUp() {
    window.removeEventListener("pointermove", onMove);
    const d = drag.current;
    if (d?.moved) {
      history.current.past.push(d.before);
      history.current.future = [];
      markDirty();
      bump((n) => n + 1);
    }
    drag.current = null;
  }

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "Escape") { setPlacing(null); setSelected([]); return; }
      if (typing) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (meta && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (meta && e.key.toLowerCase() === "a") { e.preventDefault(); setSelected(latest.current.map((f) => f.id)); return; }
      const ids = selected;
      if ((e.key === "Delete" || e.key === "Backspace") && ids.length) { e.preventDefault(); remove(ids); return; }
      if (meta && e.key.toLowerCase() === "c" && ids.length) { clipboard.current = latest.current.filter((f) => ids.includes(f.id)); return; }
      if (meta && e.key.toLowerCase() === "v" && clipboard.current.length) {
        e.preventDefault();
        const copies = clipboard.current.map((c) => ({ ...c, id: tmpId(), x: clamp(c.x + 0.02, 0, 1 - c.width), y: clamp(c.y + 0.02, 0, 1 - c.height) }));
        clipboard.current = copies;
        commit((cur) => [...cur, ...copies]);
        setSelected(copies.map((c) => c.id));
        return;
      }
      if (ids.length && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 0.01 : 0.002;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        update(ids, (f) => ({ x: clamp(f.x + dx, 0, 1 - f.width), y: clamp(f.y + dy, 0, 1 - f.height) }));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (status === "dirty" || status === "saving") e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [status]);

  // ---------------------------------------------------------------- actions
  async function send() {
    setSendError(null);
    setSending(true);
    const ok = await flush();
    if (!ok) { setSending(false); return; }
    if (props.isTemplate) { await touchTemplateAction(props.envelopeId); router.push("/templates"); return; }
    const res = await sendEnvelopeAction(props.envelopeId);
    if (!res.ok) { setSendError(res.error); setSending(false); return; }
    router.push(`/envelopes/${props.envelopeId}/sent`);
  }
  async function back() { await flush(); router.push(`/envelopes/${props.envelopeId}/prepare`); }
  async function close() { await flush(); router.push(props.isTemplate ? "/templates" : "/agreements?folder=drafts"); }
  function scrollToPage(docId: string, page: number) { pageRefs.current[docId]?.current[page]?.scrollIntoView({ behavior: "smooth", block: "start" }); }

  const counts = useMemo(() => { const m = new Map<string, number>(); for (const f of fields) m.set(f.recipientId, (m.get(f.recipientId) ?? 0) + 1); return m; }, [fields]);
  const missingSig = !props.isTemplate ? props.recipients.filter((r) => r.role === "signer" && !fields.some((f) => f.recipientId === r.id && (f.type === "signature" || f.type === "initials"))) : [];
  const currentRec = recById.get(current);
  const labels = useMemo(() => [...new Set(fields.map((f) => f.label).filter(Boolean) as string[])], [fields]);
  const palette = FIELD_META.filter((m) => !paletteQ || m.label.toLowerCase().includes(paletteQ.toLowerCase()));
  const textSel = sel.filter((f) => TEXTUAL.includes(f.type));
  const textIds = textSel.map((f) => f.id);
  useEffect(() => { if (!desktop && one && !placing) setSheet("props"); }, [one?.id, desktop]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-paper">
      {/* top bar */}
      <header className="h-14 bg-white border-b border-hairline flex items-center px-4 gap-3 shrink-0">
        <button onClick={close} className="p-2 rounded hover:bg-paper-2" aria-label="Save and close"><X size={18} /></button>
        <div className="flex items-center gap-1.5">
          <img src={brand.mark} alt="" className="h-6" />
          <span className="font-serif text-[20px] text-rose-ink leading-none mt-0.5">Sign</span>
        </div>
        <span className="h-5 w-px bg-hairline mx-1" />
        <div className="hidden sm:block text-sm font-medium truncate max-w-[300px]">{props.subject}</div>
        <span className="hidden sm:inline-flex"><SaveIndicator status={status} error={saveError} /></span>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="icon" onClick={undo} disabled={!history.current.past.length} aria-label="Undo"><Undo2 size={16} /></Button>
          <Button variant="ghost" size="icon" onClick={redo} disabled={!history.current.future.length} aria-label="Redo"><Redo2 size={16} /></Button>
          <span className="h-5 w-px bg-hairline mx-1 hidden sm:block" />
          <Button variant="secondary" onClick={back} className="hidden sm:inline-flex"><ArrowLeft size={15} /> Back</Button>
          <Button onClick={send} disabled={sending}>{sending ? <Loader2 size={15} className="animate-spin" /> : null}{props.isTemplate ? "Save and close" : "Send"}</Button>
        </div>
      </header>

      {/* formatting bar */}
      <div className="min-h-11 bg-white border-b border-hairline flex flex-wrap items-center px-3 sm:px-4 py-1 gap-1.5 sm:gap-2 shrink-0 text-sm">
        <span className="hidden sm:inline text-xs text-muted mr-1">Formatting</span>
        <NativeSelect className="h-8 text-xs w-[130px]" disabled={!textSel.length} value={one?.options.font ?? ""} onChange={(e) => update(textIds, (f) => ({ options: { ...f.options, font: (e.target.value || undefined) as FieldOptions["font"] } }))}>
          <option value="">Helvetica</option><option value="times">Times New Roman</option><option value="courier">Courier</option>
        </NativeSelect>
        <NativeSelect className="h-8 text-xs w-[72px]" disabled={!textSel.length} value={String(one?.options.fontSize ?? "")} onChange={(e) => update(textIds, (f) => ({ options: { ...f.options, fontSize: e.target.value ? Number(e.target.value) : undefined } }))}>
          <option value="">Auto</option>{[7, 8, 9, 10, 11, 12, 14, 16, 18].map((n) => <option key={n} value={n}>{n}</option>)}
        </NativeSelect>
        {([["bold", Bold], ["italic", Italic], ["underline", Underline]] as const).map(([k, Icon]) => (
          <button key={k} disabled={!textSel.length} onClick={() => update(textIds, (f) => ({ options: { ...f.options, [k]: !f.options[k] } }))} className={cn("h-8 w-8 rounded flex items-center justify-center disabled:opacity-30 hover:bg-paper-2", one?.options[k] && "bg-paper-2 ring-1 ring-ink")} aria-label={k}><Icon size={15} /></button>
        ))}
        <input type="color" disabled={!textSel.length} value={one?.options.fontColor ?? "#141414"} onChange={(e) => update(textIds, (f) => ({ options: { ...f.options, fontColor: e.target.value } }))} className="h-7 w-8 rounded border border-hairline bg-white p-0.5 disabled:opacity-30" aria-label="Font color" />
        <span className="h-5 w-px bg-hairline mx-2" />
        <button onClick={() => setZoom((z) => clamp(Math.round((z - 0.1) * 10) / 10, 0.5, 2))} className="h-8 w-8 rounded hover:bg-paper-2 flex items-center justify-center" aria-label="Zoom out"><ZoomOut size={15} /></button>
        <span className="text-xs w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => clamp(Math.round((z + 0.1) * 10) / 10, 0.5, 2))} className="h-8 w-8 rounded hover:bg-paper-2 flex items-center justify-center" aria-label="Zoom in"><ZoomIn size={15} /></button>
        <button onClick={() => setZoom(1)} className="text-xs text-rose-ink hover:underline ml-1">Fit</button>
        <div className="ml-auto text-xs text-muted">{fields.length} {fields.length === 1 ? "field" : "fields"}{sel.length > 1 ? ` · ${sel.length} selected` : ""}</div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[260px_1fr_300px] min-h-0">
        {/* left: recipient + palette */}
        <aside className="hidden lg:block bg-white border-r border-hairline overflow-y-auto">
          <div className="p-4 border-b border-hairline-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">Recipient</div>
            {fieldRecipients.length ? (
              <Menu>
                <MenuTrigger className="w-full flex items-center gap-2 h-10 rounded-md border border-hairline px-2.5 text-left hover:border-ink-2">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ background: recipientColor(currentRec?.colorIndex ?? 0).solid }} />
                  <span className="text-sm truncate flex-1">{currentRec ? recLabel(currentRec) : "Pick a recipient"}</span>
                  <ChevronDown size={15} className="text-muted" />
                </MenuTrigger>
                <MenuContent align="start" className="w-[240px]">
                  {props.recipients.map((r) => {
                    const disabled = !(r.role === "signer" || r.role === "approver");
                    return (
                      <MenuItem key={r.id} disabled={disabled} onSelect={() => setCurrent(r.id)}>
                        <span className="h-3 w-3 rounded-full shrink-0" style={{ background: recipientColor(r.colorIndex).solid }} />
                        <span className="flex-1 min-w-0">
                          <span className="block truncate">{recLabel(r)}</span>
                          <span className="block text-[11px] text-muted">{disabled ? (r.role === "cc" ? "Receives a copy" : "Needs to view") : `${counts.get(r.id) ?? 0} fields`}</span>
                        </span>
                        {r.id === current ? <Check size={14} /> : null}
                      </MenuItem>
                    );
                  })}
                </MenuContent>
              </Menu>
            ) : <p className="text-xs text-muted">Add a recipient who needs to sign or approve on the previous step.</p>}
          </div>
          <div className="p-4">
            <div className="flex items-center h-8 rounded-md border border-hairline px-2 gap-2 mb-3">
              <Search size={13} className="text-muted" />
              <input value={paletteQ} onChange={(e) => setPaletteQ(e.target.value)} placeholder="Search fields" className="text-xs outline-none flex-1 bg-transparent" />
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">Standard fields</div>
            {FIELD_GROUPS.map((g) => {
              const items = palette.filter((m) => m.group === g.key);
              if (!items.length) return null;
              return (
                <div key={g.key} className="mb-3">
                  <div className="text-[11px] text-muted mb-1">{g.label}</div>
                  <div className="space-y-0.5">
                    {items.map((m) => {
                      const Icon = ICONS[m.type];
                      const color = recipientColor(currentRec?.colorIndex ?? 0);
                      return (
                        <button
                          key={m.type}
                          draggable={!!currentRec}
                          onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, m.type); e.dataTransfer.effectAllowed = "copy"; }}
                          onClick={() => setPlacing(placing === m.type ? null : m.type)}
                          disabled={!currentRec}
                          className={cn("w-full flex items-center gap-2.5 h-8 px-2 rounded-md text-[13px] text-left border transition-colors disabled:opacity-40", placing === m.type ? "border-ink bg-paper" : "border-transparent hover:bg-paper-2")}
                        >
                          <span className="h-6 w-6 rounded flex items-center justify-center shrink-0" style={{ background: color.bg, color: color.text }}><Icon size={13} /></span>
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1 mt-4">Custom fields</div>
            <p className="text-xs text-muted">Configure a field, then duplicate it to reuse your settings.</p>
          </div>
        </aside>

        {/* center: documents */}
        <main className={cn("overflow-auto px-2 sm:px-6 py-4 sm:py-6 pb-24 lg:pb-6", placing && "cursor-crosshair")} onClick={() => setSelected([])}>
          {placing ? (
            <div className="sticky top-0 z-20 mx-auto mb-4 w-fit rounded-full bg-ink text-white text-xs px-4 py-2 shadow">
              Click on the document to place {fieldMeta(placing).label.toLowerCase()} for {currentRec ? recLabel(currentRec) : "recipient"} <button className="underline ml-2" onClick={(e) => { e.stopPropagation(); setPlacing(null); }}>Cancel</button>
            </div>
          ) : null}
          <div className="space-y-10">
            {props.documents.map((doc, di) => (
              <section key={doc.id}>
                <div className="mx-auto mb-2 flex items-center justify-between text-xs text-muted" style={{ maxWidth: 900 * zoom }}>
                  <span className="font-medium text-ink-2">Document {di + 1} of {props.documents.length}: {doc.name}.pdf</span>
                  <span>{doc.pageCount} {doc.pageCount === 1 ? "page" : "pages"}</span>
                </div>
                <PdfDocument
                  url={`/api/files/${doc.fileId}`}
                  pageCount={doc.pageCount}
                  maxWidth={desktop ? 900 * zoom : Math.round((typeof window !== "undefined" ? Math.min(window.innerWidth - 16, 900) : 900) * zoom)}
                  pageRefs={pageRefs.current[doc.id]}
                  renderOverlay={(pageIndex, size) => (
                    <div
                      className="absolute inset-0"
                      onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
                      onDrop={(e) => {
                        const type = e.dataTransfer.getData(DRAG_MIME) as FieldType;
                        if (!type) return;
                        e.preventDefault();
                        const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                        createField(type, doc.id, pageIndex, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
                      }}
                      onClick={(e) => {
                        if (!placing) return;
                        e.stopPropagation();
                        const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                        createField(placing, doc.id, pageIndex, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
                      }}
                    >
                      <span className="absolute left-2 top-1 text-[8px] text-muted/80 select-none pointer-events-none">Page {pageIndex + 1}</span>
                      {fields.filter((f) => f.documentId === doc.id && f.page === pageIndex).map((f) => (
                        <FieldBox key={f.id} f={f} size={size} rec={recById.get(f.recipientId)} selected={selected.includes(f.id)}
                          onPointerDown={(e) => startDrag(e, f, "move", size)} onResize={(e) => startDrag(e, f, "resize", size)}
                          onClick={(e) => { e.stopPropagation(); setSelected(e.shiftKey ? (selected.includes(f.id) ? selected.filter((x) => x !== f.id) : [...selected, f.id]) : [f.id]); }} />
                      ))}
                    </div>
                  )}
                />
              </section>
            ))}
          </div>
        </main>

        {/* right: properties / overview */}
        <aside className="hidden lg:block bg-white border-l border-hairline overflow-y-auto">
          {one ? (
            <>
              <Properties f={one} recipients={fieldRecipients} labels={labels} docs={props.documents}
                onChange={(p) => update([one.id], p)} onDelete={() => remove([one.id])}
                onDuplicate={() => { const n: TagField = { ...one, id: tmpId(), y: clamp(one.y + one.height + 0.01, 0, 1 - one.height) }; commit((cur) => [...cur, n]); setSelected([n.id]); }} />
              <div className="p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">Pages</div>
                <div className="space-y-3">
                  {props.documents.map((d) => (
                    <div key={d.id}>
                      <div className="text-xs font-medium truncate mb-1.5">{d.name}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from({ length: d.pageCount }, (_, i) => <button key={i} onClick={() => scrollToPage(d.id, i)} className={cn("h-7 min-w-7 px-1.5 rounded border text-xs hover:border-ink", one.documentId === d.id && one.page === i ? "border-ink bg-paper" : "border-hairline")}>{i + 1}</button>)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : sel.length > 1 ? (
            <div className="p-4 space-y-4">
              <div className="font-semibold">{sel.length} fields selected</div>
              <div className="space-y-1.5">
                <Label>Recipient</Label>
                <NativeSelect className="w-full" value="" onChange={(e) => e.target.value && update(sel.map((f) => f.id), { recipientId: e.target.value })}>
                  <option value="">Assign all to...</option>
                  {fieldRecipients.map((r) => <option key={r.id} value={r.id}>{recLabel(r)}</option>)}
                </NativeSelect>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ink h-4 w-4" onChange={(e) => update(sel.map((f) => f.id), { required: e.target.checked })} /> Required</label>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => { const copies = sel.map((c) => ({ ...c, id: tmpId(), x: clamp(c.x + 0.02, 0, 1 - c.width), y: clamp(c.y + 0.02, 0, 1 - c.height) })); commit((cur) => [...cur, ...copies]); setSelected(copies.map((c) => c.id)); }}><Copy size={14} /> Duplicate</Button>
                <Button variant="danger" size="sm" onClick={() => remove(sel.map((f) => f.id))}><Trash2 size={14} /> Delete</Button>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-6">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">Recipients</div>
                <ul className="space-y-2">
                  {props.recipients.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 text-sm">
                      <span className="h-3 w-3 rounded-full" style={{ background: recipientColor(r.colorIndex).solid }} />
                      <span className="flex-1 truncate">{recLabel(r)}</span>
                      <span className="text-xs text-muted">{r.role === "cc" ? "Copy" : r.role === "viewer" ? "Views" : `${counts.get(r.id) ?? 0} fields`}</span>
                    </li>
                  ))}
                </ul>
                {missingSig.length ? (
                  <div className="mt-3 rounded-md bg-warn-bg text-warn text-xs px-3 py-2 flex gap-2"><AlertCircle size={14} className="shrink-0 mt-0.5" /><span>Add a signature field for {missingSig.map(recLabel).join(", ")} before sending.</span></div>
                ) : null}
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">Pages</div>
                <div className="space-y-3">
                  {props.documents.map((d) => (
                    <div key={d.id}>
                      <div className="text-xs font-medium truncate mb-1.5">{d.name}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from({ length: d.pageCount }, (_, i) => (
                          <button key={i} onClick={() => scrollToPage(d.id, i)} className="h-7 min-w-7 px-1.5 rounded border border-hairline text-xs hover:border-ink">{i + 1}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-xs text-muted leading-relaxed space-y-1">
                <p>Drag a field onto the page, or click one in the palette and then click where it goes. Shift-click selects several. Cmd+Z undoes.</p>
              </div>
            </div>
          )}
        </aside>
      </div>

      {!desktop ? (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-hairline px-3 py-2 flex items-center gap-2 lg:hidden" style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
          <Button variant="secondary" size="sm" onClick={() => setSheet("fields")} className="flex-1 justify-center"><Plus size={14} /> Add field</Button>
          <Button variant="secondary" size="sm" onClick={() => setSheet("pages")} className="justify-center">Pages</Button>
          <Button variant="secondary" size="sm" onClick={() => one ? setSheet("props") : null} disabled={!one} className="justify-center">Edit field</Button>
          <span className="ml-auto"><SaveIndicator status={status} error={saveError} /></span>
        </div>
      ) : null}
      <Sheet open={!desktop && sheet === "fields"} onOpenChange={(o) => !o && setSheet(null)} title="Add a field">
        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">Recipient</div>
          <NativeSelect className="w-full mb-4" value={current} onChange={(e) => setCurrent(e.target.value)}>
            {fieldRecipients.map((r) => <option key={r.id} value={r.id}>{recLabel(r)}</option>)}
          </NativeSelect>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">Then tap the field, then tap the page where it goes</div>
          <div className="grid grid-cols-2 gap-1.5">
            {FIELD_META.map((m) => { const Icon = ICONS[m.type]; const color = recipientColor(currentRec?.colorIndex ?? 0); return (
              <button key={m.type} onClick={() => { setPlacing(m.type); setSheet(null); }} className="flex items-center gap-2 h-10 px-2 rounded-md border border-hairline text-[13px] text-left hover:bg-paper-2">
                <span className="h-6 w-6 rounded flex items-center justify-center shrink-0" style={{ background: color.bg, color: color.text }}><Icon size={13} /></span>{m.label}
              </button>
            ); })}
          </div>
        </div>
      </Sheet>
      <Sheet open={!desktop && sheet === "pages"} onOpenChange={(o) => !o && setSheet(null)} title="Pages">
        <div className="p-4 space-y-3">
          {props.documents.map((d) => (
            <div key={d.id}>
              <div className="text-xs font-medium truncate mb-1.5">{d.name}</div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: d.pageCount }, (_, i) => <button key={i} onClick={() => { scrollToPage(d.id, i); setSheet(null); }} className="h-8 min-w-8 px-2 rounded border border-hairline text-xs">{i + 1}</button>)}
              </div>
            </div>
          ))}
          {missingSig.length ? <div className="rounded-md bg-warn-bg text-warn text-xs px-3 py-2">Add a signature field for {missingSig.map(recLabel).join(", ")} before sending.</div> : null}
        </div>
      </Sheet>
      <Sheet open={!desktop && sheet === "props" && !!one} onOpenChange={(o) => !o && setSheet(null)} title={one ? fieldMeta(one.type).label : "Field"}>
        {one ? <Properties f={one} recipients={fieldRecipients} labels={labels} docs={props.documents} onChange={(p) => update([one.id], p)} onDelete={() => { remove([one.id]); setSheet(null); }} onDuplicate={() => { const n: TagField = { ...one, id: tmpId(), y: clamp(one.y + one.height + 0.01, 0, 1 - one.height) }; commit((cur) => [...cur, n]); setSelected([n.id]); }} /> : null}
      </Sheet>

      <Dialog open={!!sendError} onOpenChange={(o) => !o && setSendError(null)}>
        <DialogContent title="Before you send" description="Fix these and try again.">
          <ul className="space-y-2 text-sm">
            {(sendError ?? "").split(/(?<=\.)\s+/).filter(Boolean).map((p, i) => <li key={i} className="flex gap-2"><AlertCircle size={15} className="text-bad shrink-0 mt-0.5" />{p}</li>)}
          </ul>
          <div className="mt-6 flex justify-end"><Button onClick={() => setSendError(null)}>OK</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SaveIndicator({ status, error }: { status: "saved" | "dirty" | "saving" | "error"; error: string | null }) {
  if (status === "error") return <span className="text-xs text-bad truncate max-w-[220px]" title={error ?? ""}>Couldn&apos;t save: {error}</span>;
  if (status === "saving" || status === "dirty") return <span className="text-xs text-muted flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Saving</span>;
  return <span className="text-xs text-muted flex items-center gap-1"><Check size={12} /> Saved</span>;
}

function FieldBox({ f, size, rec, selected, onPointerDown, onResize, onClick }: {
  f: TagField; size: { width: number; height: number }; rec: Rec | undefined; selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void; onResize: (e: React.PointerEvent) => void; onClick: (e: React.MouseEvent) => void;
}) {
  const color = recipientColor(rec?.colorIndex ?? 0);
  const meta = fieldMeta(f.type);
  const Icon = ICONS[f.type];
  const w = f.width * size.width;
  const h = f.height * size.height;
  const tiny = f.type === "checkbox" || f.type === "radio";
  const label =
    f.type === "formula" ? (f.options.formula ? `= ${f.options.formula}` : "Formula") :
    f.type === "text" || f.type === "number" || f.type === "date" ? (f.value || f.label || meta.short) :
    f.type === "dropdown" ? (f.label || "Dropdown") : f.type === "note" ? (f.value || "Note") :
    f.type === "approve" ? "Approve" : f.type === "decline" ? "Decline" : meta.short;
  const buttonish = f.type === "approve" || f.type === "decline";
  return (
    <div onPointerDown={onPointerDown} onClick={onClick} className={cn("absolute select-none touch-none cursor-move flex items-center", selected && "z-10")}
      style={{ left: f.x * size.width, top: f.y * size.height, width: w, height: h }} title={`${meta.label} for ${rec ? recLabel(rec) : "recipient"}`}>
      <div
        className={cn("absolute inset-0 border flex items-center gap-1 overflow-hidden",
          tiny ? (f.type === "radio" ? "rounded-full justify-center" : "rounded-[2px] justify-center") : buttonish ? "rounded-[4px] justify-center" : "rounded-[3px] px-1",
          f.type === "drawing" && "border-dashed", selected ? "ring-2 ring-ink ring-offset-1" : "")}
        style={{ background: buttonish ? (f.type === "approve" ? "#141414" : "#fff") : color.bg, borderColor: buttonish ? "#141414" : color.border, color: buttonish ? (f.type === "approve" ? "#fff" : "#141414") : color.text }}
      >
        {tiny ? null : <Icon size={Math.max(9, Math.min(14, h * 0.55))} className="shrink-0" />}
        {tiny ? null : <span className="truncate font-medium" style={{ fontSize: Math.max(8, Math.min(12, h * 0.5)), fontFamily: f.options.font === "times" ? "Times New Roman, serif" : f.options.font === "courier" ? "Courier, monospace" : undefined, fontWeight: f.options.bold ? 700 : undefined, fontStyle: f.options.italic ? "italic" : undefined, textDecoration: f.options.underline ? "underline" : undefined }}>{label}</span>}
        {f.required && !tiny && !buttonish ? <span className="absolute -top-1 -right-1 text-bad text-[11px] leading-none">*</span> : null}
        {f.options.conditional?.parentLabel ? <span className="absolute left-0 bottom-0 text-[7px] px-0.5 bg-white/80 text-muted leading-none">if</span> : null}
      </div>
      {selected ? <span onPointerDown={onResize} className="absolute -right-1.5 -bottom-1.5 h-3 w-3 rounded-sm bg-white border border-ink cursor-nwse-resize z-20" aria-label="Resize" /> : null}
    </div>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-hairline-2">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] font-semibold">
        {title}<ChevronRight size={14} className={cn("transition-transform text-muted", open && "rotate-90")} />
      </button>
      {open ? <div className="px-4 pb-4 space-y-3">{children}</div> : null}
    </div>
  );
}

function Properties({ f, recipients, labels, docs, onChange, onDelete, onDuplicate }: {
  f: TagField; recipients: Rec[]; labels: string[]; docs: Doc[]; onChange: (p: Partial<TagField>) => void; onDelete: () => void; onDuplicate: () => void;
}) {
  const meta = fieldMeta(f.type);
  const Icon = ICONS[f.type];
  const textual = ["text", "number", "date", "company", "title", "note"].includes(f.type);
  const auto = AUTO.includes(f.type);
  const doc = docs.find((d) => d.id === f.documentId);
  const pm = doc?.pages[f.page] ?? doc?.pages[0];
  const pts = (n: number, axis: "x" | "y") => Math.round(n * ((axis === "x" ? pm?.width : pm?.height) ?? 612));
  const setOpt = (patch: Partial<FieldOptions>) => onChange({ options: { ...f.options, ...patch } });
  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline-2">
        <Icon size={16} />
        <div className="font-semibold">{meta.label}</div>
        <div className="ml-auto flex gap-1">
          <button onClick={onDuplicate} className="p-1.5 rounded hover:bg-paper-2" aria-label="Duplicate"><Copy size={15} /></button>
          <button onClick={onDelete} className="p-1.5 rounded hover:bg-paper-2 text-bad" aria-label="Delete field"><Trash2 size={15} /></button>
        </div>
      </div>
      <Section title="Recipient">
        <NativeSelect className="w-full" value={f.recipientId} onChange={(e) => onChange({ recipientId: e.target.value })}>
          {recipients.map((r) => <option key={r.id} value={r.id}>{recLabel(r)}</option>)}
        </NativeSelect>
      </Section>
      {!NO_REQUIRED.includes(f.type) ? (
        <Section title="Required field">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ink h-4 w-4" checked={f.required} onChange={(e) => onChange({ required: e.target.checked })} /> Recipient must complete this field</label>
          {textual || f.type === "checkbox" || f.type === "dropdown" ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ink h-4 w-4" checked={f.readOnly} onChange={(e) => onChange({ readOnly: e.target.checked })} /> Read only (prefilled by sender)</label> : null}
        </Section>
      ) : auto ? (
        <div className="px-4 py-3 text-xs text-muted border-b border-hairline-2">Filled in automatically when {f.type === "date_signed" ? "they sign" : "they adopt their signature"}.</div>
      ) : null}
      {textual || f.type === "dropdown" ? (
        <Section title={f.type === "note" ? "Note text" : f.type === "dropdown" ? "Options" : "Add text"}>
          {f.type === "note" ? <Textarea rows={3} value={f.value ?? ""} onChange={(e) => onChange({ value: e.target.value })} />
            : f.type === "dropdown" ? (
              <div className="space-y-2">
                {(f.options.choices ?? []).map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={c} onChange={(e) => { const ch = [...(f.options.choices ?? [])]; ch[i] = e.target.value; setOpt({ choices: ch }); }} />
                    <button onClick={() => setOpt({ choices: (f.options.choices ?? []).filter((_, j) => j !== i) })} className="p-1.5 rounded hover:bg-paper-2 text-muted" aria-label="Remove option"><Minus size={14} /></button>
                  </div>
                ))}
                <Button variant="secondary" size="sm" onClick={() => setOpt({ choices: [...(f.options.choices ?? []), `Option ${(f.options.choices?.length ?? 0) + 1}`] })}><Plus size={14} /> Add option</Button>
                <div className="space-y-1.5 pt-1">
                  <Label>Default</Label>
                  <NativeSelect className="w-full" value={f.value ?? ""} onChange={(e) => onChange({ value: e.target.value || null })}>
                    <option value="">None</option>{(f.options.choices ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                  </NativeSelect>
                </div>
              </div>
            ) : (
              <Input value={f.value ?? ""} onChange={(e) => onChange({ value: e.target.value || null })} placeholder={f.readOnly ? "Value shown to the signer" : "Default value (optional)"} />
            )}
          {textual && f.type !== "note" ? (
            <div className="space-y-1.5"><Label>Placeholder</Label><Input value={f.options.placeholder ?? ""} onChange={(e) => setOpt({ placeholder: e.target.value || undefined })} /></div>
          ) : null}
        </Section>
      ) : null}
      {f.type === "checkbox" ? (
        <Section title="Default">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ink h-4 w-4" checked={f.value === "true"} onChange={(e) => onChange({ value: e.target.checked ? "true" : "false" })} /> Checked by default</label>
        </Section>
      ) : null}
      {f.type === "radio" ? (
        <Section title="Radio group">
          <div className="space-y-1.5"><Label>Group name</Label><Input value={f.options.group ?? ""} onChange={(e) => setOpt({ group: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>This option&apos;s value</Label><Input value={f.options.optionValue ?? ""} onChange={(e) => setOpt({ optionValue: e.target.value })} /></div>
        </Section>
      ) : null}
      {f.type === "formula" ? (
        <Section title="Formula">
          <Textarea rows={2} value={f.options.formula ?? ""} onChange={(e) => setOpt({ formula: e.target.value })} placeholder="[Price] * [Quantity]" />
          <p className="text-[11px] text-muted">Reference other fields by their data label in brackets. Supports + - * / % and parentheses.</p>
          {labels.length ? <div className="flex flex-wrap gap-1">{labels.map((l) => <button key={l} onClick={() => setOpt({ formula: `${f.options.formula ?? ""}[${l}]` })} className="text-[11px] px-1.5 py-0.5 rounded bg-paper-2 hover:bg-blush-1">[{l}]</button>)}</div> : null}
          <div className="space-y-1.5"><Label>Decimal places</Label><NativeSelect value={String(f.options.decimals ?? 2)} onChange={(e) => setOpt({ decimals: Number(e.target.value) })}>{[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</NativeSelect></div>
        </Section>
      ) : null}
      {f.type === "attachment" ? (
        <Section title="Attachment">
          <div className="space-y-1.5"><Label>Allowed file types</Label><Input value={f.options.accept ?? ".pdf,.png,.jpg,.jpeg"} onChange={(e) => setOpt({ accept: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Max size (MB)</Label><Input type="number" min={1} max={25} value={f.options.maxMb ?? 25} onChange={(e) => setOpt({ maxMb: clamp(Number(e.target.value) || 25, 1, 25) })} /></div>
        </Section>
      ) : null}
      {f.type === "approve" || f.type === "decline" ? (
        <div className="px-4 py-3 text-xs text-muted border-b border-hairline-2">{f.type === "approve" ? "A button the recipient clicks to approve. It finishes their part without a signature." : "A button the recipient clicks to decline. It opens the decline dialog."}</div>
      ) : null}
      {TEXTUAL.includes(f.type) ? (
        <Section title="Formatting" defaultOpen={false}>
          <div className="grid grid-cols-2 gap-2">
            <NativeSelect value={f.options.font ?? ""} onChange={(e) => setOpt({ font: (e.target.value || undefined) as FieldOptions["font"] })}><option value="">Helvetica</option><option value="times">Times New Roman</option><option value="courier">Courier</option></NativeSelect>
            <NativeSelect value={String(f.options.fontSize ?? "")} onChange={(e) => setOpt({ fontSize: e.target.value ? Number(e.target.value) : undefined })}><option value="">Auto size</option>{[7, 8, 9, 10, 11, 12, 14, 16, 18].map((n) => <option key={n} value={n}>{n} pt</option>)}</NativeSelect>
          </div>
          <div className="flex items-center gap-2">
            {([["bold", Bold], ["italic", Italic], ["underline", Underline]] as const).map(([k, I]) => (
              <button key={k} onClick={() => setOpt({ [k]: !f.options[k] })} className={cn("h-8 w-8 rounded border border-hairline flex items-center justify-center", f.options[k] && "bg-paper-2 border-ink")} aria-label={k}><I size={14} /></button>
            ))}
            <input type="color" value={f.options.fontColor ?? "#141414"} onChange={(e) => setOpt({ fontColor: e.target.value })} className="h-8 w-10 rounded border border-hairline p-0.5" aria-label="Font color" />
          </div>
        </Section>
      ) : null}
      {textual && f.type !== "note" ? (
        <Section title="Validation" defaultOpen={false}>
          <NativeSelect className="w-full" value={f.options.validation ?? "none"} onChange={(e) => setOpt({ validation: e.target.value as FieldOptions["validation"] })}>
            <option value="none">None</option><option value="email">Email</option><option value="number">Number</option><option value="date">Date (MM/DD/YYYY)</option>
            <option value="zip">ZIP code</option><option value="zip4">ZIP+4</option><option value="ssn">SSN</option><option value="phone">Phone</option><option value="regex">Custom (regex)</option>
          </NativeSelect>
          {f.options.validation === "regex" ? <div className="space-y-1.5"><Label>Pattern</Label><Input value={f.options.regex ?? ""} onChange={(e) => setOpt({ regex: e.target.value })} placeholder="[A-Z]{3}-\d{4}" /></div> : null}
          <div className="space-y-1.5"><Label>Error message</Label><Input value={f.options.validationMessage ?? ""} onChange={(e) => setOpt({ validationMessage: e.target.value || undefined })} placeholder="Shown when the value doesn't match" /></div>
          <div className="space-y-1.5"><Label>Character limit</Label><Input type="number" min={1} max={4000} value={f.options.maxLength ?? ""} onChange={(e) => setOpt({ maxLength: e.target.value ? Number(e.target.value) : undefined })} placeholder="No limit" /></div>
        </Section>
      ) : null}
      <Section title="Data label" defaultOpen={false}>
        <Input value={f.label ?? ""} onChange={(e) => onChange({ label: e.target.value || null })} placeholder={meta.label} />
        <p className="text-[11px] text-muted">Used by formulas, conditional logic, templates and the API to identify this field.</p>
      </Section>
      {f.type !== "approve" && f.type !== "decline" ? (
        <Section title="Tooltip" defaultOpen={false}>
          <Input value={f.options.tooltip ?? ""} onChange={(e) => setOpt({ tooltip: e.target.value || undefined })} placeholder="Shown to the recipient on hover" />
        </Section>
      ) : null}
      <Section title="Conditional logic" defaultOpen={!!f.options.conditional}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-ink h-4 w-4" checked={!!f.options.conditional} onChange={(e) => setOpt({ conditional: e.target.checked ? { parentLabel: labels.find((l) => l !== f.label) ?? "", equals: null } : null })} />
          Show this field only when
        </label>
        {f.options.conditional ? (
          <div className="grid grid-cols-1 gap-2">
            <NativeSelect value={f.options.conditional.parentLabel} onChange={(e) => setOpt({ conditional: { ...f.options.conditional!, parentLabel: e.target.value } })}>
              <option value="">Pick a field (by data label)</option>
              {labels.filter((l) => l !== f.label).map((l) => <option key={l} value={l}>{l}</option>)}
            </NativeSelect>
            <Input value={f.options.conditional.equals ?? ""} onChange={(e) => setOpt({ conditional: { ...f.options.conditional!, equals: e.target.value || null } })} placeholder='equals... (empty = "has a value" / checked)' />
          </div>
        ) : null}
      </Section>
      <Section title="Location" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="space-y-1"><span className="text-muted">X (pt)</span><Input type="number" value={pts(f.x, "x")} onChange={(e) => onChange({ x: clamp(Number(e.target.value) / (pm?.width ?? 612), 0, 1 - f.width) })} /></label>
          <label className="space-y-1"><span className="text-muted">Y (pt)</span><Input type="number" value={pts(f.y, "y")} onChange={(e) => onChange({ y: clamp(Number(e.target.value) / (pm?.height ?? 792), 0, 1 - f.height) })} /></label>
          <label className="space-y-1"><span className="text-muted">Width</span><Input type="number" value={pts(f.width, "x")} onChange={(e) => onChange({ width: clamp(Number(e.target.value) / (pm?.width ?? 612), 0.012, 1 - f.x) })} /></label>
          <label className="space-y-1"><span className="text-muted">Height</span><Input type="number" value={pts(f.height, "y")} onChange={(e) => onChange({ height: clamp(Number(e.target.value) / (pm?.height ?? 792), 0.008, 1 - f.y) })} /></label>
          <label className="space-y-1 col-span-2"><span className="text-muted">Page</span><NativeSelect className="w-full" value={f.page} onChange={(e) => onChange({ page: Number(e.target.value) })}>{Array.from({ length: doc?.pageCount ?? 1 }, (_, i) => <option key={i} value={i}>Page {i + 1}</option>)}</NativeSelect></label>
        </div>
      </Section>
    </div>
  );
}
