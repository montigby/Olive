import { useState, useRef, useEffect, Component } from "react";
import type { ReactNode } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  useGetPerson,
  getGetPersonQueryKey,
  useUpdatePerson,
  getGetMeQueryKey,
  getListMembersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PLACEHOLDER_YEAR, daysUntilBirthday, sendBirthdayWish } from "@/lib/birthday";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  Save,
  Phone,
  Mail,
  MapPin,
  Instagram,
  Facebook,
  Linkedin,
  Link as LinkIcon,
  Pencil,
  AlertCircle,
  Cake,
  Camera,
  Loader2,
  Plus,
  Trash2,
  CalendarDays,
  Gift,
  Eye,
  EyeOff,
} from "lucide-react";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const MISSING_FIELD_LABEL: Record<string, string> = {
  phone: "phone number",
  photo: "photo",
  email: "email address",
  birthday: "birthday",
};

// ─── Schema ──────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  relationshipLabel: z.string().min(1, "Relationship label is required"),
  gender: z.enum(["male", "female"]).nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email("Invalid email").nullable().optional().or(z.literal("")),
  addressLine1: z.string().nullable().optional(),
  addressCity: z.string().nullable().optional(),
  addressState: z.string().nullable().optional(),
  addressZip: z.string().nullable().optional(),
  addressCountry: z.string().nullable().optional(),
  birthdayMonth: z.string().nullable().optional(),
  birthdayDay: z.string().nullable().optional(),
  birthdayYear: z.string().nullable().optional(),
  showBirthYear: z.boolean().default(false),
  deceased: z.boolean().default(false),
  dateOfPassing: z.string().nullable().optional(),
  instagram: z.string().nullable().optional(),
  facebook: z.string().nullable().optional(),
  tiktok: z.string().nullable().optional(),
  linkedin: z.string().nullable().optional(),
  snapchat: z.string().nullable().optional(),
  venmo: z.string().nullable().optional(),
  bereal: z.string().nullable().optional(),
  otherSocial: z.string().nullable().optional(),
  tier2ContactField: z.enum(["phone", "email"]).default("phone"),
  confirmedMembersOnly: z.boolean().default(false),
  hideAddress: z.boolean().default(false),
  hideInstagram: z.boolean().default(false),
  hideFacebook: z.boolean().default(false),
  hideTiktok: z.boolean().default(false),
  hideLinkedin: z.boolean().default(false),
  hideSnapchat: z.boolean().default(false),
  hideVenmo: z.boolean().default(false),
  hideBereal: z.boolean().default(false),
  hideOtherSocial: z.boolean().default(false),
});

type ProfileForm = z.infer<typeof profileSchema>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAddress(person: any): string | null {
  const parts = [
    person.addressLine1,
    person.addressCity,
    person.addressState,
    person.addressZip,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function parseDateLocal(s: string): Date | null {
  const parts = s.split("-").map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return null;
  return new Date(parts[0]!, parts[1]! - 1, parts[2]!);
}

function formatBirthday(birthday: string | null | undefined): string | null {
  if (!birthday) return null;
  try {
    const dateStr = birthday.split("T")[0]!;
    const d = parseDateLocal(dateStr);
    if (!d || isNaN(d.getTime())) return null;
    const year = parseInt(dateStr.split("-")[0]!, 10);
    const options: Intl.DateTimeFormatOptions = year !== PLACEHOLDER_YEAR
      ? { month: "long", day: "numeric", year: "numeric" }
      : { month: "long", day: "numeric" };
    return d.toLocaleDateString("en-US", options);
  } catch {
    return null;
  }
}

/** Parse a stored birthday string into { month, day, year } — year is "" when stored as placeholder 2000 */
function parseBirthdayParts(birthday: string | null | undefined): { month: string; day: string; year: string } {
  if (!birthday) return { month: "", day: "", year: "" };
  const dateStr = birthday.split("T")[0]!;
  const parts = dateStr.split("-");
  if (parts.length < 3) return { month: "", day: "", year: "" };
  const m = parseInt(parts[1]!, 10);
  const d = parseInt(parts[2]!, 10);
  const y = parseInt(parts[0]!, 10);
  if (isNaN(m) || isNaN(d)) return { month: "", day: "", year: "" };
  return { month: String(m), day: String(d), year: y !== PLACEHOLDER_YEAR ? String(y) : "" };
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.73a4.85 4.85 0 0 1-1.01-.04z" />
    </svg>
  );
}

function SnapchatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.004 2c-2.782 0-5.636 1.554-5.636 5.208v.816c-.48.173-.96.28-1.473.28-.39 0-.787-.054-1.173-.162-.066-.019-.13-.029-.19-.029-.29 0-.532.19-.532.47 0 .577.84 1.02 1.77 1.247.017.004.034.007.051.01-.202.536-.478 1.002-.836 1.37-.87.9-1.985 1.16-2.985 1.16-.19 0-.38-.01-.56-.03-.28-.03-.52.15-.52.43 0 .84 1.56 1.7 3.55 1.93.01.001.01.003.02.004.22.56.85.91 1.98.91.19 0 .39-.01.6-.04.7-.08 1.37-.26 2.01-.26.3 0 .59.03.88.1.54.13 1.03.46 1.5.8.6.44 1.26.69 1.97.69.7 0 1.35-.24 1.94-.67.48-.34.97-.67 1.51-.8.29-.07.58-.1.88-.1.64 0 1.31.18 2.01.26.21.03.41.04.6.04 1.13 0 1.76-.35 1.98-.91.01-.001.01-.003.02-.004 1.99-.23 3.55-1.09 3.55-1.93 0-.28-.24-.46-.52-.43-.18.02-.37.03-.56.03-1 0-2.115-.26-2.985-1.16-.358-.368-.634-.834-.836-1.37.017-.003.034-.006.051-.01.93-.227 1.77-.67 1.77-1.247 0-.28-.242-.47-.532-.47-.06 0-.124.01-.19.029a4.48 4.48 0 0 1-1.173.162c-.513 0-.993-.107-1.473-.28v-.816C17.64 3.554 14.786 2 12.004 2z" />
    </svg>
  );
}

function BeRealIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.5 3A3.5 3.5 0 0 0 3 6.5v11A3.5 3.5 0 0 0 6.5 21h11A3.5 3.5 0 0 0 21 17.5v-11A3.5 3.5 0 0 0 17.5 3H6.5zM8 7h3.5a2.5 2.5 0 0 1 0 5H9v2h-.5A.5.5 0 0 1 8 13.5V7zm1.5 1v2.5H11a1 1 0 0 0 0-2H9.5zm4.25.5c.97 0 1.75.78 1.75 1.75S14.72 12 13.75 12H13v1.5a.5.5 0 0 1-.5.5H12V8.5h1.75zM13 9.5v1h.75a.5.5 0 0 0 0-1H13z"/>
    </svg>
  );
}

function VenmoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.45 2.005c.48.8.695 1.625.695 2.665 0 3.32-2.835 7.63-5.13 10.66H9.875L7.71 2.97l-4.595.44 2.73 16.95h7.17c3.565-4.665 7.93-12.04 7.93-17.17 0-1.24-.215-2.085-.625-2.77l-4.875 1.585z"/>
    </svg>
  );
}

// ─── Life Events ─────────────────────────────────────────────────────────────

const EVENT_TYPE_LABELS: Record<string, string> = {
  graduation: "Graduation",
  marriage: "Marriage",
  new_baby: "New Baby",
  moved: "Moved",
  new_job: "New Job",
  death: "Passing",
  custom: "Event",
};

const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS);

