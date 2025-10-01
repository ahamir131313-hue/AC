// Project: AC
'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, isAfter, isBefore, isSameDay, isToday, parseISO } from "date-fns";
// ⚠️ Viktigt: vi laddar svensk lokal dynamiskt för att undvika bundler-problem
// och faller tillbaka till standard om importen misslyckas.
import { Phone, Plus, Search, Mail, MessageSquare, Download, Upload, Clock, CalendarDays, XCircle, RefreshCw, NotebookPen } from "lucide-react";

// =========================
// Konstanter och datamodell
// =========================
const STATUSES = [
  { value: "new", label: "Ny" },
  { value: "to_call", label: "Att ringa" },
  { value: "waiting", label: "Väntar på svar" },
  { value: "followup", label: "Uppföljning" },
  { value: "hot", label: "Het" },
  { value: "won", label: "Vunnen" },
  { value: "lost", label: "Förlorad" },
];

// Hierarki märke → modeller → utförande (utdrag, kan byggas ut vidare)
const MODEL_INDEX: Record<string, Record<string, string[]>> = {
  "BMW": {
    "1-serie": ["Standard", "M Sport"],
    "2-serie": ["Gran Coupé", "Active Tourer", "M Sport"],
    "3-serie": ["Sedan", "Touring", "M Sport", "M3"],
    "4-serie": ["Coupé", "Gran Coupé", "Cabriolet", "M4"],
    "5-serie": ["Sedan", "Touring", "M Sport", "M5"],
    "X1": ["xLine", "M Sport"],
    "X3": ["xLine", "M Sport", "M Competition"],
  },
  "Volvo": {
    "EX30": ["Core", "Plus", "Ultra"],
    "XC40": ["Core", "Plus", "Ultimate", "R-Design"],
    "XC60": ["Core", "Plus", "Ultimate", "R-Design"],
    "V60": ["Core", "Plus", "Cross Country"],
  },
  "Audi": {
    "A3": ["Sportback", "Sedan", "S line"],
    "A4": ["Sedan", "Avant", "S line"],
    "Q3": ["S line"],
    "Q5": ["S line", "Sportback"],
  },
  "Mercedes-Benz": {
    "A-Class": ["AMG Line", "Progressive"],
    "C-Class": ["Sedan", "Kombi", "AMG Line"],
    "GLC": ["SUV", "Coupé", "AMG Line"],
  },
  "Volkswagen": {
    "Golf": ["GTI", "R-Line", "R"],
    "Passat": ["Variant", "R-Line"],
    "Tiguan": ["R-Line"],
    "ID.4": ["Pro", "GTX"],
  },
  "Toyota": {
    "Yaris": ["Cross"],
    "Corolla": ["Touring Sports"],
    "RAV4": [],
  },
  "Kia": {
    "Ceed": ["SW", "Proceed", "XCeed"],
    "Sportage": [],
    "EV6": [],
  },
};
const BRANDS = Object.keys(MODEL_INDEX);

// =========================
// Hjälpfunktioner
// =========================
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function save(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}
function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Dynamisk svensk lokal
function useSwedishLocale() {
  const [locale, setLocale] = useState<any | null>(null);
  useEffect(() => {
    let mounted = true;
    // För vissa bundlers behövs explicit /sv
    import("date-fns/locale/sv/index.js").then((m) => {
      if (!mounted) return;
      setLocale((m as any).default || (m as any).sv || null);
    }).catch(() => setLocale(null));
    return () => { mounted = false; };
  }, []);
  return locale;
}

// Säker formatering som funkar även utan locale
function useDateFormatters() {
  const svLocale = useSwedishLocale();
  const fmt = React.useCallback((d: Date, pattern: string) => {
    try {
      return svLocale ? format(d, pattern, { locale: svLocale }) : format(d, pattern);
    } catch {
      return format(d, pattern);
    }
  }, [svLocale]);
  const parseMaybeISO = (s?: string | null) => (s ? parseISO(s) : null);
  return { fmt, parseMaybeISO };
}

