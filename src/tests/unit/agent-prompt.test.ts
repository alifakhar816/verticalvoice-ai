import { describe, expect, it } from "vitest";
import {
  MAX_SYSTEM_PROMPT_LENGTH,
  agentPromptSchema,
  describeUnresolvedPlaceholders,
  findUnresolvedPlaceholders,
  validateAgentPrompt,
} from "@/lib/validation/agent-prompt";

describe("agentPromptSchema", () => {
  it("accepts a normal prompt", () => {
    const result = agentPromptSchema.safeParse({
      system_prompt: "You are the receptionist for Coastal Dental.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty prompt", () => {
    const result = agentPromptSchema.safeParse({ system_prompt: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only prompt", () => {
    const result = agentPromptSchema.safeParse({ system_prompt: "   \n\t  " });
    expect(result.success).toBe(false);
  });

  it("trims surrounding whitespace", () => {
    const result = agentPromptSchema.safeParse({
      system_prompt: "  Greet the caller.  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.system_prompt).toBe("Greet the caller.");
    }
  });

  it("accepts a prompt exactly at the length limit", () => {
    const result = agentPromptSchema.safeParse({
      system_prompt: "a".repeat(MAX_SYSTEM_PROMPT_LENGTH),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a prompt over the length limit", () => {
    const result = agentPromptSchema.safeParse({
      system_prompt: "a".repeat(MAX_SYSTEM_PROMPT_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing or non-string prompt", () => {
    expect(agentPromptSchema.safeParse({}).success).toBe(false);
    expect(agentPromptSchema.safeParse({ system_prompt: 42 }).success).toBe(false);
    expect(agentPromptSchema.safeParse(null).success).toBe(false);
  });
});

describe("findUnresolvedPlaceholders", () => {
  it("returns nothing for a fully resolved prompt", () => {
    expect(
      findUnresolvedPlaceholders("You are the receptionist for Coastal Dental.")
    ).toEqual([]);
  });

  it("finds a single placeholder", () => {
    expect(
      findUnresolvedPlaceholders("You work at {{business_name}}.")
    ).toEqual(["{{business_name}}"]);
  });

  it("finds multiple distinct placeholders", () => {
    expect(
      findUnresolvedPlaceholders("{{business_name}} in {{timezone}}.")
    ).toEqual(["{{business_name}}", "{{timezone}}"]);
  });

  it("deduplicates a placeholder repeated in the prompt", () => {
    expect(
      findUnresolvedPlaceholders("{{business_name}} — call {{business_name}}.")
    ).toEqual(["{{business_name}}"]);
  });

  it("catches placeholders with dots and inner whitespace", () => {
    expect(findUnresolvedPlaceholders("Hours: {{ profile.hours }}")).toEqual([
      "{{ profile.hours }}",
    ]);
  });

  it("ignores single braces, which are ordinary punctuation", () => {
    expect(findUnresolvedPlaceholders("Use {braces} normally.")).toEqual([]);
  });
});

describe("describeUnresolvedPlaceholders", () => {
  it("uses singular wording for one placeholder", () => {
    const message = describeUnresolvedPlaceholders(["{{business_name}}"]);
    expect(message).toContain("the placeholder {{business_name}}");
    expect(message).not.toContain("these placeholders");
  });

  it("uses plural wording and lists every placeholder", () => {
    const message = describeUnresolvedPlaceholders([
      "{{business_name}}",
      "{{timezone}}",
    ]);
    expect(message).toContain("these placeholders");
    expect(message).toContain("{{business_name}}");
    expect(message).toContain("{{timezone}}");
  });
});

describe("validateAgentPrompt", () => {
  it("returns the trimmed prompt when valid", () => {
    const result = validateAgentPrompt({
      system_prompt: "  Greet the caller warmly.  ",
    });
    expect(result).toEqual({ ok: true, systemPrompt: "Greet the caller warmly." });
  });

  it("rejects an empty prompt with a plain-English message", () => {
    const result = validateAgentPrompt({ system_prompt: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe("The instructions cannot be empty.");
    }
  });

  it("rejects an over-long prompt with a plain-English message", () => {
    const result = validateAgentPrompt({
      system_prompt: "a".repeat(MAX_SYSTEM_PROMPT_LENGTH + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("too long");
    }
  });

  it("rejects a prompt that still contains a placeholder", () => {
    const result = validateAgentPrompt({
      system_prompt: "You are the receptionist for {{business_name}}.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("{{business_name}}");
      expect(result.message).toContain("read it out loud");
    }
  });

  it("rejects a malformed body without throwing", () => {
    expect(validateAgentPrompt(null).ok).toBe(false);
    expect(validateAgentPrompt(undefined).ok).toBe(false);
    expect(validateAgentPrompt("just a string").ok).toBe(false);
    expect(validateAgentPrompt({ prompt: "wrong key" }).ok).toBe(false);
  });

  it("never leaks raw validation-library output into the message", () => {
    const result = validateAgentPrompt({ system_prompt: 42 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toContain("invalid_type");
      expect(result.message).not.toContain("[");
    }
  });
});