interface LifeEvent {
  id: string;
  personId: string;
  familyId: string;
  eventType: string;
  eventDate: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

function formatEventDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (m === 1 && d === 1) return String(y);
  if (d === 1) {
    return new Date(y!, m! - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function useLifeEvents(personId: string) {
  const { user } = useAuth();
  const [events, setEvents] = useState<LifeEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = async () => {
    const token = localStorage.getItem("oliveToken");
    const res = await fetch(`/api/persons/${personId}/life-events`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setEvents(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchEvents(); }, [personId]);

  const addEvent = async (data: { eventType: string; eventDate: string; notes?: string }) => {
    const token = localStorage.getItem("oliveToken");
    const res = await fetch(`/api/persons/${personId}/life-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (res.ok) await fetchEvents();
    return res;
  };

  const deleteEvent = async (eventId: string) => {
    const token = localStorage.getItem("oliveToken");
    const res = await fetch(`/api/life-events/${eventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setEvents((prev) => prev.filter((e) => e.id !== eventId));
  };

  return { events, loading, addEvent, deleteEvent, refetch: fetchEvents };
}

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CURRENT_YEAR = new Date().getFullYear();

function AddEventForm({ onAdd, onCancel }: { onAdd: (data: any) => Promise<Response>; onCancel: () => void }) {
  const { toast } = useToast();
  const [eventType, setEventType] = useState("graduation");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const m = month ? String(month).padStart(2, "0") : "01";
    const d = month && day ? String(day).padStart(2, "0") : "01";
    const eventDate = `${year}-${m}-${d}`;
    setSaving(true);
    const res = await onAdd({ eventType, eventDate, notes: notes || undefined });
    setSaving(false);
    if (res.ok) {
      onCancel();
    } else {
      toast({ variant: "destructive", title: "Failed to add event." });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-3 border-t border-border/60 mt-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Type</label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Year</label>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            {Array.from({ length: CURRENT_YEAR - 1899 + 5 }, (_, i) => CURRENT_YEAR + 5 - i).map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Month</label>
          <select
            value={month}
            onChange={(e) => { setMonth(e.target.value); setDay(""); }}
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="">Month</option>
            {MONTHS_SHORT.map((m, i) => (
              <option key={m} value={String(i + 1)}>{m}</option>
            ))}
          </select>
        </div>
        {month && (
          <div className="w-24 space-y-1">
            <label className="text-xs text-muted-foreground font-medium">Day</label>
            <select
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
            >
              <option value="">Day</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={String(d)}>{d}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground font-medium">Note (optional)</label>
        <Input
          placeholder="e.g. Graduated from UT Austin"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          className="bg-background"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving} className="flex-1">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function LifeEventsCard({
  personId,
  canEdit,
}: {
  personId: string;
  canEdit: boolean;
}) {
  const { events, loading, addEvent, deleteEvent } = useLifeEvents(personId);
  const [adding, setAdding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (eventId: string) => {
    setConfirmDeleteId(null);
    setDeletingId(eventId);
    await deleteEvent(eventId);
    setDeletingId(null);
  };

  if (loading) return null;
  if (!canEdit && events.length === 0) return null;

  return (
    <Card className="border border-border shadow-sm">
      <CardContent className="px-6 py-5">
        <div className="flex items-center justify-between border-b border-border pb-2 mb-1">
          <h3 className="font-serif text-base font-semibold text-foreground">Life Events</h3>
          {canEdit && !adding && (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-xs text-primary hover:opacity-70 transition-opacity cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          )}
        </div>

        {events.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground py-2">No life events logged yet.</p>
        )}

        <div className="space-y-0 divide-y divide-border/60">
          {events.map((event) => (
            <div key={event.id} className="flex items-start gap-3 py-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <CalendarDays className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}
                </p>
                <p className="text-xs text-muted-foreground">{formatEventDate(event.eventDate)}</p>
                {event.notes && (
                  <p className="text-sm text-muted-foreground mt-0.5">{event.notes}</p>
                )}
              </div>
              {canEdit && (
                deletingId === event.id ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mt-0.5" />
                ) : confirmDeleteId === event.id ? (
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-destructive">Delete?</span>
                    <button
                      onClick={() => handleDelete(event.id)}
                      className="text-xs font-semibold text-destructive hover:opacity-70 cursor-pointer"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-xs text-muted-foreground hover:opacity-70 cursor-pointer"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(event.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer mt-0.5"
                    title="Delete event"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )
              )}
            </div>
          ))}
        </div>

        {adding && (
          <AddEventForm
            onAdd={addEvent}
            onCancel={() => setAdding(false)}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ─── Memories ───────────────────────────────────────────────────────────────

interface MemoryEntry {
  id: string;
  body: string;
  photoUrls: string[];
  promptText: string | null;
  createdAt: string;
  contributorName: string;
  contributorRelationship: string | null;
  canEdit: boolean;
  canDelete: boolean;
}

const MAX_MEMORY_PHOTOS = 3;

function useMemories(personId: string) {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMemories = async () => {
    const token = localStorage.getItem("oliveToken");
    const res = await fetch(`/api/persons/${personId}/memories`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setMemories(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchMemories(); }, [personId]);

  const addMemory = async (data: { body: string; photoUrls?: string[] }) => {
    const token = localStorage.getItem("oliveToken");
    const res = await fetch(`/api/persons/${personId}/memories`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (res.ok) await fetchMemories();
    return res;
  };

  const editMemory = async (memoryId: string, data: { body?: string; photoUrls?: string[] }) => {
    const token = localStorage.getItem("oliveToken");
    const res = await fetch(`/api/memories/${memoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (res.ok) await fetchMemories();
    return res;
  };

  const deleteMemory = async (memoryId: string) => {
    const token = localStorage.getItem("oliveToken");
    const res = await fetch(`/api/memories/${memoryId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setMemories((prev) => prev.filter((m) => m.id !== memoryId));
  };

  return { memories, loading, addMemory, editMemory, deleteMemory };
}

function AddMemoryForm({ onAdd, onCancel }: { onAdd: (data: { body: string; photoUrls?: string[] }) => Promise<Response>; onCancel: () => void }) {
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: "destructive", title: "Image must be under 10 MB." });
      return;
    }
    const dataUrl = await resizeImageToDataUrl(file, 800);
    setPhotoUrls((prev) => [...prev, dataUrl].slice(0, MAX_MEMORY_PHOTOS));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    const res = await onAdd({ body: body.trim(), photoUrls });
    setSaving(false);
    if (res.ok) {
      onCancel();
    } else {
      toast({ variant: "destructive", title: "Failed to save memory." });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-3 border-t border-border/60 mt-3">
      <Textarea
        placeholder="Share a memory..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={4000}
        rows={4}
        className="bg-background"
      />
      {photoUrls.length > 0 && (
        <div className="flex gap-2">
          {photoUrls.map((url, i) => (
            <div key={i} className="relative w-16 h-16">
              <img src={url} className="w-16 h-16 rounded-md object-cover" />
              <button
                type="button"
                onClick={() => setPhotoUrls((prev) => prev.filter((_, idx) => idx !== i))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center cursor-pointer"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        {photoUrls.length < MAX_MEMORY_PHOTOS ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 text-xs text-primary hover:opacity-70 transition-opacity cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            Add photo
          </button>
        ) : <span />}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={saving || !body.trim()}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}

function MemoriesCard({
  personId,
  firstName,
  deceased,
  memoryCollectionEnabled,
}: {
  personId: string;
  firstName: string;
  deceased: boolean | null | undefined;
  memoryCollectionEnabled: boolean | null | undefined;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { memories, loading, addMemory, editMemory, deleteMemory } = useMemories(personId);
  const [adding, setAdding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [togglingCollection, setTogglingCollection] = useState(false);

  const setCollectionEnabled = async (enabled: boolean) => {
    setTogglingCollection(true);
    const token = localStorage.getItem("oliveToken");
    const res = await fetch(`/api/persons/${personId}/memory-collection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ enabled }),
    });
    setTogglingCollection(false);
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: getGetPersonQueryKey(personId) });
    } else {
      toast({ variant: "destructive", title: "Something went wrong." });
    }
  };

  if (!deceased) return null;

  if (!memoryCollectionEnabled) {
    return (
      <Card className="border border-border shadow-sm">
        <CardContent className="px-6 py-5 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Start collecting memories of {firstName} from the family?
          </p>
          <Button size="sm" disabled={togglingCollection} onClick={() => setCollectionEnabled(true)}>
            {togglingCollection ? <Loader2 className="w-4 h-4 animate-spin" /> : "Start"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (loading) return null;

  return (
    <Card className="border border-border shadow-sm">
      <CardContent className="px-6 py-5">
        <div className="flex items-center justify-between border-b border-border pb-2 mb-1">
          <h3 className="font-serif text-base font-semibold text-foreground">Memories</h3>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-xs text-primary hover:opacity-70 transition-opacity cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          )}
        </div>

        {memories.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground py-2">
            No memories shared yet. Be the first to add one.
          </p>
        )}

        <div className="space-y-0 divide-y divide-border/60">
          {memories.map((memory) => (
            <div key={memory.id} className="py-3">
              {memory.promptText && (
                <p className="text-xs text-muted-foreground italic mb-1">{memory.promptText}</p>
              )}
              {editingId === memory.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    maxLength={4000}
                    rows={4}
                    className="bg-background"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={savingEdit || !editBody.trim()}
                      onClick={async () => {
                        setSavingEdit(true);
                        const res = await editMemory(memory.id, { body: editBody.trim() });
                        setSavingEdit(false);
                        if (res.ok) setEditingId(null);
                      }}
                    >
                      {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-foreground whitespace-pre-wrap">{memory.body}</p>
              )}
              {memory.photoUrls.length > 0 && editingId !== memory.id && (
                <div className="flex gap-2 mt-2">
                  {memory.photoUrls.map((url, i) => (
                    <img key={i} src={url} className="w-20 h-20 rounded-md object-cover" />
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-xs text-muted-foreground">
                  {memory.contributorName}
                  {memory.contributorRelationship ? ` · ${memory.contributorRelationship}` : ""}
                </p>
                {editingId !== memory.id && (
                  <div className="flex items-center gap-3">
                    {memory.canEdit && (
                      <button
                        onClick={() => { setEditingId(memory.id); setEditBody(memory.body); }}
                        className="text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                      >
                        Edit
                      </button>
                    )}
                    {memory.canDelete && (
                      confirmDeleteId === memory.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-destructive">Delete?</span>
                          <button onClick={() => { deleteMemory(memory.id); setConfirmDeleteId(null); }} className="text-xs font-semibold text-destructive hover:opacity-70 cursor-pointer">Yes</button>
                          <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-muted-foreground hover:opacity-70 cursor-pointer">No</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(memory.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                          title="Delete memory"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {adding && <AddMemoryForm onAdd={addMemory} onCancel={() => setAdding(false)} />}

        {user?.isAdmin && (
          <button
            onClick={() => setCollectionEnabled(false)}
            className="text-xs text-muted-foreground hover:opacity-70 transition-opacity cursor-pointer mt-4"
          >
            Turn off memory collection for {firstName}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── ContactRow ───────────────────────────────────────────────────────────────

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
  href?: string;
}) {
  if (!value) return null;

  const inner = (
    <div className="flex items-start gap-3 py-3">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground leading-none mb-0.5">{label}</p>
        <p className="text-sm font-medium text-foreground break-all">{value}</p>
      </div>
    </div>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block hover:bg-muted/50 rounded-lg px-3 -mx-3 transition-colors"
      >
        {inner}
      </a>
    );
  }
  return <div className="px-3 -mx-3">{inner}</div>;
}

// ─── ProfileView ──────────────────────────────────────────────────────────────

function resizeImageToDataUrl(file: File, maxPx = 400, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function ProfileView({
  person,
  canEdit,
  onEdit,
  targetId,
  isOwnProfile,
}: {
  person: any;
  canEdit: boolean;
  onEdit: () => void;
  targetId: string;
  isOwnProfile: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateMutation = useUpdatePerson();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  const address = formatAddress(person);
  const birthday = formatBirthday(person.birthday);
  const mapsHref = address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : undefined;
  const showWish =
    !isOwnProfile && !person.deceased && !!person.birthday && Math.abs(daysUntilBirthday(person.birthday)) <= 7;

  const hasContact = !!(person.phone || person.email || address);
  // Per-handle hiding is enforced server-side (hidden handles come back null to
  // non-owner/non-admin viewers), so the frontend just checks if anything is left to show.
  const hasSocial = !!(
    person.instagram || person.facebook || person.tiktok || person.linkedin ||
    person.snapchat || person.venmo || person.bereal || person.otherSocial
  );

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ variant: "destructive", title: "Please select an image file." });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: "destructive", title: "Image must be under 10 MB." });
      return;
    }

    setPhotoUploading(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      await updateMutation.mutateAsync(
        { personId: targetId, data: { photoUrl: dataUrl } },
      );
      queryClient.invalidateQueries({ queryKey: getGetPersonQueryKey(targetId) });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: "Photo updated!" });
    } catch {
      toast({ variant: "destructive", title: "Upload failed", description: "Please try again." });
    } finally {
      setPhotoUploading(false);
    }
  };

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoChange}
      />

      {/* Header card */}
      <Card className="overflow-hidden border border-border shadow-sm">
        <div className="h-24 bg-gradient-to-r from-primary/15 via-primary/10 to-accent/15" />
        <CardContent className="px-6 pb-6 pt-0">
          <div className="flex items-end justify-between -mt-12 mb-4">
            {/* Avatar with upload overlay */}
            <div className="relative group w-24 h-24">
              <PersonAvatar firstName={person.firstName} lastName={person.lastName} photoUrl={person.photoUrl} size="xl" className="border-card" />
              {canEdit && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={photoUploading}
                  className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer border-4 border-card"
                  title="Change photo"
                >
                  {photoUploading
                    ? <Loader2 className="w-6 h-6 text-white animate-spin" />
                    : <Camera className="w-6 h-6 text-white" />
                  }
                </button>
              )}
            </div>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={onEdit} className="rounded-full mb-1">
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                Edit
              </Button>
            )}
          </div>
          <h2 className="text-2xl font-serif font-bold text-foreground leading-tight">
            {person.firstName} {person.lastName}
          </h2>
          <p className="text-muted-foreground text-sm mt-1">{person.viewerRelationshipLabel ?? person.relationshipLabel}</p>
          {!isOwnProfile && person.profileCompleteness != null && person.profileCompleteness < 100 && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-700">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span>
                {person.profileCompleteness}% complete
                {person.missingPriorityField &&
                  ` — missing ${MISSING_FIELD_LABEL[person.missingPriorityField] ?? person.missingPriorityField}`}
              </span>
            </div>
          )}
          {birthday && (
            <div className="flex items-center gap-1.5 mt-2">
              <Cake className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="text-sm text-muted-foreground">{birthday}</span>
            </div>
          )}
          {showWish && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 rounded-full border-primary/30 text-primary hover:bg-primary/5"
              onClick={() => sendBirthdayWish(person, toast)}
            >
              <Gift className="w-3.5 h-3.5 mr-1.5" />
              Send birthday wish
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Contact */}
      {hasContact && (
        <Card className="border border-border shadow-sm">
          <CardContent className="px-6 py-5">
            <h3 className="font-serif text-base font-semibold text-foreground border-b border-border pb-2 mb-1">
              Contact
            </h3>
            <div className="divide-y divide-border/60">
              <ContactRow
                icon={Phone}
                label="Phone"
                value={person.phone}
                href={person.phone ? `tel:${person.phone}` : undefined}
              />
              <ContactRow
                icon={Mail}
                label="Email"
                value={person.email}
                href={person.email ? `mailto:${person.email}` : undefined}
              />
              <ContactRow
                icon={MapPin}
                label="Address"
                value={address}
                href={mapsHref}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Social */}
      {hasSocial && (
        <Card className="border border-border shadow-sm">
          <CardContent className="px-6 py-5">
            <h3 className="font-serif text-base font-semibold text-foreground border-b border-border pb-2 mb-1">
              Social
            </h3>
            <div className="divide-y divide-border/60">
              <ContactRow
                icon={Instagram}
                label="Instagram"
                value={person.instagram ? `@${person.instagram.replace(/^@/, "")}` : null}
                href={
                  person.instagram
                    ? `https://instagram.com/${person.instagram.replace(/^@/, "")}`
                    : undefined
                }
              />
              <ContactRow
                icon={Facebook}
                label="Facebook"
                value={person.facebook}
                href={
                  person.facebook ? `https://facebook.com/${person.facebook}` : undefined
                }
              />
              <ContactRow
                icon={TikTokIcon}
                label="TikTok"
                value={person.tiktok ? `@${person.tiktok.replace(/^@/, "")}` : null}
                href={
                  person.tiktok
                    ? `https://tiktok.com/@${person.tiktok.replace(/^@/, "")}`
                    : undefined
                }
              />
              <ContactRow
                icon={Linkedin}
                label="LinkedIn"
                value={person.linkedin}
                href={
                  person.linkedin ? `https://linkedin.com/in/${person.linkedin}` : undefined
                }
              />
              <ContactRow
                icon={SnapchatIcon}
                label="Snapchat"
                value={person.snapchat ? `@${person.snapchat.replace(/^@/, "")}` : null}
                href={
                  person.snapchat
                    ? `https://snapchat.com/add/${person.snapchat.replace(/^@/, "")}`
                    : undefined
                }
              />
              <ContactRow
                icon={VenmoIcon}
                label="Venmo"
                value={person.venmo ? `@${person.venmo.replace(/^@/, "")}` : null}
                href={
                  person.venmo
                    ? `https://venmo.com/${person.venmo.replace(/^@/, "")}`
                    : undefined
                }
              />
              <ContactRow
                icon={BeRealIcon}
                label="BeReal"
                value={person.bereal ? `@${person.bereal.replace(/^@/, "")}` : null}
                href={undefined}
              />
              <ContactRow
                icon={LinkIcon}
                label="Other"
                value={person.otherSocial}
                href={
                  person.otherSocial?.startsWith("http") ? person.otherSocial : undefined
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Life Events */}
      <LifeEventsCard personId={targetId} canEdit={canEdit} />

      {/* Memories */}
      <MemoriesCard
        personId={targetId}
        firstName={person.firstName}
        deceased={person.deceased}
        memoryCollectionEnabled={person.memoryCollectionEnabled}
      />

      {/* Empty state */}
      {!hasContact && !hasSocial && (
        <div className="text-center py-10 text-muted-foreground text-sm">
          No contact details added yet.
          {canEdit && (
            <>
              {" "}
              <button onClick={onEdit} className="underline text-primary hover:opacity-80 cursor-pointer">
                Add some.
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ErrorBoundary ────────────────────────────────────────────────────────────

class ProfileEditErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive space-y-2">
          <p className="font-semibold">Something went wrong loading the edit form.</p>
          <p className="text-sm opacity-80 font-mono break-all">{this.state.error.message}</p>
          <button
            className="text-sm underline cursor-pointer"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── ProfileEditForm ──────────────────────────────────────────────────────────

function ProfileEditForm({
  person,
  targetId,
  isOwnProfile,
  onCancel,
  onboarding = false,
}: {
  person: any;
  targetId: string;
  isOwnProfile: boolean;
  onCancel: () => void;
  onboarding?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateMutation = useUpdatePerson();
  const [, setLocation] = useLocation();

  const bdParts = parseBirthdayParts(person?.birthday);

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: person?.firstName ?? "",
      lastName: person?.lastName ?? "",
      relationshipLabel: person?.relationshipLabel ?? "",
      gender: (person?.gender as "male" | "female" | null) ?? null,
      phone: person?.phone ?? "",
      email: person?.email ?? "",
      addressLine1: person?.addressLine1 ?? "",
      addressCity: person?.addressCity ?? "",
      addressState: person?.addressState ?? "",
      addressZip: person?.addressZip ?? "",
      addressCountry: person?.addressCountry ?? "",
      birthdayMonth: bdParts.month,
      birthdayDay: bdParts.day,
      birthdayYear: bdParts.year,
      showBirthYear: person?.showBirthYear ?? false,
      deceased: person?.deceased ?? false,
      dateOfPassing: person?.dateOfPassing ?? "",
      instagram: person?.instagram ?? "",
      facebook: person?.facebook ?? "",
      tiktok: person?.tiktok ?? "",
      linkedin: person?.linkedin ?? "",
      snapchat: person?.snapchat ?? "",
      venmo: person?.venmo ?? "",
      bereal: person?.bereal ?? "",
      otherSocial: person?.otherSocial ?? "",
      tier2ContactField: (person?.tier2ContactField as "phone" | "email") ?? "phone",
      confirmedMembersOnly: person?.confirmedMembersOnly ?? false,
      hideAddress: person?.hideAddress ?? false,
      hideInstagram: person?.hideInstagram ?? false,
      hideFacebook: person?.hideFacebook ?? false,
      hideTiktok: person?.hideTiktok ?? false,
      hideLinkedin: person?.hideLinkedin ?? false,
      hideSnapchat: person?.hideSnapchat ?? false,
      hideVenmo: person?.hideVenmo ?? false,
      hideBereal: person?.hideBereal ?? false,
      hideOtherSocial: person?.hideOtherSocial ?? false,
    },
  });

  const onSubmit = (data: ProfileForm) => {
    let birthday: string | null = null;
    if (data.birthdayMonth && data.birthdayDay) {
      const m = String(parseInt(data.birthdayMonth, 10)).padStart(2, "0");
      const d = String(parseInt(data.birthdayDay, 10)).padStart(2, "0");
      const y = data.birthdayYear || "2000";
      birthday = `${y}-${m}-${d}`;
    }

    const cleaned = {
      firstName: data.firstName,
      lastName: data.lastName,
      relationshipLabel: data.relationshipLabel,
      gender: data.gender || null,
      phone: data.phone || null,
      email: data.email || null,
      addressLine1: data.addressLine1 || null,
      addressCity: data.addressCity || null,
      addressState: data.addressState || null,
      addressZip: data.addressZip || null,
      addressCountry: data.addressCountry || null,
      birthday,
      showBirthYear: data.birthdayYear ? data.showBirthYear : false,
      deceased: data.deceased,
      dateOfPassing: data.deceased ? (data.dateOfPassing || null) : null,
      instagram: data.instagram || null,
      facebook: data.facebook || null,
      tiktok: data.tiktok || null,
      linkedin: data.linkedin || null,
      snapchat: data.snapchat || null,
      venmo: data.venmo || null,
      bereal: data.bereal || null,
      otherSocial: data.otherSocial || null,
      tier2ContactField: data.tier2ContactField,
      confirmedMembersOnly: data.confirmedMembersOnly,
      hideAddress: data.hideAddress,
      hideInstagram: data.hideInstagram,
      hideFacebook: data.hideFacebook,
      hideTiktok: data.hideTiktok,
      hideLinkedin: data.hideLinkedin,
      hideSnapchat: data.hideSnapchat,
      hideVenmo: data.hideVenmo,
      hideBereal: data.hideBereal,
      hideOtherSocial: data.hideOtherSocial,
    };

    updateMutation.mutate(
      { personId: targetId, data: cleaned as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPersonQueryKey(targetId) });
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListMembersQueryKey(person.familyUnitId) });
          toast({ title: "Profile updated" });
          if (onboarding) {
            // First-claim flow: send them straight to the welcome dashboard
            // (no ?onboarding so they won't be locked back in).
            setLocation("/welcome");
          } else {
            onCancel();
          }
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Update failed",
            description: error?.message,
          });
        },
      }
    );
  };

  // Onboarding gate: phone AND birthday must both be filled before the user
  // can save and continue. We watch the live form values so the Save button
  // enables the instant they fill in the last missing field.
  const watchedPhone = form.watch("phone");
  const watchedBdMonth = form.watch("birthdayMonth");
  const watchedBdDay = form.watch("birthdayDay");
  const hasPhone = !!watchedPhone && watchedPhone.trim().length > 0;
  const hasBirthday = !!watchedBdMonth && !!watchedBdDay;
  const onboardingComplete = !onboarding || (hasPhone && hasBirthday);

  return (
    <div className="max-w-2xl mx-auto">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* First-claim onboarding banner */}
          {onboarding && (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-medium text-foreground">
                Welcome — let's finish setting up your profile.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Please add your <strong>phone number</strong> and <strong>birthday</strong>
                {" "}so your family can reach you and celebrate with you. You can fill in
                the rest later.
              </p>
            </div>
          )}

          {/* Basic */}
          <section className="space-y-4">
            <h3 className="font-serif text-lg font-semibold border-b pb-2">Basic Info</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(["firstName", "lastName", "relationshipLabel"] as const).map((name) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {name === "firstName" ? "First Name" : name === "lastName" ? "Last Name" : "Relationship Role"}
                      </FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} className="bg-background" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                      >
                        <option value="">Prefer not to say</option>
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Birthday</label>
                <div className="flex gap-2">
                  <FormField
                    control={form.control}
                    name="birthdayMonth"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <select
                            {...field}
                            value={field.value ?? ""}
                            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                          >
                            <option value="">Month</option>
                            {MONTHS.map((m, i) => (
                              <option key={m} value={String(i + 1)}>{m}</option>
                            ))}
                          </select>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="birthdayDay"
                    render={({ field }) => (
                      <FormItem className="w-24">
                        <FormControl>
                          <select
                            {...field}
                            value={field.value ?? ""}
                            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                          >
                            <option value="">Day</option>
                            {DAYS.map((d) => (
                              <option key={d} value={String(d)}>{d}</option>
                            ))}
                          </select>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="birthdayYear"
                    render={({ field }) => (
                      <FormItem className="w-28">
                        <FormControl>
                          <select
                            {...field}
                            value={field.value ?? ""}
                            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                          >
                            <option value="">Year</option>
                            {Array.from({ length: new Date().getFullYear() - 1919 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                              <option key={y} value={String(y)}>{y}</option>
                            ))}
                          </select>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                {form.watch("birthdayYear") && (
                  <FormField
                    control={form.control}
                    name="showBirthYear"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 mt-1">
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <label className="text-sm text-muted-foreground cursor-pointer" onClick={() => field.onChange(!field.value)}>
                          Show birth year to family
                        </label>
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </div>
          </section>

          {/* Passing */}
          <section className="space-y-4">
            <FormField
              control={form.control}
              name="deceased"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <label className="text-sm text-muted-foreground cursor-pointer" onClick={() => field.onChange(!field.value)}>
                    This person has passed away
                  </label>
                </FormItem>
              )}
            />
            {form.watch("deceased") && (
              <FormField
                control={form.control}
                name="dateOfPassing"
                render={({ field }) => (
                  <FormItem className="w-48">
                    <FormLabel>Date of passing</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ""} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
          </section>

          {/* Contact */}
          <section className="space-y-4">
            <h3 className="font-serif text-lg font-semibold border-b pb-2">Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(
                [
                  { name: "phone", label: "Phone", type: "tel", placeholder: "+1 (555) 000-0000" },
                  { name: "email", label: "Email", type: "email", placeholder: "email@example.com" },
                ] as const
              ).map(({ name, label, type, placeholder }) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
                      <FormControl>
                        <Input
                          type={type}
                          placeholder={placeholder}
                          {...field}
                          value={(field.value as string) ?? ""}
                          className="bg-background"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
            <FormField
              control={form.control}
              name="addressLine1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Street Address</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="123 Main St"
                      {...field}
                      value={field.value ?? ""}
                      className="bg-background"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="addressCity"
                render={({ field }) => (
                  <FormItem className="col-span-2 md:col-span-1">
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} className="bg-background" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="addressState"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} className="bg-background" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="addressZip"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ZIP</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} className="bg-background" />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </section>

          {/* Social */}
          <section className="space-y-4">
            <h3 className="font-serif text-lg font-semibold border-b pb-2">Social</h3>
            {isOwnProfile && (
              <p className="text-xs text-muted-foreground -mt-2">
                Toggle a handle to hide it from the family directory. You and admins can always see it.
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(
                [
                  { name: "instagram", hideName: "hideInstagram", label: "Instagram", placeholder: "username" },
                  { name: "facebook", hideName: "hideFacebook", label: "Facebook", placeholder: "username or URL" },
                  { name: "tiktok", hideName: "hideTiktok", label: "TikTok", placeholder: "username" },
                  { name: "linkedin", hideName: "hideLinkedin", label: "LinkedIn", placeholder: "username" },
                  { name: "snapchat", hideName: "hideSnapchat", label: "Snapchat", placeholder: "username" },
                  { name: "venmo", hideName: "hideVenmo", label: "Venmo", placeholder: "username" },
                  { name: "bereal", hideName: "hideBereal", label: "BeReal", placeholder: "username" },
                  { name: "otherSocial", hideName: "hideOtherSocial", label: "Other Link", placeholder: "https://..." },
                ] as const
              ).map(({ name, hideName, label, placeholder }) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between gap-2">
                        <FormLabel>{label}</FormLabel>
                        {isOwnProfile && (
                          <FormField
                            control={form.control}
                            name={hideName}
                            render={({ field: hideField }) => (
                              <button
                                type="button"
                                onClick={() => hideField.onChange(!hideField.value)}
                                className={`flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer ${
                                  hideField.value ? "text-muted-foreground" : "text-primary"
                                }`}
                                title={
                                  hideField.value
                                    ? "Hidden from family — click to make visible"
                                    : "Visible to family — click to hide"
                                }
                              >
                                {hideField.value ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                {hideField.value ? "Hidden" : "Visible"}
                              </button>
                            )}
                          />
                        )}
                      </div>
                      <FormControl>
                        <Input
                          placeholder={placeholder}
                          {...field}
                          value={(field.value as string) ?? ""}
                          className="bg-background"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </section>

          {/* Privacy — only shown on own profile */}
          {isOwnProfile && (
            <section className="space-y-4">
              <h3 className="font-serif text-lg font-semibold border-b pb-2">Privacy</h3>

              {/* Tier 2 contact field */}
              <FormField
                control={form.control}
                name="tier2ContactField"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Contact info shared with extended family
                    </FormLabel>
                    <p className="text-xs text-muted-foreground -mt-1 mb-2">
                      Grandparents, in-laws, nieces, and nephews in your own family unit see only
                      one contact method below — not your full profile.
                    </p>
                    <div className="flex gap-3">
                      {(["phone", "email"] as const).map((opt) => (
                        <label
                          key={opt}
                          className={`flex items-center gap-2 cursor-pointer rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                            field.value === opt
                              ? "border-primary bg-primary/5 text-primary font-medium"
                              : "border-border text-muted-foreground hover:border-primary/50"
                          }`}
                        >
                          <input
                            type="radio"
                            className="sr-only"
                            value={opt}
                            checked={field.value === opt}
                            onChange={() => field.onChange(opt)}
                          />
                          <span className="capitalize">{opt}</span>
                        </label>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Confirmed members only */}
              <FormField
                control={form.control}
                name="confirmedMembersOnly"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
                      <div>
                        <FormLabel className="text-sm font-medium leading-none">
                          Stay private from linked families
                        </FormLabel>
                        <p className="text-xs text-muted-foreground mt-1">
                          People in a family branch linked to yours (e.g. connected through
                          marriage) can normally see your name, photo, and how you're related,
                          even if you're not closely connected to them. Turn this on to hide your
                          profile from them completely. This doesn't affect your own family unit.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={field.value}
                        onClick={() => field.onChange(!field.value)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                          field.value ? "bg-primary" : "bg-muted"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            field.value ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Hide address */}
              <FormField
                control={form.control}
                name="hideAddress"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
                      <div>
                        <FormLabel className="text-sm font-medium leading-none">
                          Hide my address
                        </FormLabel>
                        <p className="text-xs text-muted-foreground mt-1">
                          Don&apos;t show your address to anyone in the family directory. You and admins can still see it.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={field.value}
                        onClick={() => field.onChange(!field.value)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                          field.value ? "bg-primary" : "bg-muted"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            field.value ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Per-handle social visibility is now set inline in the Social section above. */}
            </section>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              disabled={updateMutation.isPending || !onboardingComplete}
              className="flex-1 md:flex-none md:w-32"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateMutation.isPending
                ? "Saving..."
                : onboarding
                  ? "Save & continue"
                  : "Save"}
            </Button>
            {/* Hide Cancel during the first-claim onboarding so the user
                can't escape without filling phone + birthday. */}
            {!onboarding && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Profile() {
  // useParams and useLocation are both relative to the Wouter v3 nested routing context.
  // window.location.pathname is the only reliable source of the real absolute URL.
  const { personId: paramPersonId } = useParams<{ personId?: string }>();
  const personIdFromUrl = window.location.pathname.match(/\/members\/([^/]+)/)?.[1];
  const personId = personIdFromUrl || paramPersonId;

  const { user } = useAuth();

  // First-claim onboarding: invite-claim.tsx redirects here with
  // ?onboarding=1 so the user lands in edit mode and is forced to enter
  // phone + birthday before they can save and continue. We read once at
  // mount; navigating away later clears the flag naturally.
  const onboarding =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("onboarding") === "1";
  const [editing, setEditing] = useState(onboarding);
  useEffect(() => {
    if (onboarding) setEditing(true);
  }, [onboarding]);

  const targetId = personId || user?.id;
  const isOwnProfile = !personId || user?.id === personId;
  const canEdit = isOwnProfile || !!user?.isAdmin;

  const {
    data: person,
    isLoading,
    isError,
  } = useGetPerson(targetId || "", {
    query: {
      enabled: !!targetId,
      queryKey: getGetPersonQueryKey(targetId || ""),
    },
  });

  const backHref = personId ? "/members" : "/dashboard";

  if (isLoading) {
    return (
      <div className="space-y-5 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <Link href={backHref}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <Skeleton className="h-9 w-48" />
        </div>
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-36 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !person) {
    return (
      <div className="space-y-5 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <Link href={backHref}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-3xl font-serif font-bold text-foreground">Profile</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <AlertCircle className="w-10 h-10 text-destructive/60" />
          <p className="font-medium">Could not load this profile.</p>
          <Link href={backHref}>
            <Button variant="outline" size="sm">Go back</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        {!onboarding && (
          <Link href={backHref}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
        )}
        <h1 className="text-3xl font-serif font-bold text-foreground">
          {isOwnProfile ? "Your Profile" : `${person.firstName}'s Profile`}
        </h1>
      </div>

      {editing ? (
        <ProfileEditErrorBoundary>
          <ProfileEditForm
            person={person}
            targetId={targetId!}
            isOwnProfile={isOwnProfile}
            onCancel={() => setEditing(false)}
            onboarding={onboarding && isOwnProfile}
          />
        </ProfileEditErrorBoundary>
      ) : (
        <ProfileView
          person={person}
          canEdit={canEdit}
          onEdit={() => setEditing(true)}
          targetId={targetId!}
          isOwnProfile={isOwnProfile}
        />
      )}
    </div>
  );
}
