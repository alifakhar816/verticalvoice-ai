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

/**
 * Bounds for a custom tool's runtime limits. These mirror the CHECK
 * constraints in migration 013 exactly — Postgres is the enforcement of
 * record, this layer exists so the refusal can be phrased for a business owner
 * instead of surfacing a constraint violation.
 *
 * The ceilings are not arbitrary. 120s is the longest a tool may hold a live
 * phone call open before the silence is worse than the failure — a caller
 * waiting two minutes for "let me check that" has already hung up. 20s is the
 * default because it is Ultravox's own, so a tenant who never touches the
 * field gets exactly today's behaviour.
 *
 * The rate ceiling bounds the damage a looping model (or a compromised call
 * token) can do to a tenant's own endpoint within one call: 600/min is one
 * invocation every 100ms sustained, well past anything a conversation
 * produces, and 30 is a generous default for a real call.
 */
export const MIN_TOOL_TIMEOUT_SECONDS = 1;
export const MAX_TOOL_TIMEOUT_SECONDS = 120;
export const DEFAULT_TOOL_TIMEOUT_SECONDS = 20;

export const MIN_TOOL_RATE_LIMIT_PER_MINUTE = 1;
export const MAX_TOOL_RATE_LIMIT_PER_MINUTE = 600;
export const DEFAULT_TOOL_RATE_LIMIT_PER_MINUTE = 30;

const timeoutSecondsSchema = z
  .number()
  .int("Enter a whole number of seconds.")
  .min(MIN_TOOL_TIMEOUT_SECONDS, "Give the tool at least 1 second to answer.")
  .max(
    MAX_TOOL_TIMEOUT_SECONDS,
    `Wait at most ${MAX_TOOL_TIMEOUT_SECONDS} seconds. Beyond that the caller is left in silence long enough to hang up.`
  );

const rateLimitPerMinuteSchema = z
  .number()
  .int("Enter a whole number of uses per minute.")
  .min(
    MIN_TOOL_RATE_LIMIT_PER_MINUTE,
    "Allow the tool to be used at least once a minute, or turn it off instead."
  )
  .max(
    MAX_TOOL_RATE_LIMIT_PER_MINUTE,
    `Allow at most ${MAX_TOOL_RATE_LIMIT_PER_MINUTE} uses a minute.`
  );

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
  timeout_seconds: timeoutSecondsSchema.default(DEFAULT_TOOL_TIMEOUT_SECONDS),
  rate_limit_per_minute: rateLimitPerMinuteSchema.default(
    DEFAULT_TOOL_RATE_LIMIT_PER_MINUTE
  ),
});

export type CustomToolInput = z.infer<typeof customToolSchema>;

/** Every field optional, for a partial edit of an existing custom tool. */
export const customToolUpdateSchema = customToolSchema.partial();

/**
 * One tenant override for ONE parameter of a pack tool.
 *
 * Both fields are optional and both are sparse: `{ enabled: false }` changes
 * whether the parameter is collected without touching its wording, and
 * `{ description: "..." }` the reverse. An absent field means "keep the pack's
 * value", so an override row never has to restate what it is not changing.
 *
 * Note what is NOT here: `name`, `type` and `required`. The handlers in
 * src/lib/tools/*.ts read their inputs by name and assume the declared type,
 * so a tenant renaming `date` to `booking_date` — or marking a required input
 * optional — would produce a handler that throws mid-call on a real caller.
 * That failure would be invisible from this screen, so the fields simply are
 * not offered. See validateParameterOverrides for the matching semantic check.
 */
export const parameterOverrideSchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(1, "Give this input a short description, or leave it unchanged.")
      .max(MAX_TOOL_DESCRIPTION_LENGTH, "That input description is too long.")
      .optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export const parameterOverridesSchema = z.record(z.string(), parameterOverrideSchema);

export type ParameterOverride = z.infer<typeof parameterOverrideSchema>;
export type ParameterOverrides = z.infer<typeof parameterOverridesSchema>;

export const toolSettingsPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    parameter_overrides: parameterOverridesSchema.optional(),
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
    (value) =>
      value.enabled !== undefined ||
      value.description_override !== undefined ||
      value.parameter_overrides !== undefined,
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

/** The subset of a pack `ToolParameter` this validator needs. */
export interface KnownParameter {
  name: string;
  required: boolean;
}

/**
 * Checks a parameter-override map against the tool's ACTUAL parameters.
 *
 * The zod schema above can only say the shape is right. Two rules need the
 * live binding to check, and both exist to stop a tenant from breaking their
 * own agent in a way they could not diagnose:
 *
 *   - An override for a parameter the tool does not have is rejected rather
 *     than stored. Storing it would be inert today and would silently spring
 *     to life if a future pack ever introduced that name.
 *
 *   - A REQUIRED parameter cannot be switched off. The handler reads it
 *     unconditionally, so dropping it from the tool definition produces a
 *     mid-call failure on a real caller — the model would simply never have
 *     been asked to collect it. Rewording a required parameter is fine and
 *     stays allowed; only ceasing to collect it is refused.
 */
export function validateParameterOverrides(
  overrides: ParameterOverrides,
  parameters: readonly KnownParameter[]
): ValidationResult<ParameterOverrides> {
  const byName = new Map(parameters.map((parameter) => [parameter.name, parameter]));

  for (const [name, override] of Object.entries(overrides)) {
    const parameter = byName.get(name);
    if (!parameter) {
      return {
        ok: false,
        message: `This tool does not collect anything called "${name}".`,
      };
    }

    if (override.enabled === false && parameter.required) {
      return {
        ok: false,
        message: `"${name}" is required for this tool to work, so it cannot be switched off. You can reword it instead, or turn the whole tool off.`,
      };
    }
  }

  return { ok: true, value: overrides };
}
