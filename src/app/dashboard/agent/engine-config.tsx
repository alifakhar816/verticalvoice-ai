"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  MAX_SPEED,
  MAX_TEMPERATURE,
  MIN_SPEED,
  MIN_TEMPERATURE,
  SUPPORTED_LANGUAGES,
  SUPPORTED_MODELS,
} from "@/lib/validation/agent-engine";

/** Ultravox defaults, used when a snapshot has never had the value set. */
const DEFAULT_TEMPERATURE = 0.4;
const DEFAULT_SPEED = 1;
const DEFAULT_LANGUAGE = "en-US";
const DEFAULT_MODEL = "ultravox-v0.7";

interface EngineConfigProps {
  /** Straight from the active snapshot — what calls actually use right now. */
  initialTemperature?: number | null;
  initialSpeed?: number | null;
  initialLanguage?: string | null;
  initialModel?: string | null;
}

interface EngineSettings {
  temperature: number;
  speed: number;
  language: string;
  model: string;
}

/** Plain-English gloss for a creativity value, so the number is not the only cue. */
function describeTemperature(value: number): string {
  if (value <= 0.2) return "Very consistent — near-identical answers every call.";
  if (value <= 0.5) return "Balanced — predictable, with some natural variation.";
  if (value <= 0.8) return "Varied — more natural, less predictable wording.";
  return "Highly varied — creative, but can wander off script.";
}

function describeSpeed(value: number): string {
  if (value < 0.95) return "Slower than normal.";
  if (value > 1.05) return "Faster than normal.";
  return "Normal speaking pace.";
}

export function EngineConfig({
  initialTemperature,
  initialSpeed,
  initialLanguage,
  initialModel,
}: EngineConfigProps) {
  const router = useRouter();

  const initial: EngineSettings = {
    temperature: initialTemperature ?? DEFAULT_TEMPERATURE,
    speed: initialSpeed ?? DEFAULT_SPEED,
    language: initialLanguage ?? DEFAULT_LANGUAGE,
    model: initialModel ?? DEFAULT_MODEL,
  };

  // Tracks what is actually published, so Cancel and the dirty check compare
  // against the live settings rather than whatever was on screen at mount.
  const [saved, setSaved] = useState<EngineSettings>(initial);
  const [draft, setDraft] = useState<EngineSettings>(initial);
  const [saving, setSaving] = useState(false);

  const isDirty =
    draft.temperature !== saved.temperature ||
    draft.speed !== saved.speed ||
    draft.language !== saved.language ||
    draft.model !== saved.model;
  const canSave = isDirty && !saving;

  function update<K extends keyof EngineSettings>(
    key: K,
    value: EngineSettings[K]
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      // Only what actually changed is sent, so an untouched control can never
      // overwrite a value another tab published in the meantime.
      const payload: Record<string, number | string> = {};
      if (draft.temperature !== saved.temperature)
        payload.temperature = draft.temperature;
      if (draft.speed !== saved.speed) payload.speed = draft.speed;
      if (draft.language !== saved.language) payload.language = draft.language;
      if (draft.model !== saved.model) payload.model = draft.model;

      const res = await fetch("/api/v1/agents/engine", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "The new settings could not be saved.");
        return;
      }
      setSaved(draft);
      toast.success(
        `Published version ${body.data.version}. Your next call will use these settings.`
      );
      // Refresh so the surrounding server-rendered cards (which read the same
      // snapshot) show the version that is now live.
      router.refresh();
    } catch {
      toast.error("The new settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(saved);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Engine settings</span>
        {isDirty ? (
          <Badge variant="outline" className="text-warning">
            Unsaved changes
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Currently live</span>
        )}
      </div>

      {/* Creativity (temperature) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="engine-temperature" className="text-sm">
            Creativity
          </Label>
          <span className="font-mono text-sm font-medium tabular-nums">
            {draft.temperature.toFixed(2)}
          </span>
        </div>
        <input
          id="engine-temperature"
          type="range"
          min={MIN_TEMPERATURE}
          max={MAX_TEMPERATURE}
          step={0.05}
          value={draft.temperature}
          disabled={saving}
          onChange={(e) => update("temperature", Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{describeTemperature(draft.temperature)}</span>
          <span className="tabular-nums">
            {MIN_TEMPERATURE} – {MAX_TEMPERATURE}
          </span>
        </div>
      </div>

      {/* Speaking speed */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="engine-speed" className="text-sm">
            Speaking speed
          </Label>
          <span className="font-mono text-sm font-medium tabular-nums">
            {draft.speed.toFixed(2)}x
          </span>
        </div>
        <input
          id="engine-speed"
          type="range"
          min={MIN_SPEED}
          max={MAX_SPEED}
          step={0.05}
          value={draft.speed}
          disabled={saving}
          onChange={(e) => update("speed", Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{describeSpeed(draft.speed)}</span>
          <span className="tabular-nums">
            {MIN_SPEED}x – {MAX_SPEED}x
          </span>
        </div>
      </div>

      {/* Language */}
      <div className="space-y-2">
        <Label htmlFor="engine-language" className="text-sm">
          Language
        </Label>
        <Select
          value={draft.language}
          disabled={saving}
          onValueChange={(value) => value && update("language", value)}
        >
          <SelectTrigger id="engine-language" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_LANGUAGES.map((language) => (
              <SelectItem key={language.code} value={language.code}>
                {language.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Guides how your agent hears callers and how it pronounces its replies.
          Pick a voice that can speak this language.
        </p>
      </div>

      {/* Model */}
      <div className="space-y-2">
        <Label htmlFor="engine-model" className="text-sm">
          Model
        </Label>
        <Select
          value={draft.model}
          disabled={saving}
          onValueChange={(value) => value && update("model", value)}
        >
          <SelectTrigger id="engine-model" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_MODELS.map((model) => (
              <SelectItem key={model} value={model}>
                {model === DEFAULT_MODEL ? `${model} (recommended)` : model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          The model that decides what your agent says. Newer versions generally
          follow instructions more closely.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleSave} disabled={!canSave}>
          {saving && <Loader2 className="animate-spin" />}
          {saving ? "Publishing..." : "Save changes"}
        </Button>
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={!isDirty || saving}
        >
          Cancel
        </Button>
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          Saving publishes a new version of your agent&apos;s settings. Calls
          already in progress keep the old settings — the change takes effect on
          the next call. Previous versions are kept, so this can be rolled back.
        </span>
      </p>
    </div>
  );
}
