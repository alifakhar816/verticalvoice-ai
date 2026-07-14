import type {
  EvaluationDimension,
  EvaluationScenario,
  EvaluationAssertion,
  IndustryId,
} from "@/industries/core/industry-pack";

// ─── Evaluation Result Types ────────────────────────────────────────────────

export interface DimensionScore {
  dimension: EvaluationDimension;
  score: number; // 0-1
  weight: number;
  details: string;
  passed: boolean;
}

export interface EvaluationResult {
  scenarioId: string;
  scenarioName: string;
  overallScore: number; // 0-1 weighted average
  passed: boolean;
  passThreshold: number;
  dimensionScores: DimensionScore[];
  executionTimeMs: number;
  timestamp: string;
  errors: EvaluationError[];
}

export interface EvaluationError {
  dimension: EvaluationDimension;
  message: string;
  turnIndex?: number;
}

export interface EvaluationSuiteResult {
  industryId: IndustryId;
  totalScenarios: number;
  passed: number;
  failed: number;
  skipped: number;
  overallScore: number;
  results: EvaluationResult[];
  executionTimeMs: number;
  timestamp: string;
}

export interface EvaluationRunConfig {
  passThreshold: number; // default 0.8
  dimensions: EvaluationDimension[];
  timeout: number; // ms per scenario
  parallel: boolean;
  tags?: string[]; // filter scenarios by tag
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const ALL_DIMENSIONS: EvaluationDimension[] = [
  "intent_accuracy",
  "slot_capture",
  "tool_correctness",
  "policy_compliance",
  "safety",
  "hallucination",
  "tone",
  "latency",
  "task_completion",
  "escalation_accuracy",
];

export const DEFAULT_EVAL_CONFIG: EvaluationRunConfig = {
  passThreshold: 0.8,
  dimensions: ALL_DIMENSIONS,
  timeout: 30_000,
  parallel: false,
};

// ─── Assertion Scoring ──────────────────────────────────────────────────────

const VALID_CHECKS = new Set([
  "equals",
  "contains",
  "not_contains",
  "gt",
  "lt",
  "matches",
]);

function isWellFormedAssertion(assertion: EvaluationAssertion): boolean {
  if (!VALID_CHECKS.has(assertion.check)) return false;
  if (typeof assertion.weight !== "number" || assertion.weight <= 0) return false;
  if (!assertion.dimension) return false;
  if (assertion.target === undefined || assertion.target === null) return false;
  if (assertion.value === undefined || assertion.value === null) return false;
  return true;
}

function evaluateCheck(
  check: EvaluationAssertion["check"],
  _target: string,
  value: string | number,
  actualValue: string | number,
): boolean {
  const actual = String(actualValue);
  const expected = String(value);

  switch (check) {
    case "equals":
      return actual === expected;
    case "contains":
      return actual.includes(expected);
    case "not_contains":
      return !actual.includes(expected);
    case "gt":
      return Number(actualValue) > Number(value);
    case "lt":
      return Number(actualValue) < Number(value);
    case "matches": {
      try {
        return new RegExp(expected).test(actual);
      } catch {
        return false;
      }
    }
  }
}

export function scoreAssertion(
  assertion: EvaluationAssertion,
  actualValue: string | number,
): DimensionScore {
  if (!isWellFormedAssertion(assertion)) {
    return {
      dimension: assertion.dimension,
      score: 0,
      weight: assertion.weight ?? 1,
      details: `Malformed assertion: invalid check "${assertion.check}" or missing fields`,
      passed: false,
    };
  }

  const matched = evaluateCheck(
    assertion.check,
    assertion.target,
    assertion.value,
    actualValue,
  );

  return {
    dimension: assertion.dimension,
    score: matched ? 1.0 : 0.0,
    weight: assertion.weight,
    details: matched
      ? `${assertion.check} check passed for "${assertion.target}"`
      : `${assertion.check} check failed: expected ${assertion.value}, got ${actualValue}`,
    passed: matched,
  };
}

// ─── Scenario Runner ────────────────────────────────────────────────────────

export async function runEvaluation(
  scenario: EvaluationScenario,
  config?: Partial<EvaluationRunConfig>,
): Promise<EvaluationResult> {
  const resolved: EvaluationRunConfig = { ...DEFAULT_EVAL_CONFIG, ...config };
  const startTime = Date.now();
  const errors: EvaluationError[] = [];
  const dimensionScores: DimensionScore[] = [];

  // Filter assertions to configured dimensions
  const activeAssertions = scenario.assertions.filter((a) =>
    resolved.dimensions.includes(a.dimension),
  );

  for (const assertion of activeAssertions) {
    try {
      // Stub: validate assertion structure and score based on well-formedness
      if (isWellFormedAssertion(assertion)) {
        dimensionScores.push({
          dimension: assertion.dimension,
          score: 1.0,
          weight: assertion.weight,
          details: `Stub: assertion structure valid for "${assertion.target}"`,
          passed: true,
        });
      } else {
        dimensionScores.push({
          dimension: assertion.dimension,
          score: 0.0,
          weight: assertion.weight ?? 1,
          details: `Stub: malformed assertion for "${assertion.target}"`,
          passed: false,
        });
        errors.push({
          dimension: assertion.dimension,
          message: `Malformed assertion: check="${assertion.check}", target="${assertion.target}"`,
        });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown evaluation error";
      errors.push({ dimension: assertion.dimension, message });
      dimensionScores.push({
        dimension: assertion.dimension,
        score: 0.0,
        weight: assertion.weight ?? 1,
        details: `Error: ${message}`,
        passed: false,
      });
    }
  }

  // Compute weighted average
  const totalWeight = dimensionScores.reduce((sum, d) => sum + d.weight, 0);
  const overallScore =
    totalWeight > 0
      ? dimensionScores.reduce((sum, d) => sum + d.score * d.weight, 0) /
        totalWeight
      : 0;

  const executionTimeMs = Date.now() - startTime;

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    overallScore,
    passed: overallScore >= resolved.passThreshold,
    passThreshold: resolved.passThreshold,
    dimensionScores,
    executionTimeMs,
    timestamp: new Date().toISOString(),
    errors,
  };
}

// ─── Suite Runner ───────────────────────────────────────────────────────────

export async function runEvaluationSuite(
  scenarios: EvaluationScenario[],
  industryId: IndustryId,
  config?: Partial<EvaluationRunConfig>,
): Promise<EvaluationSuiteResult> {
  const resolved: EvaluationRunConfig = { ...DEFAULT_EVAL_CONFIG, ...config };
  const startTime = Date.now();

  // Filter by tags if specified
  const filtered = resolved.tags?.length
    ? scenarios.filter((s) =>
        s.tags.some((t) => resolved.tags!.includes(t)),
      )
    : scenarios;

  const results: EvaluationResult[] = [];

  if (resolved.parallel) {
    const settled = await Promise.allSettled(
      filtered.map((scenario) =>
        Promise.race([
          runEvaluation(scenario, resolved),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Scenario "${scenario.id}" timed out`)),
              resolved.timeout,
            ),
          ),
        ]),
      ),
    );

    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i];
      if (outcome.status === "fulfilled") {
        results.push(outcome.value);
      } else {
        // Timed out or errored - record as failed
        const scenario = filtered[i];
        results.push({
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          overallScore: 0,
          passed: false,
          passThreshold: resolved.passThreshold,
          dimensionScores: [],
          executionTimeMs: resolved.timeout,
          timestamp: new Date().toISOString(),
          errors: [
            {
              dimension: "task_completion",
              message: outcome.reason instanceof Error
                ? outcome.reason.message
                : "Unknown error",
            },
          ],
        });
      }
    }
  } else {
    for (const scenario of filtered) {
      try {
        const result = await Promise.race([
          runEvaluation(scenario, resolved),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Scenario "${scenario.id}" timed out`)),
              resolved.timeout,
            ),
          ),
        ]);
        results.push(result);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        results.push({
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          overallScore: 0,
          passed: false,
          passThreshold: resolved.passThreshold,
          dimensionScores: [],
          executionTimeMs: resolved.timeout,
          timestamp: new Date().toISOString(),
          errors: [{ dimension: "task_completion", message }],
        });
      }
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const skipped = scenarios.length - filtered.length;
  const totalWeight = results.length;
  const overallScore =
    totalWeight > 0
      ? results.reduce((sum, r) => sum + r.overallScore, 0) / totalWeight
      : 0;

  return {
    industryId,
    totalScenarios: scenarios.length,
    passed,
    failed,
    skipped,
    overallScore,
    results,
    executionTimeMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}
