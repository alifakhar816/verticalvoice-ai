import { z } from "zod";

/**
 * Validation for the tool platform.
 *
 * Everything here is shared by the API routes and the dashboard UI so a rule is
 * stated once. Messages are written for a business owner to read out of a toast,
 * not for a developer to read out of a stack trace — this codebase never shows
 * raw JSON or validation-library output to users.
 */

export const MAX_TOOL_NAME_LENGTH = 64;
export const MIN_TOOL_DESCRIPTION_LENGTH = 20;
export const MAX_TOOL_DESCRIPTION_LENGTH = 1000;
export const MAX_CUSTOM_TOOL_PARAMETERS = 20;

/**
 * Ultravox's `modelToolName` rules: letters, digits and underscores only, and
 * it cannot lead with a digit. A name with a space or a dash is rejected by
 * Ultravox at call-creation time, which would take down the whole call rather
 * than just that one tool — so it is caught here instead.
 */
export const TOOL_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const TOOL_PARAMETER_TYPES = [
  "string",
  "number",
  "boolean",
  "object",
  "array",
] as const;

export const HTTP_METHODS = ["POST", "GET", "PUT", "PATCH", "DELETE"] as const;

export const toolParameterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Every input needs a name.")
    .max(MAX_TOOL_NAME_LENGTH, `Input names must be ${MAX_TOOL_NAME_LENGTH} characters or fewer.`)
    .regex(
      TOOL_NAME_PATTERN,
      "Input names can only use letters, numbers and underscores, and cannot start with a number."
    ),
  type: z.enum(TOOL_PARAMETER_TYPES),
  required: z.boolean(),
  description: z
    .string()
    .trim()
    .min(1, "Every input needs a short description of what it collects.")
    .max(MAX_TOOL_DESCRIPTION_LENGTH, "That input description is too long."),
});

export type ToolParameterInput = z.infer<typeof toolParameterSchema>;

/**
 * `http_url` must be an absolute HTTPS URL.
 *
 * HTTP is refused rather than upgraded: the agent sends caller-supplied details
 * (names, phone numbers, order references) in the request body, and sending
 * those in the clear because someone typed the wrong scheme is not a default
 * worth having. Ultravox calls this URL from its own infrastructure, so
 * localhost and private hosts cannot work either and are rejected with an
 * explanation rather than failing silently mid-call.
 */
const PRIVATE_HOST_PATTERN =
  /^(localhost$|127\.|0\.0\.0\.0$|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i;

export const httpUrlSchema = z
  .string()
  .trim()
  .min(1, "Enter the web address the tool should call.")
  .superRefine((value, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      ctx.addIssue({
        code: "custom",
        message:
          "That is not a complete web address. Include the https:// prefix, for example https://api.yourcompany.com/lookup.",
      });
      return;
    }

    if (parsed.protocol !== "https:") {
      ctx.addIssue({
        code: "custom",
        message:
          "The web address must start with https://. Caller details are sent to this address, so an unencrypted address is not allowed.",
      });
      return;
    }

    if (PRIVATE_HOST_PATTERN.test(parsed.hostname)) {
      ctx.addIssue({
        code: "custom",
        message:
          "That address is only reachable from your own network. The tool is called by our phone system over the internet, so it needs a publicly reachable address.",
      });
    }
  });

const descriptionSchema = z
  .string()
  .trim()
  .min(
    MIN_TOOL_DESCRIPTION_LENGTH,
    `Describe what the tool does in at least ${MIN_TOOL_DESCRIPTION_LENGTH} characters. The agent reads this to decide when to use it, so "lookup" is not enough.`
  )
  .max(
    MAX_TOOL_DESCRIPTION_LENGTH,
    `Keep the description under ${MAX_TOOL_DESCRIPTION_LENGTH.toLocaleString()} characters.`
  );

