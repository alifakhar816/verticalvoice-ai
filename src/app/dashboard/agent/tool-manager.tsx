"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, Info, Loader2, Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_TOOL_RATE_LIMIT_PER_MINUTE,
  DEFAULT_TOOL_TIMEOUT_SECONDS,
  HTTP_METHODS,
  MAX_TOOL_RATE_LIMIT_PER_MINUTE,
  MAX_TOOL_TIMEOUT_SECONDS,
  MIN_TOOL_DESCRIPTION_LENGTH,
  MIN_TOOL_RATE_LIMIT_PER_MINUTE,
  MIN_TOOL_TIMEOUT_SECONDS,
  MAX_CUSTOM_TOOL_PARAMETERS,
  TOOL_NAME_PATTERN,
  TOOL_PARAMETER_TYPES,
} from "@/lib/validation/agent-tools";

/** Mirror of the API's `EffectiveTool`, redeclared so this client bundle never
 *  reaches into a server route module. */
interface ToolParameterView {
  name: string;
  type: (typeof TOOL_PARAMETER_TYPES)[number];
  required: boolean;
  description: string;
  defaultDescription: string | null;
  descriptionOverride: string | null;
  enabled: boolean;
  canDisable: boolean;
}

interface EffectiveTool {
  id: string;
  name: string;
  source: "pack" | "custom";
  enabled: boolean;
  description: string;
  defaultDescription: string | null;
  descriptionOverride: string | null;
  parameters: ToolParameterView[];
  intentIds: string[];
  returnType: string | null;
  httpUrl: string | null;
  httpMethod: string | null;
  customToolId: string | null;
  timeoutSeconds: number;
  rateLimitPerMinute: number | null;
}

interface DraftParameter {
  name: string;
  type: (typeof TOOL_PARAMETER_TYPES)[number];
  required: boolean;
  description: string;
}

interface DraftTool {
  name: string;
  description: string;
  http_url: string;
  http_method: (typeof HTTP_METHODS)[number];
  parameters: DraftParameter[];
  /** Held as strings so the field can be empty mid-typing without snapping. */
  timeout_seconds: string;
  rate_limit_per_minute: string;
}

const EMPTY_DRAFT: DraftTool = {
  name: "",
  description: "",
  http_url: "",
  http_method: "POST",
  parameters: [],
  timeout_seconds: String(DEFAULT_TOOL_TIMEOUT_SECONDS),
  rate_limit_per_minute: String(DEFAULT_TOOL_RATE_LIMIT_PER_MINUTE),
};

/** "create_reservation" -> "create reservation" — the UI never shows raw ids. */
function humanize(value: string): string {
  return value.replace(/_/g, " ").trim();
}

/** Plain-English name for a parameter type. "string" means nothing to an owner. */
function describeType(type: ToolParameterView["type"]): string {
  switch (type) {
    case "number":
      return "a number";
    case "boolean":
      return "a yes or no";
    case "object":
      return "a set of details";
    case "array":
      return "a list";
    default:
      return "text";
  }
}

function describeWhenUsed(tool: EffectiveTool): string {
  if (tool.source === "custom") {
    return "The agent decides to use this from the description above, so the clearer that description is, the more reliably it gets used at the right moment.";
  }
  if (tool.intentIds.length === 0) {
    return "The agent decides to use this from the description above.";
  }
  const intents = tool.intentIds.map(humanize);
  const list =
    intents.length === 1
      ? intents[0]
      : `${intents.slice(0, -1).join(", ")} or ${intents[intents.length - 1]}`;
  return `The agent reaches for this when the caller wants to ${list}.`;
}

