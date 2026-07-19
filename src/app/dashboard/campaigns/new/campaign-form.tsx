"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Megaphone, Users } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CAMPAIGN_DEFAULTS,
  describeCallingWindow,
  formatMinutesWords,
} from "@/lib/campaign-ui/progress";

interface OutboundVariable {
  name: string;
  label: string;
  type: string;
  required: boolean;
  description: string;
}

interface OutboundCallType {
  id: string;
  name: string;
  description: string;
  category: string;
  requiresConsent: boolean;
  variables: OutboundVariable[];
}

interface OutboundTypesResponse {
  industry: string;
  allowOutbound: boolean;
  hasPhoneNumber: boolean;
  callTypes: OutboundCallType[];
}

interface Contact {
  id: string;
  phone: string;
  tags: string[] | null;
  do_not_call: boolean;
}

const categoryLabel: Record<string, string> = {
  reminder: "Reminder",
  confirmation: "Confirmation",
  alert: "Alert",
  outreach: "Outreach",
  campaign: "Campaign",
};

type Audience = "all" | "tags";

/**
 * The settings the API applies when a field is omitted, as the form's starting
 * values. Presented as the real defaults rather than blank boxes so the
 * operator can see the pacing policy they are accepting — and so this screen
 * can never quietly disagree with the column defaults in migration 014.
 */
interface CampaignSettings {
  max_concurrent_calls: string;
  calls_per_minute: string;
  calling_window_start: string;
  calling_window_end: string;
  max_attempts: string;
  retry_delay_minutes: string;
}

// Annotated rather than inferred: CAMPAIGN_DEFAULTS is `as const`, so without
// this the window fields narrow to the literals "09:00"/"20:00" and the
// start-equals-end guard below becomes a compile error instead of a real check.
const INITIAL_SETTINGS: CampaignSettings = {
  max_concurrent_calls: String(CAMPAIGN_DEFAULTS.max_concurrent_calls),
  calls_per_minute: String(CAMPAIGN_DEFAULTS.calls_per_minute),
  calling_window_start: CAMPAIGN_DEFAULTS.calling_window_start,
  calling_window_end: CAMPAIGN_DEFAULTS.calling_window_end,
  max_attempts: String(CAMPAIGN_DEFAULTS.max_attempts),
  retry_delay_minutes: String(CAMPAIGN_DEFAULTS.retry_delay_minutes),
};

/** Small "Default 3" hint shown under a numeric field. */
function DefaultHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

