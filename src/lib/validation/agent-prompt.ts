import { z } from "zod";

/**
 * Upper bound on a hand-edited system prompt.
 *
 * Compiled prompts land well under this; the cap exists to stop a paste of an
 * entire document from being published as spoken-agent instructions.
 */
export const MAX_SYSTEM_PROMPT_LENGTH = 20000;

export const agentPromptSchema = z.object({
  system_prompt: z
    .string()
    .trim()
    .min(1, "The instructions cannot be empty.")
    .max(
      MAX_SYSTEM_PROMPT_LENGTH,
      `The instructions are too long. Keep them under ${MAX_SYSTEM_PROMPT_LENGTH.toLocaleString()} characters.`
    ),
});

export type AgentPromptInput = z.infer<typeof agentPromptSchema>;

/**
 * Finds unresolved `{{placeholder}}` tokens.
 *
 * These are template slots the compiler is supposed to fill in. If one survives
 * into a published prompt the agent reads it aloud verbatim to the caller, so
 * publishing is blocked rather than sanitised — a silent strip (what
 * `stripUnresolvedPlaceholders` in the compiler does) would change the meaning
 * of the instructions the user just wrote without telling them.
 */
export function findUnresolvedPlaceholders(prompt: string): string[] {
  const matches = prompt.match(/\{\{[^}]*\}\}/g);
  if (!matches) return [];
  return Array.from(new Set(matches));
}

/**
 * Plain-English rejection message for a prompt containing template slots.
 * This codebase never shows raw JSON or validation-library output to users.
 */
export function describeUnresolvedPlaceholders(placeholders: string[]): string {
  const list = placeholders.join(", ");
  return placeholders.length === 1
    ? `The instructions still contain the placeholder ${list}. Replace it with the real wording — the agent would read it out loud to the caller exactly as written.`
    : `The instructions still contain these placeholders: ${list}. Replace them with the real wording — the agent would read them out loud to the caller exactly as written.`;
}

/**
 * Single entry point used by the API route. Returns either the cleaned prompt
 * or a user-facing message explaining what to fix.
 */
export function validateAgentPrompt(
  input: unknown
): { ok: true; systemPrompt: string } | { ok: false; message: string } {
  const parsed = agentPromptSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      message: first?.message ?? "Those instructions are not valid.",
    };
  }

  const systemPrompt = parsed.data.system_prompt;
  const placeholders = findUnresolvedPlaceholders(systemPrompt);
  if (placeholders.length > 0) {
    return { ok: false, message: describeUnresolvedPlaceholders(placeholders) };
  }

  return { ok: true, systemPrompt };
}