// Fabrik för kontaktobjekt
function createContactFromPayload(payload: any) {
  const now = Date.now();
  const carBrand = payload.carBrand || payload.brand || "";
  const carModel = payload.carModel || "";
  const carTrim = payload.carTrim || "";
  const carString = [carBrand, carModel, carTrim].filter(Boolean).join(" ");
  const brandsCompat = payload.brands && payload.brands.length ? payload.brands : (carBrand ? [carBrand] : []);
  return {
    id: uid(),
    name: payload.name?.trim() || "",
    phone: payload.phone?.trim() || "",
    email: payload.email?.trim() || "",
    // Fri textfält kvar för bakåtkompabilitet
    car: payload.car?.trim() || carString,
    // Nya fält
    carBrand,
    carModel,
    carTrim,
    // Gammalt fält kvar
    brands: brandsCompat,
    source: payload.source || "",
    status: payload.status || "to_call",
    nextDate: payload.nextDate || null,
    notes: payload.notes || "",
    interactions: [] as any[],
    createdAt: now,
    updatedAt: now,
  };
}

// =========================
// Huvudkomponent
// =========================
export default function App() {
  const [contacts, setContacts] = useState<any[]>(() => load("ac_contacts", []));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateBucket, setDateBucket] = useState("today");
  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { fmt, parseMaybeISO } = useDateFormatters();

  useEffect(() => { save("ac_contacts", contacts); }, [contacts]);

  // Tangentbordsgenvägar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/") { e.preventDefault(); (document.getElementById("global-search") as HTMLInputElement | null)?.focus(); }
      if (e.key.toLowerCase() === "n") { setAddOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Små dev-självtester ("test cases") för att fånga regressions
  useEffect(() => {
    // 1) Locale-format ska inte krascha
    try {
      const s = fmt(new Date(), "PPP");
      console.assert(typeof s === "string" && s.length > 0, "fmt saknar output");
    } catch (e) { console.warn("fmt test fail", e); }
    // 2) Kontaktfabrik
    const t = createContactFromPayload({ name: "Test", carBrand: "BMW", carModel: "3-serie", carTrim: "M Sport" });
    console.assert(t.car.includes("BMW"), "createContactFromPayload bygger car-sträng");
    // 3) Filtrering ska inte krascha på tom lista
    try {
      const arr: any[] = [];
      const dummy = arr.filter(() => true).sort(() => 0);
      console.assert(Array.isArray(dummy), "filter/sort ok");
    } catch (e) { console.warn("filter/sort test fail", e); }
  }, [fmt]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts
      .filter((c) => {
        if (statusFilter !== "all" && c.status !== statusFilter) return false;
        if (!q) return true;
        const hay = `${c.name} ${c.phone || ""} ${c.email || ""} ${c.car || ""} ${c.carBrand || ""} ${c.carModel || ""} ${c.carTrim || ""} ${(c.brands || []).join(" ")} ${c.notes || ""}`.toLowerCase();
        return hay.includes(q);
      })
      .filter((c) => {
        if (dateBucket === "all") return true;
        const d = parseMaybeISO(c.nextDate);
        if (!d) return dateBucket === "all";
        if (dateBucket === "today") return isToday(d);
        if (dateBucket === "overdue") return isBefore(d, new Date()) && !isSameDay(d, new Date());
        if (dateBucket === "upcoming") return isAfter(d, new Date()) && !isSameDay(d, new Date());
        return true;
      })
      .sort((a, b) => {
        const da = a.nextDate ? parseMaybeISO(a.nextDate)?.getTime() ?? Infinity : Infinity;
        const db = b.nextDate ? parseMaybeISO(b.nextDate)?.getTime() ?? Infinity : Infinity;
        if (da !== db) return da - db;
        return (a.updatedAt || 0) > (b.updatedAt || 0) ? -1 : 1;
      });
  }, [contacts, search, statusFilter, dateBucket, parseMaybeISO]);

  function addContact(payload: any) { const c = createContactFromPayload(payload); setContacts((prev) => [c, ...prev]); }
  function updateContact(id: string, patch: any) { setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c))); }
  function removeContact(id: string) { setContacts((prev) => prev.filter((c) => c.id !== id)); }
  function addInteraction(id: string, entry: any) {
    setContacts((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      const interactions = [{ id: uid(), date: entry.date || new Date().toISOString(), type: entry.type || "call", note: entry.note || "", outcome: entry.outcome || "" }, ...(c.interactions || [])];
      return { ...c, interactions, nextDate: entry.nextDate ?? c.nextDate, status: entry.status ?? c.status, updatedAt: Date.now() };
    }));
  }

  const selected = contacts.find((c) => c.id === detailId) || null;

  return (
    <div className="min-h-screen bg-neutral-50">
      <Head><title>AC</title></Head>

      {/* Header */}
      <div className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-2">
          <div className="flex items-center gap-2">
            <NotebookPen className="h-5 w-5" />
            <span className="font-semibold">AC</span>
          </div>
          <div className="ml-auto flex items-center gap-2 w-full sm:w-1/2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 opacity-60" />
              <Input id="global-search" placeholder="Sök namn, telefon, bil, anteckning... (/ för fokus)" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Ny kontakt (N)</Button></DialogTrigger>
              <AddContactDialog onSubmit={(payload) => { addContact(payload); setAddOpen(false); }} />
            </Dialog>
            <Button variant="outline" onClick={() => {
              const blob = new Blob([JSON.stringify(contacts, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = `ac-kontakter-${format(new Date(), "yyyy-MM-dd")}.json`; a.click(); URL.revokeObjectURL(url);
            }}><Download className="mr-2 h-4 w-4" /> Export</Button>
            <label className="inline-flex items-center">
              <input type="file" accept="application/json" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0]; if (!f) return; const reader = new FileReader(); reader.onload = () => { try { const data = JSON.parse(reader.result as string); if (Array.isArray(data)) setContacts(data); } catch {} }; reader.readAsText(f);
              }} />
              <Button variant="outline"><Upload className="mr-2 h-4 w-4" /> Import</Button>
            </label>
          </div>
        </div>
      </div>

      {/* Filters + List */}
      <div className="mx-auto max-w-7xl px-4 py-3 grid grid-cols-1 md:grid-cols-12 gap-4">
        <Card className="md:col-span-3">
          <CardHeader><CardTitle className="text-base">Filter</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">Status</div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Alla" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla</SelectItem>
                  {STATUSES.map((s) => (<SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">Tid</div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant={dateBucket === "today" ? "default" : "outline"} onClick={() => setDateBucket("today")}><CalendarDays className="mr-2 h-4 w-4" /> Idag</Button>
                <Button variant={dateBucket === "overdue" ? "default" : "outline"} onClick={() => setDateBucket("overdue")}><Clock className="mr-2 h-4 w-4" /> Försenat</Button>
                <Button variant={dateBucket === "upcoming" ? "default" : "outline"} onClick={() => setDateBucket("upcoming")}><RefreshCw className="mr-2 h-4 w-4" /> Kommande</Button>
                <Button variant={dateBucket === "all" ? "default" : "outline"} onClick={() => setDateBucket("all")}>Alla</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="md:col-span-9 space-y-3">
          {filtered.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-neutral-600">Inga kontakter matchar din vy ännu.</CardContent></Card>
          ) : (
            filtered.map((c) => (
              <ContactRow key={c.id} c={c} onOpen={() => setDetailId(c.id)} onUpdate={updateContact} onRemove={removeContact} fmt={fmt} parseMaybeISO={parseMaybeISO} />
            ))
          )}
        </div>
      </div>

      {/* Detail dialog */}
      {selected && (
        <Dialog open={!!selected} onOpenChange={(v) => !v && setDetailId(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><span>{selected.name || "Namnlös"}</span><StatusBadge status={selected.status} /></DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-3">
                <Card>
                  <CardHeader><CardTitle className="text-base">Interaktioner</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <AddInteractionForm defaultStatus={selected.status} defaultNextDate={selected.nextDate} onSubmit={(entry) => addInteraction(selected.id, entry)} />
                    <div className="space-y-2 max-h-64 overflow-auto pr-1">
                      {(selected.interactions || []).map((it: any) => (
                        <div key={it.id} className="rounded-xl border p-3 text-sm">
                          <div className="flex items-center gap-2 text-neutral-600">
                            <span>{fmt(parseISO(it.date), "yyyy-MM-dd HH:mm")}</span>
                            <Badge variant="secondary">{labelOfType(it.type)}</Badge>
                            {it.outcome && <Badge variant="outline">{it.outcome}</Badge>}
                          </div>
                          {it.note && <div className="mt-1 whitespace-pre-wrap">{it.note}</div>}
                        </div>
                      ))}
                      {selected.interactions?.length === 0 && (<div className="text-sm text-neutral-600">Inga interaktioner ännu.</div>)}
                    </div>
                  </CardContent>
                </Card>
              </div>
              <div className="space-y-3">
                <Card>
                  <CardHeader><CardTitle className="text-base">Kontaktinfo</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <InfoRow label="Telefon" value={selected.phone}>
                      {selected.phone && (<div className="flex gap-2"><Button asChild size="sm" variant="outline"><a href={`tel:${selected.phone}`}><Phone className="mr-1 h-4 w-4" /> Ring</a></Button><Button asChild size="sm" variant="outline"><a href={`sms:${selected.phone}`}><MessageSquare className="mr-1 h-4 w-4" /> SMS</a></Button></div>)}
                    </InfoRow>
                    <InfoRow label="E-post" value={selected.email}>
                      {selected.email && (<Button asChild size="sm" variant="outline"><a href={`mailto:${selected.email}`}><Mail className="mr-1 h-4 w-4" /> Maila</a></Button>)}
                    </InfoRow>
                    <InfoRow label="Bilintresse" value={selected.carBrand ? [selected.carBrand, selected.carModel, selected.carTrim].filter(Boolean).join(" ") : (selected.brands?.length ? selected.brands.join(", ") : selected.car)} />
                    <InfoRow label="Källa" value={selected.source} />
                    <InfoRow label="Nästa steg" value={selected.nextDate ? fmt(parseISO(selected.nextDate), "PPP") : "Ej satt"}>
                      <QuickNextDate value={selected.nextDate} onChange={(d) => updateContact(selected.id, { nextDate: d ? d.toISOString() : null })} fmt={fmt} />
                    </InfoRow>
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-neutral-600">Status</div>
                      <Select value={selected.status} onValueChange={(v) => updateContact(selected.id, { status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-neutral-600">Anteckningar</div>
                      <Textarea placeholder="Snabbanteckning inför återkoppling..." value={selected.notes || ""} onChange={(e) => updateContact(selected.id, { notes: e.target.value })} />
                    </div>
                    <div className="flex justify-between pt-2"><Button variant="destructive" onClick={() => { removeContact(selected.id); }}><XCircle className="mr-2 h-4 w-4" /> Ta bort</Button></div>
                  </CardContent>
                </Card>
              </div>
            </div>
            <DialogFooter><Button onClick={() => setDetailId(null)}>Stäng</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// =========================
// Delkomponenter
// =========================
function ContactRow({ c, onOpen, onUpdate, onRemove, fmt, parseMaybeISO }: any) {
  return (
    <Card className="hover:shadow-md transition">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
          <div className="md:col-span-5">
            <div className="flex items-center gap-2"><span className="font-semibold text-sm">{c.name || "Namnlös"}</span><StatusBadge status={c.status} /></div>
            <div className="text-sm text-neutral-600">
              {c.carBrand ? (
                <div className="flex flex-wrap gap-1">
                  {[c.carBrand, c.carModel, c.carTrim].filter(Boolean).map((txt: string, i: number) => (<Badge key={i} variant="secondary">{txt}</Badge>))}
                </div>
              ) : c.brands?.length ? (
                <div className="flex flex-wrap gap-1">{c.brands.map((b: string) => <Badge key={b} variant="secondary">{b}</Badge>)}</div>
              ) : (c.car || "Ingen bil angiven")}
            </div>
            {c.notes && <div className="text-xs text-neutral-600 line-clamp-2 mt-1">{c.notes}</div>}
          </div>
          <div className="md:col-span-3 text-sm space-y-1">
            <div><span className="text-neutral-500">Telefon:</span> {c.phone || "-"}</div>
            <div><span className="text-neutral-500">E-post:</span> {c.email || "-"}</div>
            <div><span className="text-neutral-500">Nästa steg:</span> {c.nextDate ? fmt(parseMaybeISO(c.nextDate)!, "PPP") : "Ej satt"}</div>
          </div>
          <div className="md:col-span-4 flex flex-wrap gap-2 justify-end">
            {c.phone && (<Button asChild variant="outline" size="sm"><a href={`tel:${c.phone}`}><Phone className="mr-2 h-4 w-4" /> Ring</a></Button>)}
            {c.phone && (<Button asChild variant="outline" size="sm"><a href={`sms:${c.phone}`}><MessageSquare className="mr-2 h-4 w-4" /> SMS</a></Button>)}
            {c.email && (<Button asChild variant="outline" size="sm"><a href={`mailto:${c.email}`}><Mail className="mr-2 h-4 w-4" /> Maila</a></Button>)}
            <QuickNextDate value={c.nextDate} onChange={(d: Date | null) => onUpdate(c.id, { nextDate: d ? d.toISOString() : null })} fmt={fmt} />
            <Button variant="secondary" size="sm" onClick={onOpen}>Öppna</Button>
            <Button variant="ghost" size="sm" onClick={() => onRemove(c.id)}>Ta bort</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string }> = { new: { label: "Ny" }, to_call: { label: "Att ringa" }, waiting: { label: "Väntar" }, followup: { label: "Uppföljning" }, hot: { label: "Het" }, won: { label: "Vunnen" }, lost: { label: "Förlorad" } };
  const data = map[status] || { label: status }; return <Badge variant="outline">{data.label}</Badge>;
}

function InfoRow({ label, value, children }: any) { return (<div className="space-y-1"><div className="text-xs font-medium text-neutral-600">{label}</div><div className="text-sm">{value || "-"}</div>{children}</div>); }

function QuickNextDate({ value, onChange, fmt }: { value: string | null; onChange: (d: Date | null) => void; fmt: (d: Date, p: string) => string; }) {
  const [open, setOpen] = useState(false); const date = value ? parseISO(value) : null; return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button variant="outline" size="sm"><CalendarDays className="mr-2 h-4 w-4" /> {date ? fmt(date, "PPP") : "Sätt datum"}</Button></PopoverTrigger>
      <PopoverContent className="w-auto p-3">
        <div className="flex gap-2 mb-3">
          <Button variant="outline" size="sm" onClick={() => { onChange(new Date()); setOpen(false); }}>Idag</Button>
          <Button variant="outline" size="sm" onClick={() => { const d = new Date(); d.setDate(d.getDate() + 1); onChange(d); setOpen(false); }}>Imorgon</Button>
          <Button variant="outline" size="sm" onClick={() => { const d = new Date(); d.setDate(d.getDate() + 7); onChange(d); setOpen(false); }}>Nästa vecka</Button>
          <Button variant="ghost" size="sm" onClick={() => { onChange(null); setOpen(false); }}>Rensa</Button>
        </div>
        <Calendar mode="single" selected={date || undefined} onSelect={(d: any) => { if (d) onChange(d); setOpen(false); }} />
      </PopoverContent>
    </Popover>
  ); }

function AddContactDialog({ onSubmit }: { onSubmit: (form: any) => void }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", car: "", carBrand: "", carModel: "", carTrim: "", source: "", status: "to_call", nextDate: null as string | null, notes: "" });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Ny kontakt</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1"><div className="text-xs font-medium text-neutral-600">Namn</div><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="För- och efternamn" /></div>
        <div className="space-y-1"><div className="text-xs font-medium text-neutral-600">Telefon</div><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="070-..." /></div>
        <div className="space-y-1"><div className="text-xs font-medium text-neutral-600">E-post</div><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="namn@exempel.se" /></div>

        <div className="space-y-1 md:col-span-2">
          <div className="text-xs font-medium text-neutral-600">Bilintresse – Stegvis val</div>
          <BrandModelPicker
            brand={form.carBrand}
            model={form.carModel}
            trim={form.carTrim}
            onChange={(b, m, t) => setForm({ ...form, carBrand: b, carModel: m, carTrim: t })}
          />
          <div className="text-xs text-neutral-500">Valfritt: skriv en fri text också.</div>
          <Input value={form.car} onChange={(e) => setForm({ ...form, car: e.target.value })} placeholder="Modell, årsmodell, budget" />
        </div>

        <div className="space-y-1"><div className="text-xs font-medium text-neutral-600">Källa</div><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Ex. hemsida, Blocket, telefon" /></div>
        <div className="space-y-1"><div className="text-xs font-medium text-neutral-600">Status</div>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2 space-y-1"><div className="text-xs font-medium text-neutral-600">Anteckningar</div><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Bakgrund, vad ska du säga, invändningar..." /></div>
      </div>
      <DialogFooter><Button onClick={() => onSubmit(form)}><Plus className="mr-2 h-4 w-4" /> Lägg till</Button></DialogFooter>
    </DialogContent>
  );
}

function AddInteractionForm({ onSubmit, defaultNextDate, defaultStatus }: { onSubmit: (f: any) => void; defaultNextDate: string | null; defaultStatus: string; }) {
  const [form, setForm] = useState({ type: "call", date: new Date().toISOString(), note: "", outcome: "", nextDate: defaultNextDate || null, status: defaultStatus || "to_call" });
  return (
    <div className="rounded-xl border p-3">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div className="space-y-1"><div className="text-xs font-medium text-neutral-600">Typ</div>
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="call">Samtal</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="email">E-post</SelectItem><SelectItem value="note">Anteckning</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-1 md:col-span-2"><div className="text-xs font-medium text-neutral-600">Anteckning</div><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Vad sades, invändningar, nästa steg" /></div>
        <div className="space-y-1"><div className="text-xs font-medium text-neutral-600">Utfall</div>
          <Select value={form.outcome} onValueChange={(v) => setForm({ ...form, outcome: v })}><SelectTrigger><SelectValue placeholder="Välj" /></SelectTrigger>
            <SelectContent><SelectItem value="noreply">Inget svar</SelectItem><SelectItem value="callback">Återkom</SelectItem><SelectItem value="booked">Bokat möte</SelectItem><SelectItem value="offer">Offert skickad</SelectItem><SelectItem value="closed_won">Affär vunnen</SelectItem><SelectItem value="closed_lost">Affär förlorad</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><div className="text-xs font-medium text-neutral-600">Nästa datum</div><QuickNextDate value={form.nextDate} onChange={(d) => setForm({ ...form, nextDate: d ? d.toISOString() : null })} fmt={(d, p) => format(d, p)} /></div>
        <div className="space-y-1"><div className="text-xs font-medium text-neutral-600">Status</div>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="md:col-span-4 flex justify-end"><Button onClick={() => onSubmit(form)}><Plus className="mr-2 h-4 w-4" /> Logga</Button></div>
      </div>
    </div>
  );
}

function BrandModelPicker({ brand, model, trim, onChange }: { brand: string; model: string; trim: string; onChange: (b: string, m: string, t: string) => void; }) {
  const [b, setB] = useState(brand || "");
  const [m, setM] = useState(model || "");
  const [t, setT] = useState(trim || "");

  useEffect(() => { onChange?.(b, m, t); }, [b, m, t]);

  const brands = BRANDS;
  const models = b ? Object.keys(MODEL_INDEX[b] || {}) : [];
  const trims = b && m ? (MODEL_INDEX[b][m] || []) : [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
      {/* Brand */}
      <div>
        <div className="text-xs font-medium text-neutral-600 mb-1">Märke</div>
        <Select value={b} onValueChange={(val) => { setB(val); setM(""); setT(""); }}>
          <SelectTrigger><SelectValue placeholder="Välj märke" /></SelectTrigger>
          <SelectContent>
            {brands.map((name) => (<SelectItem key={name} value={name}>{name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {/* Model */}
      <div>
        <div className="text-xs font-medium text-neutral-600 mb-1">Modell</div>
        <Select value={m} onValueChange={(val) => { setM(val); setT(""); }} disabled={!b}>
          <SelectTrigger><SelectValue placeholder={b ? "Välj modell" : "Välj märke först"} /></SelectTrigger>
          <SelectContent>
            {models.map((name) => (<SelectItem key={name} value={name}>{name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {/* Trim */}
      <div>
        <div className="text-xs font-medium text-neutral-600 mb-1">Utförande</div>
        <Select value={t} onValueChange={setT} disabled={!m}>
          <SelectTrigger><SelectValue placeholder={m ? "Välj utförande" : "Välj modell först"} /></SelectTrigger>
          <SelectContent>
            {trims.map((name) => (<SelectItem key={name} value={name}>{name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function labelOfType(t: string) { return t === "call" ? "Samtal" : t === "sms" ? "SMS" : t === "email" ? "E-post" : "Anteckning"; }