export function CampaignForm() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState<OutboundTypesResponse | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const [name, setName] = useState("");
  const [callTypeId, setCallTypeId] = useState<string | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [audience, setAudience] = useState<Audience>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Named inner async function rather than awaiting in the effect body, so no
    // setState runs synchronously during the effect (react-hooks/set-state-in-effect).
    async function load() {
      try {
        const [typesRes, contactsRes] = await Promise.all([
          fetch("/api/v1/calls/outbound/types"),
          fetch("/api/v1/contacts?limit=500"),
        ]);
        const typesBody = await typesRes.json();
        const contactsBody = await contactsRes.json();
        if (cancelled) return;

        if (!typesRes.ok) {
          toast.error(typesBody.error ?? "Couldn't load the kinds of call your agent can make.");
        } else {
          setTypes(typesBody);
          setCallTypeId((prev) => prev ?? typesBody.callTypes?.[0]?.id ?? null);
        }
        if (contactsRes.ok) setContacts(contactsBody.data ?? []);
      } catch {
        if (!cancelled) toast.error("Couldn't load this page. Try refreshing.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedType = types?.callTypes.find((t) => t.id === callTypeId) ?? null;

  // Do-not-call contacts are filtered out by the targets endpoint too. Counting
  // them out here as well means the number on screen is the number that will
  // actually be queued, rather than a promise the next screen quietly breaks.
  const callable = contacts.filter((c) => !c.do_not_call && c.phone?.trim());
  const doNotCallCount = contacts.length - callable.length;

  const allTags = [...new Set(callable.flatMap((c) => c.tags ?? []))].sort();
  const taggedCount = callable.filter((c) =>
    (c.tags ?? []).some((t) => selectedTags.includes(t))
  ).length;
  const audienceCount = audience === "all" ? callable.length : taggedCount;

  function toggleTag(tag: string) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function handleSelectType(id: string) {
    setCallTypeId(id);
    setVariables({});
  }

  function updateSetting(key: keyof CampaignSettings, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Give your campaign a name.");
      return;
    }
    if (!selectedType) {
      toast.error("Choose what these calls are about.");
      return;
    }
    if (settings.calling_window_start === settings.calling_window_end) {
      toast.error("The calling window has to start and end at different times.");
      return;
    }
    if (audience === "tags" && selectedTags.length === 0) {
      toast.error("Choose at least one tag, or call everyone in your contacts.");
      return;
    }
    if (audienceCount === 0) {
      toast.error("Nobody matches that audience yet.");
      return;
    }
    const missing = selectedType.variables.filter((v) => v.required && !variables[v.name]?.trim());
    if (missing.length > 0) {
      toast.error(`Fill in: ${missing.map((v) => v.label).join(", ")}`);
      return;
    }

    setCreating(true);
    try {
      // Two calls on purpose, matching the API's own split: the campaign is the
      // policy and is created as a draft, then the list of people is built onto
      // it. Nothing dials until the operator starts it on the next screen.
      const createRes = await fetch("/api/v1/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          call_type_id: selectedType.id,
          max_concurrent_calls: Number(settings.max_concurrent_calls),
          calls_per_minute: Number(settings.calls_per_minute),
          calling_window_start: settings.calling_window_start,
          calling_window_end: settings.calling_window_end,
          max_attempts: Number(settings.max_attempts),
          retry_delay_minutes: Number(settings.retry_delay_minutes),
          variables,
        }),
      });
      const createBody = await createRes.json();
      if (!createRes.ok) {
        toast.error(createBody.error ?? "Couldn't create that campaign.");
        return;
      }

      const campaignId: string = createBody.data.id;

      const targetsRes = await fetch(`/api/v1/campaigns/${campaignId}/targets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(audience === "all" ? { all_contacts: true } : { tags: selectedTags }),
      });
      const targetsBody = await targetsRes.json();

      if (!targetsRes.ok) {
        // The campaign exists but has nobody in it. Say so plainly and still
        // hand the operator the campaign, rather than losing it silently.
        toast.error(
          targetsBody.error ??
            "Campaign created, but nobody could be added to it. Add people from its page."
        );
        router.push(`/dashboard/campaigns/${campaignId}`);
        return;
      }

      const { added, skipped_do_not_call: skippedDnc } = targetsBody.data;
      const parts = [`${added} ${added === 1 ? "person" : "people"} added`];
      if (skippedDnc) parts.push(`${skippedDnc} left out as do not call`);
      toast.success(`Campaign created — ${parts.join(", ")}.`);
      router.push(`/dashboard/campaigns/${campaignId}`);
    } catch {
      toast.error("Couldn't create that campaign.");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" aria-hidden="true" />
        Loading...
      </div>
    );
  }

  if (!types) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Couldn&apos;t load this page</CardTitle>
          <CardDescription>Try refreshing.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const blocked = !types.allowOutbound || !types.hasPhoneNumber;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {blocked && (
        <Card className="border-warning/40">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <p className="font-medium">
                {types.allowOutbound
                  ? "No phone number assigned"
                  : "Outbound calling is switched off"}
              </p>
              <p className="text-sm text-muted-foreground">
                {types.allowOutbound
                  ? "This business has no active number to call from, so a campaign can be planned but not started."
                  : "You can plan a campaign now, but nothing will be dialled until outbound calling is turned on."}{" "}
                <Link href="/dashboard/outbound" className="underline underline-offset-4">
                  Open outbound settings
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Basics ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What is this campaign?</CardTitle>
          <CardDescription>
            Name it for yourself, then pick what the calls are about.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="campaign-name">Campaign name</Label>
            <Input
              id="campaign-name"
              placeholder="e.g. October appointment reminders"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              required
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>What the calls are about</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {types.callTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => handleSelectType(type.id)}
                  aria-pressed={callTypeId === type.id}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    callTypeId === type.id ? "border-brand bg-accent/60" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{type.name}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {categoryLabel[type.category] ?? type.category}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{type.description}</p>
                  {type.requiresConsent && (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-warning">
                      <AlertTriangle className="size-3" aria-hidden="true" />
                      Requires prior opt-in
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>

          {selectedType && selectedType.variables.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label>Details for every call in this campaign</Label>
                <p className="text-xs text-muted-foreground">
                  Used in what the agent says. The same values are used for everyone on the list.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {selectedType.variables.map((v) => (
                    <div key={v.name} className="space-y-2">
                      <Label htmlFor={`var-${v.name}`}>
                        {v.label}
                        {v.required && <span className="text-destructive"> *</span>}
                      </Label>
                      <Input
                        id={`var-${v.name}`}
                        type={
                          v.type === "date"
                            ? "date"
                            : v.type === "time"
                              ? "time"
                              : v.type === "number" || v.type === "currency"
                                ? "number"
                                : "text"
                        }
                        placeholder={v.description}
                        value={variables[v.name] ?? ""}
                        onChange={(e) =>
                          setVariables((prev) => ({ ...prev, [v.name]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Audience ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who to call</CardTitle>
          <CardDescription>
            Built from your contacts. Anyone marked do not call is left out automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {contacts.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Users className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium">You have no contacts yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                A campaign calls people from your contact book.{" "}
                <Link href="/dashboard/contacts" className="underline underline-offset-4">
                  Add or import contacts
                </Link>{" "}
                first.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setAudience("all")}
                  aria-pressed={audience === "all"}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    audience === "all" ? "border-brand bg-accent/60" : "hover:bg-muted/50"
                  }`}
                >
                  <span className="text-sm font-medium">Everyone in my contacts</span>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {callable.length} {callable.length === 1 ? "person" : "people"} can be called
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setAudience("tags")}
                  aria-pressed={audience === "tags"}
                  disabled={allTags.length === 0}
                  className={`rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    audience === "tags" ? "border-brand bg-accent/60" : "hover:bg-muted/50"
                  }`}
                >
                  <span className="text-sm font-medium">Only people with certain tags</span>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {allTags.length === 0
                      ? "None of your contacts are tagged yet"
                      : `${allTags.length} ${allTags.length === 1 ? "tag" : "tags"} to choose from`}
                  </p>
                </button>
              </div>

              {audience === "tags" && allTags.length > 0 && (
                <div className="space-y-2">
                  <Label>Tags to include</Label>
                  <div className="flex flex-wrap gap-2">
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        aria-pressed={selectedTags.includes(tag)}
                        className={`rounded-4xl border px-3 py-1 text-xs transition-colors ${
                          selectedTags.includes(tag)
                            ? "border-brand bg-accent/60 font-medium"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Anyone with at least one of the chosen tags is included.
                  </p>
                </div>
              )}

              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium">
                  {audienceCount} {audienceCount === 1 ? "person" : "people"} will be called
                </p>
                {doNotCallCount > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {doNotCallCount} left out as do not call.
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Pacing, hours, retries ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How the calling is paced</CardTitle>
          <CardDescription>
            These are the settings we use unless you change them. They exist to keep the campaign
            from overwhelming your line — or the people on it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="max-concurrent">Calls at the same time</Label>
              <Input
                id="max-concurrent"
                type="number"
                min={1}
                max={50}
                value={settings.max_concurrent_calls}
                onChange={(e) => updateSetting("max_concurrent_calls", e.target.value)}
              />
              <DefaultHint>Default {CAMPAIGN_DEFAULTS.max_concurrent_calls}, up to 50.</DefaultHint>
            </div>
            <div className="space-y-2">
              <Label htmlFor="per-minute">New calls per minute</Label>
              <Input
                id="per-minute"
                type="number"
                min={1}
                max={60}
                value={settings.calls_per_minute}
                onChange={(e) => updateSetting("calls_per_minute", e.target.value)}
              />
              <DefaultHint>Default {CAMPAIGN_DEFAULTS.calls_per_minute}, up to 60.</DefaultHint>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="window-start">Start calling at</Label>
              <Input
                id="window-start"
                type="time"
                value={settings.calling_window_start}
                onChange={(e) => updateSetting("calling_window_start", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="window-end">Stop calling at</Label>
              <Input
                id="window-end"
                type="time"
                value={settings.calling_window_end}
                onChange={(e) => updateSetting("calling_window_end", e.target.value)}
              />
            </div>
          </div>
          <DefaultHint>
            {describeCallingWindow(settings.calling_window_start, settings.calling_window_end)}.
            Someone two timezones away is called during their own morning, not yours.
          </DefaultHint>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="max-attempts">Tries per person</Label>
              <Input
                id="max-attempts"
                type="number"
                min={1}
                max={10}
                value={settings.max_attempts}
                onChange={(e) => updateSetting("max_attempts", e.target.value)}
              />
              <DefaultHint>Default {CAMPAIGN_DEFAULTS.max_attempts}, up to 10.</DefaultHint>
            </div>
            <div className="space-y-2">
              <Label htmlFor="retry-delay">Wait before trying again (minutes)</Label>
              <Input
                id="retry-delay"
                type="number"
                min={1}
                max={10080}
                value={settings.retry_delay_minutes}
                onChange={(e) => updateSetting("retry_delay_minutes", e.target.value)}
              />
              <DefaultHint>
                Default {formatMinutesWords(CAMPAIGN_DEFAULTS.retry_delay_minutes)}
                {Number(settings.retry_delay_minutes) > 0 &&
                Number(settings.retry_delay_minutes) !== CAMPAIGN_DEFAULTS.retry_delay_minutes
                  ? ` — currently ${formatMinutesWords(Number(settings.retry_delay_minutes))}`
                  : ""}
                .
              </DefaultHint>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={creating || contacts.length === 0}>
          {creating ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Megaphone className="mr-2 size-4" aria-hidden="true" />
          )}
          {creating ? "Creating..." : "Create campaign"}
        </Button>
        <Button variant="ghost" render={<Link href="/dashboard/campaigns" />}>
          Cancel
        </Button>
        <p className="text-sm text-muted-foreground">
          Created as a draft — you start the calling on the next screen.
        </p>
      </div>
    </form>
  );
}
