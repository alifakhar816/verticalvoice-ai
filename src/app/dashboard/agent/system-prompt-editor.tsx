"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MAX_SYSTEM_PROMPT_LENGTH } from "@/lib/validation/agent-prompt";

interface SystemPromptEditorProps {
  /** The prompt currently live on calls, straight from the active snapshot. */
  initialPrompt: string;
}

export function SystemPromptEditor({ initialPrompt }: SystemPromptEditorProps) {
  const router = useRouter();
  // Tracks what is actually published, so Cancel and the dirty check compare
  // against the live prompt rather than whatever was on screen at mount.
  const [savedPrompt, setSavedPrompt] = useState(initialPrompt);
  const [draft, setDraft] = useState(initialPrompt);
  const [saving, setSaving] = useState(false);

  const isDirty = draft !== savedPrompt;
  const isEmpty = draft.trim().length === 0;
  const isTooLong = draft.length > MAX_SYSTEM_PROMPT_LENGTH;
  const canSave = isDirty && !isEmpty && !isTooLong && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/agents/prompt", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_prompt: draft }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "The new instructions could not be saved.");
        return;
      }
      const published = draft.trim();
      setSavedPrompt(published);
      setDraft(published);
      toast.success(
        `Published version ${body.data.version}. Your next call will use these instructions.`
      );
      // Refresh so the surrounding server-rendered card (character count,
      // compiled date) reflects the version that is now live.
      router.refresh();
    } catch {
      toast.error("The new instructions could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(savedPrompt);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Instructions</span>
        {isDirty ? (
          <Badge variant="outline" className="text-warning">
            Unsaved changes
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            {savedPrompt.length.toLocaleString()} characters, currently live
          </span>
        )}
      </div>

      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={saving}
        rows={20}
        spellCheck={false}
        aria-label="Agent instructions"
        className="max-h-[32rem] font-mono text-xs leading-relaxed"
      />

      {isEmpty && (
        <p className="text-sm text-destructive">
          The instructions cannot be empty.
        </p>
      )}
      {isTooLong && (
        <p className="text-sm text-destructive">
          These instructions are {draft.length.toLocaleString()} characters. Trim
          them to {MAX_SYSTEM_PROMPT_LENGTH.toLocaleString()} or fewer before
          saving.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleSave} disabled={!canSave}>
          {saving && <Loader2 className="animate-spin" />}
          {saving ? "Publishing..." : "Save changes"}
        </Button>
        <Button variant="outline" onClick={handleCancel} disabled={!isDirty || saving}>
          Cancel
        </Button>
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          Saving publishes a new version of your agent&apos;s instructions. Calls
          already in progress keep the old instructions — the change takes effect
          on the next call. Previous versions are kept, so this can be rolled
          back.
        </span>
      </p>
    </div>
  );
}
