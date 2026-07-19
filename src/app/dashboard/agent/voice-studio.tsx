"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, Info, Loader2, Pause, Play, Search } from "lucide-react";
import { toast } from "sonner";
import { resolveStoredVoiceId } from "@/lib/voices/catalog";
import type { VoiceLanguageOption, VoiceSummary } from "@/lib/voices/catalog";

interface VoiceStudioProps {
  /**
   * The voice currently live on calls, straight from the active snapshot's
   * `voice.voice_id`. May be a legacy onboarding alias ("luna") rather than a
   * catalog id, which is why it is resolved before matching.
   */
  currentVoiceId?: string | null;
}

const ALL_LANGUAGES = "all";

export function VoiceStudio({ currentVoiceId = null }: VoiceStudioProps) {
  const router = useRouter();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [language, setLanguage] = useState<string>(ALL_LANGUAGES);

  const [voices, setVoices] = useState<VoiceSummary[]>([]);
  const [languages, setLanguages] = useState<VoiceLanguageOption[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Tracks what is actually live, so the "Current voice" marker follows a
  // successful save rather than staying pinned to whatever was live at mount.
  const [savedVoiceId, setSavedVoiceId] = useState<string | null>(
    resolveStoredVoiceId(currentVoiceId)
  );
  const [savingVoiceId, setSavingVoiceId] = useState<string | null>(null);

  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);

  // One <audio> for the whole list. Two hundred-odd per-row players would be
  // both slow and impossible to keep mutually exclusive.
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Debounced so typing in the search box does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    // Ignores responses from superseded requests, so a slow early query cannot
    // land after a fast later one and show the wrong list.
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("search", search.trim());
        if (language !== ALL_LANGUAGES) params.set("language", language);

        const res = await fetch(`/api/v1/voices?${params.toString()}`);
        const body = await res.json();
        if (!active) return;

        if (!res.ok) {
          setLoadError(body.error ?? "The list of voices could not be loaded.");
          setVoices([]);
          return;
        }

        setLoadError(null);
        setVoices(body.data.voices);
        setTotal(body.data.total);
        // The API always returns every language, not just those in the current
        // result, so the filter never collapses to the option just chosen.
        if (body.data.languages.length > 0) setLanguages(body.data.languages);
      } catch {
        if (active) {
          setLoadError("The list of voices could not be loaded.");
          setVoices([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [search, language]);

  // Stop audio when the component unmounts, so navigating away does not leave
  // a sample playing over the rest of the dashboard.
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, []);

  const stopPlayback = useCallback(() => {
    audioRef.current?.pause();
    setPlayingVoiceId(null);
    setLoadingVoiceId(null);
  }, []);

  const handlePreview = useCallback(
    async (voice: VoiceSummary) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (playingVoiceId === voice.voiceId) {
        stopPlayback();
        return;
      }

      audio.pause();
      setPlayingVoiceId(null);
      setLoadingVoiceId(voice.voiceId);

      // Proxied rather than linked directly: Ultravox serves its sample clips
      // as text/plain, which browsers refuse to play.
      audio.src = `/api/v1/voices/${encodeURIComponent(voice.voiceId)}/preview`;

      try {
        await audio.play();
        setLoadingVoiceId(null);
        setPlayingVoiceId(voice.voiceId);
      } catch {
        setLoadingVoiceId(null);
        setPlayingVoiceId(null);
        toast.error(`The sample for ${voice.name} could not be played.`);
      }
    },
    [playingVoiceId, stopPlayback]
  );

  async function handleSelect(voice: VoiceSummary) {
    if (savingVoiceId || voice.voiceId === savedVoiceId) return;
    setSavingVoiceId(voice.voiceId);
    try {
      const res = await fetch("/api/v1/agents/voice", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice_id: voice.voiceId }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "The new voice could not be saved.");
        return;
      }
      setSavedVoiceId(voice.voiceId);
      toast.success(
        `${voice.name} is now your agent's voice. Your next call will use it.`
      );
      // Refresh so the surrounding server-rendered voice card shows the change.
      router.refresh();
    } catch {
      toast.error("The new voice could not be saved.");
    } finally {
      setSavingVoiceId(null);
    }
  }

  const languageLabel = useMemo(() => {
    if (language === ALL_LANGUAGES) return null;
    return languages.find((l) => l.code === language)?.label ?? language;
  }, [language, languages]);

  const isFiltered = search.trim().length > 0 || language !== ALL_LANGUAGES;

  return (
    <div className="space-y-3">
      {/* Rendered once, off-screen, and reused for every row. */}
      <audio
        ref={audioRef}
        className="hidden"
        preload="none"
        onEnded={() => setPlayingVoiceId(null)}
        onError={() => {
          setLoadingVoiceId(null);
          setPlayingVoiceId(null);
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Voice</span>
        {total !== null && (
          <span className="text-xs text-muted-foreground">
            {isFiltered
              ? `${voices.length.toLocaleString()} of ${total.toLocaleString()} voices`
              : `${total.toLocaleString()} voices available`}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or description"
            aria-label="Search voices"
            className="pl-9"
          />
        </div>
        <Select value={language} onValueChange={(v) => setLanguage(v ?? ALL_LANGUAGES)}>
          <SelectTrigger className="sm:w-64">
            <SelectValue placeholder="All languages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_LANGUAGES}>All languages</SelectItem>
            {languages.map((option) => (
              <SelectItem key={option.code} value={option.code}>
                {option.label} ({option.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="max-h-[32rem] overflow-y-auto rounded-lg ring-1 ring-foreground/10">
        {loading && voices.length === 0 ? (
          <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading voices...
          </p>
        ) : loadError ? (
          <p className="p-6 text-sm text-destructive">{loadError}</p>
        ) : voices.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No voices match
            {search.trim() ? ` "${search.trim()}"` : ""}
            {languageLabel ? ` in ${languageLabel}` : ""}. Try a different search
            or language.
          </p>
        ) : (
          <ul className="divide-y divide-foreground/10">
            {voices.map((voice) => {
              const isCurrent = voice.voiceId === savedVoiceId;
              const isPlaying = playingVoiceId === voice.voiceId;
              const isLoadingSample = loadingVoiceId === voice.voiceId;
              const isSaving = savingVoiceId === voice.voiceId;

              return (
                <li
                  key={voice.voiceId}
                  className={`flex items-start gap-3 p-3 ${
                    isCurrent ? "bg-muted/50" : ""
                  }`}
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="mt-0.5 shrink-0"
                    disabled={!voice.hasPreview || isLoadingSample}
                    aria-label={
                      voice.hasPreview
                        ? isPlaying
                          ? `Stop the sample for ${voice.name}`
                          : `Play a sample of ${voice.name}`
                        : `No sample available for ${voice.name}`
                    }
                    onClick={() => handlePreview(voice)}
                  >
                    {isLoadingSample ? (
                      <Loader2 className="animate-spin" />
                    ) : isPlaying ? (
                      <Pause />
                    ) : (
                      <Play />
                    )}
                  </Button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{voice.name}</span>
                      {isCurrent && (
                        <Badge variant="outline">
                          <Check className="size-3" />
                          Current voice
                        </Badge>
                      )}
                      {isPlaying && (
                        <span className="text-xs text-muted-foreground">
                          Playing
                        </span>
                      )}
                    </div>
                    {voice.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {voice.description}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {voice.languageLabel}
                      {!voice.hasPreview && " — no sample available"}
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant={isCurrent ? "outline" : "default"}
                    size="sm"
                    className="mt-0.5 shrink-0"
                    disabled={isCurrent || savingVoiceId !== null}
                    onClick={() => handleSelect(voice)}
                  >
                    {isSaving && <Loader2 className="animate-spin" />}
                    {isCurrent ? "In use" : isSaving ? "Saving..." : "Use voice"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          Choosing a voice publishes a new version of your agent. Calls already
          in progress keep the old voice — the change takes effect on the next
          call. Previous versions are kept, so this can be rolled back.
        </span>
      </p>
    </div>
  );
}