export const customToolSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the tool a name.")
    .max(MAX_TOOL_NAME_LENGTH, `Tool names must be ${MAX_TOOL_NAME_LENGTH} characters or fewer.`)
    .regex(
      TOOL_NAME_PATTERN,
      "Tool names can only use letters, numbers and underscores — no spaces or dashes — and cannot start with a number."
    ),
  description: descriptionSchema,
  parameters: z
    .array(toolParameterSchema)
    .max(
      MAX_CUSTOM_TOOL_PARAMETERS,
      `A tool can collect at most ${MAX_CUSTOM_TOOL_PARAMETERS} pieces of information.`
    )
    .default([]),
  http_url: httpUrlSchema,
  http_method: z.enum(HTTP_METHODS).default("POST"),
  enabled: z.boolean().default(true),
});

export type CustomToolInput = z.infer<typeof customToolSchema>;

/** Every field optional, for a partial edit of an existing custom tool. */
export const customToolUpdateSchema = customToolSchema.partial();

export const toolSettingsPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    description_override: z
      .string()
      .trim()
      .max(
        MAX_TOOL_DESCRIPTION_LENGTH,
        `Keep the description under ${MAX_TOOL_DESCRIPTION_LENGTH.toLocaleString()} characters.`
      )
      // An empty string means "clear the override and go back to the built-in
      // wording", which is a real intent and distinct from omitting the field.
      .nullable()
      .optional(),
  })
  .refine(
    (value) => value.enabled !== undefined || value.description_override !== undefined,
    { message: "Nothing was changed." }
  );

export type ToolSettingsPatchInput = z.infer<typeof toolSettingsPatchSchema>;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

/** Pulls the first message out of a zod failure, already user-readable. */
function firstMessage(error: z.ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

/**
 * Duplicate parameter names would silently collapse in the JSON schema handed
 * to the model, so one of the inputs would just never arrive. Caught by name
 * rather than by position so the message can say which one.
 */
function findDuplicateParameter(parameters: ToolParameterInput[]): string | null {
  const seen = new Set<string>();
  for (const parameter of parameters) {
    const key = parameter.name.toLowerCase();
    if (seen.has(key)) return parameter.name;
    seen.add(key);
  }
  return null;
}

export function validateCustomTool(
  input: unknown,
  reservedToolIds: readonly string[] = []
): ValidationResult<CustomToolInput> {
  const parsed = customToolSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstMessage(parsed.error, "That tool is not valid.") };
  }

  const duplicate = findDuplicateParameter(parsed.data.parameters);
  if (duplicate) {
    return {
      ok: false,
      message: `This tool collects "${duplicate}" twice. Give each piece of information a different name.`,
    };
  }

  // A custom tool sharing an id with a pack tool would produce two entries with
  // the same `modelToolName`, and which one the model reaches is undefined.
  const collision = reservedToolIds.find(
    (id) => id.toLowerCase() === parsed.data.name.toLowerCase()
  );
  if (collision) {
    return {
      ok: false,
      message: `Your agent already has a built-in tool called "${collision}". Choose a different name.`,
    };
  }

  return { ok: true, value: parsed.data };
}

export function validateCustomToolUpdate(
  input: unknown,
  reservedToolIds: readonly string[] = []
): ValidationResult<Partial<CustomToolInput>> {
  const parsed = customToolUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstMessage(parsed.error, "That change is not valid.") };
  }

  if (parsed.data.parameters) {
    const duplicate = findDuplicateParameter(parsed.data.parameters);
    if (duplicate) {
      return {
        ok: false,
        message: `This tool collects "${duplicate}" twice. Give each piece of information a different name.`,
      };
    }
  }

  if (parsed.data.name) {
    const name = parsed.data.name;
    const collision = reservedToolIds.find((id) => id.toLowerCase() === name.toLowerCase());
    if (collision) {
      return {
        ok: false,
        message: `Your agent already has a built-in tool called "${collision}". Choose a different name.`,
      };
    }
  }

  return { ok: true, value: parsed.data };
}

export function validateToolSettingsPatch(
  input: unknown
): ValidationResult<ToolSettingsPatchInput> {
  const parsed = toolSettingsPatchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstMessage(parsed.error, "That change is not valid.") };
  }
  return { ok: true, value: parsed.data };
}