export function ToolManager() {
  const [tools, setTools] = useState<EffectiveTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<DraftTool>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Per-tool description override drafts, keyed by tool id.
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, string>>({});
  // Per-parameter wording drafts, keyed by "<toolId>:<parameterName>". Kept
  // separate from `tools` so an unsaved edit never masquerades as saved state.
  const [paramDrafts, setParamDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/agents/tools");
      const body = await res.json();
      if (!res.ok) {
        setLoadFailed(true);
        toast.error(body.error ?? "Your agent's tools could not be loaded.");
        return;
      }
      setTools(body.data.tools);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
      toast.error("Your agent's tools could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function initialLoad() {
      await load();
    }
    initialLoad();
  }, [load]);

  const packTools = useMemo(() => tools.filter((t) => t.source === "pack"), [tools]);
  const customTools = useMemo(() => tools.filter((t) => t.source === "custom"), [tools]);
  const enabledCount = useMemo(() => tools.filter((t) => t.enabled).length, [tools]);

  async function toggleTool(tool: EffectiveTool, enabled: boolean) {
    setPendingId(tool.id);
    // Optimistic: the switch must move under the finger. Reverted below if the
    // write fails, so the UI can never claim a state the agent does not have.
    setTools((prev) => prev.map((t) => (t.id === tool.id ? { ...t, enabled } : t)));

    const url =
      tool.source === "custom"
        ? `/api/v1/agents/tools/custom/${tool.customToolId}`
        : `/api/v1/agents/tools/${encodeURIComponent(tool.id)}`;

    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const body = await res.json();
      if (!res.ok) {
        setTools((prev) =>
          prev.map((t) => (t.id === tool.id ? { ...t, enabled: !enabled } : t))
        );
        toast.error(body.error ?? "That change could not be saved.");
        return;
      }
      toast.success(
        enabled
          ? `${tool.name} is on. Your next call can use it.`
          : `${tool.name} is off. Your agent will not use it on the next call.`
      );
    } catch {
      setTools((prev) => prev.map((t) => (t.id === tool.id ? { ...t, enabled: !enabled } : t)));
      toast.error("That change could not be saved.");
    } finally {
      setPendingId(null);
    }
  }

  async function saveOverride(tool: EffectiveTool) {
    const value = overrideDrafts[tool.id] ?? "";
    setPendingId(tool.id);
    try {
      const res = await fetch(`/api/v1/agents/tools/${encodeURIComponent(tool.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description_override: value }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "That change could not be saved.");
        return;
      }
      toast.success(
        value.trim()
          ? "Saved. Your agent will use this wording on the next call."
          : "Reset to the built-in wording."
      );
      setOverrideDrafts((prev) => {
        const next = { ...prev };
        delete next[tool.id];
        return next;
      });
      await load();
    } catch {
      toast.error("That change could not be saved.");
    } finally {
      setPendingId(null);
    }
  }

  /**
   * Saves the parameter overrides for one pack tool.
   *
   * The complete map for the tool is sent every time, not just the parameter
   * that changed: the server replaces the column wholesale, which is what
   * makes "clear this override" expressible. `patch` is the one parameter the
   * owner just touched, layered over whatever is already stored.
   */
  async function saveParameterOverrides(
    tool: EffectiveTool,
    parameterName: string,
    patch: { description?: string; enabled?: boolean }
  ) {
    const overrides: Record<string, { description?: string; enabled?: boolean }> = {};

    for (const param of tool.parameters) {
      const isTarget = param.name === parameterName;
      const draft = paramDrafts[`${tool.id}:${param.name}`];
      const description = isTarget && patch.description !== undefined
        ? patch.description
        : (draft ?? param.descriptionOverride ?? "");
      const enabled = isTarget && patch.enabled !== undefined ? patch.enabled : param.enabled;

      const entry: { description?: string; enabled?: boolean } = {};
      // Only non-default values are sent — an override equal to the pack's own
      // wording is not an override, and storing it would make "reset" a lie.
      if (description.trim()) entry.description = description.trim();
      if (param.canDisable && !enabled) entry.enabled = false;
      if (Object.keys(entry).length > 0) overrides[param.name] = entry;
    }

    setPendingId(tool.id);
    try {
      const res = await fetch(`/api/v1/agents/tools/${encodeURIComponent(tool.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parameter_overrides: overrides }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "That change could not be saved.");
        return;
      }
      toast.success("Saved. Your agent will use this on the next call.");
      setParamDrafts((prev) => {
        const next = { ...prev };
        delete next[`${tool.id}:${parameterName}`];
        return next;
      });
      await load();
    } catch {
      toast.error("That change could not be saved.");
    } finally {
      setPendingId(null);
    }
  }

  async function deleteCustomTool(tool: EffectiveTool) {
    setPendingId(tool.id);
    try {
      const res = await fetch(`/api/v1/agents/tools/custom/${tool.customToolId}`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "That tool could not be removed.");
        return;
      }
      toast.success(`${tool.name} was removed.`);
      await load();
    } catch {
      toast.error("That tool could not be removed.");
    } finally {
      setPendingId(null);
    }
  }

  // ── Custom tool form ──────────────────────────────────────────────────────

  function startCreate() {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(tool: EffectiveTool) {
    setDraft({
      name: tool.name,
      description: tool.description,
      http_url: tool.httpUrl ?? "",
      http_method: (HTTP_METHODS.find((m) => m === tool.httpMethod) ??
        "POST") as (typeof HTTP_METHODS)[number],
      parameters: tool.parameters.map((p) => ({ ...p })),
      timeout_seconds: String(tool.timeoutSeconds),
      rate_limit_per_minute: String(
        tool.rateLimitPerMinute ?? DEFAULT_TOOL_RATE_LIMIT_PER_MINUTE
      ),
    });
    setEditingId(tool.customToolId);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }

  const nameError =
    draft.name.length > 0 && !TOOL_NAME_PATTERN.test(draft.name)
      ? "Use only letters, numbers and underscores — no spaces or dashes — and do not start with a number."
      : tools.some(
            (t) =>
              t.id.toLowerCase() === draft.name.toLowerCase() && t.customToolId !== editingId
          )
        ? `You already have a tool called "${draft.name}".`
        : null;

  const descriptionError =
    draft.description.length > 0 && draft.description.trim().length < MIN_TOOL_DESCRIPTION_LENGTH
      ? `Describe what the tool does in at least ${MIN_TOOL_DESCRIPTION_LENGTH} characters — the agent reads this to decide when to use it.`
      : null;

  const urlError =
    draft.http_url.length > 0 && !/^https:\/\/.+/i.test(draft.http_url.trim())
      ? "The web address must start with https:// — caller details are sent to it."
      : null;

  /**
   * Bounds are re-stated here rather than only server-side so the owner is
   * told at the moment they type, not after a round trip. The server is still
   * the authority — this is the courtesy, not the check.
   */
  function boundsError(
    raw: string,
    min: number,
    max: number,
    tooSmall: string,
    tooLarge: string
  ): string | null {
    if (raw.trim() === "") return null;
    const value = Number(raw);
    if (!Number.isInteger(value)) return "Enter a whole number.";
    if (value < min) return tooSmall;
    if (value > max) return tooLarge;
    return null;
  }

  const timeoutError = boundsError(
    draft.timeout_seconds,
    MIN_TOOL_TIMEOUT_SECONDS,
    MAX_TOOL_TIMEOUT_SECONDS,
    "Give the tool at least 1 second to answer.",
    `Wait at most ${MAX_TOOL_TIMEOUT_SECONDS} seconds — beyond that the caller is left in silence long enough to hang up.`
  );

  const rateLimitError = boundsError(
    draft.rate_limit_per_minute,
    MIN_TOOL_RATE_LIMIT_PER_MINUTE,
    MAX_TOOL_RATE_LIMIT_PER_MINUTE,
    "Allow the tool to be used at least once a minute, or turn it off instead.",
    `Allow at most ${MAX_TOOL_RATE_LIMIT_PER_MINUTE} uses a minute.`
  );

  const parameterError = (() => {
    const seen = new Set<string>();
    for (const p of draft.parameters) {
      if (p.name && !TOOL_NAME_PATTERN.test(p.name)) {
        return `"${p.name}" can only use letters, numbers and underscores.`;
      }
      const key = p.name.toLowerCase();
      if (key && seen.has(key)) return `"${p.name}" is listed twice.`;
      seen.add(key);
    }
    return null;
  })();

  const canSubmit =
    draft.name.trim().length > 0 &&
    draft.description.trim().length >= MIN_TOOL_DESCRIPTION_LENGTH &&
    draft.http_url.trim().length > 0 &&
    !nameError &&
    !descriptionError &&
    !urlError &&
    !parameterError &&
    !timeoutError &&
    !rateLimitError &&
    draft.parameters.every((p) => p.name.trim() && p.description.trim()) &&
    !submitting;

  async function submitDraft() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        http_url: draft.http_url.trim(),
        http_method: draft.http_method,
        parameters: draft.parameters.map((p) => ({
          name: p.name.trim(),
          type: p.type,
          required: p.required,
          description: p.description.trim(),
        })),
        // An emptied field means "use the default", not "use zero".
        timeout_seconds:
          draft.timeout_seconds.trim() === ""
            ? DEFAULT_TOOL_TIMEOUT_SECONDS
            : Number(draft.timeout_seconds),
        rate_limit_per_minute:
          draft.rate_limit_per_minute.trim() === ""
            ? DEFAULT_TOOL_RATE_LIMIT_PER_MINUTE
            : Number(draft.rate_limit_per_minute),
      };

      const res = await fetch(
        editingId ? `/api/v1/agents/tools/custom/${editingId}` : "/api/v1/agents/tools",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "That tool could not be saved.");
        return;
      }
      toast.success(
        editingId
          ? `${payload.name} was updated. Your next call will use it.`
          : `${payload.name} was added. Your next call can use it.`
      );
      closeForm();
      await load();
    } catch {
      toast.error("That tool could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  function addParameter() {
    if (draft.parameters.length >= MAX_CUSTOM_TOOL_PARAMETERS) return;
    setDraft((prev) => ({
      ...prev,
      parameters: [
        ...prev.parameters,
        { name: "", type: "string", required: true, description: "" },
      ],
    }));
  }

  function updateParameter(index: number, patch: Partial<DraftParameter>) {
    setDraft((prev) => ({
      ...prev,
      parameters: prev.parameters.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }));
  }

  function removeParameter(index: number) {
    setDraft((prev) => ({
      ...prev,
      parameters: prev.parameters.filter((_, i) => i !== index),
    }));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading your agent&apos;s tools...
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="space-y-3 py-4">
        <p className="text-sm text-destructive">
          Your agent&apos;s tools could not be loaded.
        </p>
        <Button variant="outline" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  function renderTool(tool: EffectiveTool) {
    const isExpanded = expandedId === tool.id;
    const isPending = pendingId === tool.id;
    const overrideDraft = overrideDrafts[tool.id];
    const overrideDirty =
      overrideDraft !== undefined && overrideDraft !== (tool.descriptionOverride ?? "");

    return (
      <div key={tool.id} className="rounded-lg border border-border">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <button
            type="button"
            onClick={() => setExpandedId(isExpanded ? null : tool.id)}
            aria-expanded={isExpanded}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <ChevronDown
              className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                isExpanded ? "rotate-180" : ""
              }`}
            />
            <span className="truncate text-sm font-medium">{humanize(tool.name)}</span>
            {tool.source === "custom" && (
              <Badge variant="outline" className="shrink-0">
                Yours
              </Badge>
            )}
            {!tool.enabled && (
              <Badge variant="outline" className="shrink-0 text-muted-foreground">
                Off
              </Badge>
            )}
          </button>

          <div className="flex shrink-0 items-center gap-2">
            {isPending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            <Switch
              checked={tool.enabled}
              disabled={isPending}
              onCheckedChange={(checked: boolean) => void toggleTool(tool, checked)}
              aria-label={`${tool.enabled ? "Disable" : "Enable"} ${humanize(tool.name)}`}
            />
          </div>
        </div>

        {isExpanded && (
          <div className="space-y-4 border-t border-border px-3 py-3">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">What it does</p>
              <p className="text-sm">{tool.description}</p>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                When your agent uses it
              </p>
              <p className="text-sm">{describeWhenUsed(tool)}</p>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                What it collects from the caller
              </p>
              {tool.parameters.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing — your agent can use this without asking the caller for anything.
                </p>
              ) : (
                <ul className="space-y-2">
                  {tool.parameters.map((param) => {
                    const draftKey = `${tool.id}:${param.name}`;
                    const draftValue = paramDrafts[draftKey];
                    const dirty =
                      draftValue !== undefined &&
                      draftValue !== (param.descriptionOverride ?? "");

                    return (
                      <li
                        key={param.name}
                        className="rounded-md border border-border p-2.5"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">
                            {humanize(param.name)}
                          </span>
                          <Badge variant="outline" className="shrink-0">
                            {param.required ? "Always asked" : "Optional"}
                          </Badge>
                          {!param.enabled && (
                            <Badge
                              variant="outline"
                              className="shrink-0 text-muted-foreground"
                            >
                              Not collected
                            </Badge>
                          )}
                        </div>

                        <p className="mt-1 text-sm text-muted-foreground">
                          {param.description} Collected as {describeType(param.type)},{" "}
                          {param.required
                            ? "and your agent will ask for it before continuing."
                            : param.enabled
                              ? "and your agent can continue without it."
                              : "but your agent has been told not to ask for it."}
                        </p>

                        {/* Only pack tools get per-parameter editing. A custom
                            tool's inputs are already the tenant's own words and
                            are edited in the tool form, where the name and type
                            can change too. */}
                        {tool.source === "pack" && (
                          <div className="mt-2.5 space-y-2">
                            {param.canDisable && (
                              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Switch
                                  size="sm"
                                  checked={param.enabled}
                                  disabled={isPending}
                                  onCheckedChange={(checked: boolean) =>
                                    void saveParameterOverrides(tool, param.name, {
                                      enabled: checked,
                                    })
                                  }
                                  aria-label={`Collect ${humanize(param.name)}`}
                                />
                                Ask the caller for this
                              </label>
                            )}

                            <Input
                              value={draftValue ?? param.descriptionOverride ?? ""}
                              placeholder={param.defaultDescription ?? ""}
                              disabled={isPending || !param.enabled}
                              aria-label={`How your agent understands ${humanize(param.name)}`}
                              className="text-sm"
                              onChange={(e) =>
                                setParamDrafts((prev) => ({
                                  ...prev,
                                  [draftKey]: e.target.value,
                                }))
                              }
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!dirty || isPending}
                                onClick={() =>
                                  void saveParameterOverrides(tool, param.name, {
                                    description: draftValue ?? "",
                                  })
                                }
                              >
                                Save wording
                              </Button>
                              <p className="text-xs text-muted-foreground">
                                Leave empty to use the built-in wording. This changes how
                                your agent asks — not what it sends.
                              </p>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {tool.source === "custom" && tool.httpUrl && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Where it sends</p>
                <p className="break-all text-sm">
                  {tool.httpMethod} {tool.httpUrl}
                </p>
              </div>
            )}

            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Limits</p>
              <p className="text-sm text-muted-foreground">
                Your agent waits up to {tool.timeoutSeconds} seconds for a reply before
                giving up
                {tool.rateLimitPerMinute === null
                  ? ", and this built-in tool is limited automatically."
                  : `, and can use this at most ${tool.rateLimitPerMinute} times a minute during one call.`}
              </p>
            </div>

            {tool.source === "pack" && (
              <div className="space-y-2">
                <Separator />
                <Label htmlFor={`override-${tool.id}`} className="text-xs text-muted-foreground">
                  Reword how your agent understands this tool
                </Label>
                <Textarea
                  id={`override-${tool.id}`}
                  rows={3}
                  value={overrideDraft ?? tool.descriptionOverride ?? ""}
                  placeholder={tool.defaultDescription ?? ""}
                  disabled={isPending}
                  className="text-sm"
                  onChange={(e) =>
                    setOverrideDrafts((prev) => ({ ...prev, [tool.id]: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Leave this empty to use the built-in wording. Clearer wording makes your
                  agent pick the right tool more often.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!overrideDirty || isPending}
                  onClick={() => void saveOverride(tool)}
                >
                  Save wording
                </Button>
              </div>
            )}

            {tool.source === "custom" && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => startEdit(tool)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  className="text-destructive"
                  onClick={() => void deleteCustomTool(tool)}
                >
                  <Trash2 className="size-3.5" />
                  Remove
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Tools</p>
          <p className="text-xs text-muted-foreground">
            {enabledCount} of {tools.length} on. Changes apply to your next call.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={startCreate}>
          <Plus className="size-4" />
          Add custom tool
        </Button>
      </div>

      {packTools.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Built in</p>
          {packTools.map(renderTool)}
        </div>
      )}

      {customTools.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Your own</p>
          {customTools.map(renderTool)}
        </div>
      )}

      {tools.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Your agent has no tools yet.
        </p>
      )}

      {showForm && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <div className="flex items-center gap-2">
            <Wrench className="size-4" />
            <p className="text-sm font-medium">
              {editingId ? "Edit tool" : "Add a custom tool"}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tool-name">Name</Label>
            <Input
              id="tool-name"
              value={draft.name}
              placeholder="check_order_status"
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
            />
            {nameError ? (
              <p className="text-xs text-destructive">{nameError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Letters, numbers and underscores only — this is the name your agent uses
                internally, not something the caller hears.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tool-description">What it does</Label>
            <Textarea
              id="tool-description"
              rows={3}
              value={draft.description}
              placeholder="Look up the status of a customer order using the reference number they give."
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
            />
            {descriptionError ? (
              <p className="text-xs text-destructive">{descriptionError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Your agent reads this to decide when to use the tool, so be specific.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <div className="space-y-1.5">
              <Label htmlFor="tool-url">Web address to call</Label>
              <Input
                id="tool-url"
                value={draft.http_url}
                placeholder="https://api.yourcompany.com/orders"
                onChange={(e) => setDraft((prev) => ({ ...prev, http_url: e.target.value }))}
              />
              {urlError ? (
                <p className="text-xs text-destructive">{urlError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Must be reachable from the internet and start with https://.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tool-method">Method</Label>
              <select
                id="tool-method"
                value={draft.http_method}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    http_method: e.target.value as (typeof HTTP_METHODS)[number],
                  }))
                }
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {HTTP_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tool-timeout">How long to wait for a reply</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="tool-timeout"
                  inputMode="numeric"
                  className="w-24"
                  value={draft.timeout_seconds}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, timeout_seconds: e.target.value }))
                  }
                />
                <span className="text-sm text-muted-foreground">seconds</span>
              </div>
              {timeoutError ? (
                <p className="text-xs text-destructive">{timeoutError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  If the address has not answered by then, your agent stops waiting and
                  apologizes to the caller instead of leaving them in silence. Most tools
                  answer well inside {DEFAULT_TOOL_TIMEOUT_SECONDS} seconds.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tool-rate-limit">How often it can be used</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="tool-rate-limit"
                  inputMode="numeric"
                  className="w-24"
                  value={draft.rate_limit_per_minute}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      rate_limit_per_minute: e.target.value,
                    }))
                  }
                />
                <span className="text-sm text-muted-foreground">times a minute</span>
              </div>
              {rateLimitError ? (
                <p className="text-xs text-destructive">{rateLimitError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  A safety net, counted per call. If your agent ever gets stuck repeating
                  itself, this stops it flooding your system. Normal calls use a tool a
                  handful of times.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>What it collects from the caller</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addParameter}
                disabled={draft.parameters.length >= MAX_CUSTOM_TOOL_PARAMETERS}
              >
                <Plus className="size-3.5" />
                Add
              </Button>
            </div>

            {draft.parameters.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nothing yet. Add an item for each piece of information your agent should
                collect and send.
              </p>
            )}

            {draft.parameters.map((param, index) => (
              <div key={index} className="space-y-2 rounded-md border border-border p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
                  <Input
                    value={param.name}
                    placeholder="order_id"
                    aria-label="Information name"
                    onChange={(e) => updateParameter(index, { name: e.target.value })}
                  />
                  <select
                    value={param.type}
                    aria-label="Information type"
                    onChange={(e) =>
                      updateParameter(index, {
                        type: e.target.value as DraftParameter["type"],
                      })
                    }
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {TOOL_PARAMETER_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {describeType(type)}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  value={param.description}
                  placeholder="The order reference the caller reads out."
                  aria-label="What this collects"
                  onChange={(e) => updateParameter(index, { description: e.target.value })}
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      size="sm"
                      checked={param.required}
                      onCheckedChange={(checked: boolean) =>
                        updateParameter(index, { required: checked })
                      }
                      aria-label="Required"
                    />
                    Your agent must collect this before calling the tool
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => removeParameter(index)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}

            {parameterError && <p className="text-xs text-destructive">{parameterError}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void submitDraft()} disabled={!canSubmit}>
              {submitting && <Loader2 className="animate-spin" />}
              {submitting ? "Saving..." : editingId ? "Save changes" : "Add tool"}
            </Button>
            <Button variant="outline" onClick={closeForm} disabled={submitting}>
              Cancel
            </Button>
          </div>

          <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              Your agent sends the collected information to this address during the call and
              reads the reply back to the caller. Because the address is outside our system,
              we do not attach your account credentials to the request — if it needs its own
              sign-in, it must not require one yet.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
