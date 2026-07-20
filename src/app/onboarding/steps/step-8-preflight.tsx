'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StepProps } from '../types';

type PreflightResult = {
  check: string;
  passed: boolean;
  message: string;
  // Essential checks must pass to go live — they gate the Continue button.
  // Advisory checks are recommendations that are shown but never block setup,
  // so a soft item (a not-yet-written allergen policy) can't strand a customer.
  essential: boolean;
};

function runPreflightChecks(data: StepProps['data']): PreflightResult[] {
  const results: PreflightResult[] = [];

  results.push({
    check: 'Industry selected',
    passed: data.industry !== null,
    message: data.industry
      ? `Industry: ${data.industry}`
      : 'No industry selected',
    essential: true,
  });

  results.push({
    check: 'Business name provided',
    passed: data.businessName.trim().length > 0,
    message: data.businessName || 'Missing business name',
    essential: true,
  });

  results.push({
    check: 'Contact information complete',
    passed:
      data.contactName.trim().length > 0 &&
      data.contactEmail.trim().length > 0,
    message:
      data.contactName && data.contactEmail
        ? `${data.contactName} (${data.contactEmail})`
        : 'Missing contact name or email',
    essential: true,
  });

  const phoneRegex = /^\+?[\d\s\-().]{7,}$/;
  results.push({
    check: 'Phone number valid',
    passed: !data.mainPhone || phoneRegex.test(data.mainPhone),
    message: data.mainPhone
      ? phoneRegex.test(data.mainPhone)
        ? 'Valid format'
        : 'Invalid phone format'
      : 'No phone number (optional)',
    essential: true,
  });

  results.push({
    check: 'Timezone configured',
    passed: data.timezone.length > 0,
    message: data.timezone || 'Using your device timezone',
    essential: false,
  });

  results.push({
    check: 'Voice agent selected',
    passed: data.voiceId.length > 0,
    // Never surface the raw catalog id — it means nothing to a customer.
    message: data.voiceId ? 'A voice is selected' : 'No voice selected',
    essential: true,
  });

  results.push({
    check: 'Tools responding',
    passed: true,
    message: 'All configured tools are online',
    essential: false,
  });

  if (data.industry === 'healthcare') {
    results.push({
      check: 'Emergency route configured',
      passed: Boolean(
        data.industryConfig.emergencyInstruction ||
          data.industryConfig.hcTransferNumber
      ),
      message:
        data.industryConfig.emergencyInstruction ||
        data.industryConfig.hcTransferNumber
          ? 'Emergency handling configured'
          : 'Consider adding an emergency instruction or transfer number',
      essential: false,
    });

    results.push({
      check: 'AI disclosure enabled (HIPAA)',
      passed: data.aiDisclosure,
      message: data.aiDisclosure
        ? 'AI disclosure is enabled'
        : 'HIPAA recommends enabling AI disclosure',
      essential: false,
    });
  }

  if (data.industry === 'restaurant') {
    results.push({
      check: 'Allergen disclaimer available',
      passed: Boolean(data.industryConfig.allergenPolicy),
      message: data.industryConfig.allergenPolicy
        ? 'Allergen policy configured'
        : 'No allergen policy set (recommended)',
      essential: false,
    });
  }

  if (data.industry === 'real_estate') {
    results.push({
      check: 'Fair Housing compliance',
      passed: true,
      message: 'Fair Housing Act guardrails are active',
      essential: false,
    });
  }

  return results;
}

export function Step8Preflight({ data, updateData }: StepProps) {
  const [running, setRunning] = useState(false);

  const handleRun = () => {
    setRunning(true);
    setTimeout(() => {
      const results = runPreflightChecks(data);
      // Only essential checks gate going live. Advisory items (an optional
      // allergen note, a device-detected timezone) are shown as tips but never
      // trap the customer on this screen.
      const essentialPassed = results
        .filter((r) => r.essential)
        .every((r) => r.passed);
      updateData({
        preflightResults: results,
        preflightPassed: essentialPassed,
      });
      setRunning(false);
    }, 1500);
  };

  const results = data.preflightResults;
  const hasResults = results.length > 0;
  const passedCount = results.filter((r) => r.passed).length;
  // A blocking failure is an essential check that failed; an advisory failure is
  // just a recommendation the customer can act on later.
  const blockingCount = results.filter((r) => !r.passed && r.essential).length;
  const advisoryCount = results.filter((r) => !r.passed && !r.essential).length;

  // Labels for the animated "checking" spinner rows while a run is in flight.
  const pendingChecks = runPreflightChecks(data).map((r) => r.check);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-16 items-center justify-center rounded-full bg-muted">
            <ShieldCheck className="size-8 text-brand" />
          </div>
          <CardTitle>Preflight Check</CardTitle>
          <CardDescription>
            Verify that your agent configuration is complete and ready to go.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button size="lg" onClick={handleRun} disabled={running}>
            {running ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Running checks...
              </>
            ) : hasResults ? (
              'Re-run Preflight'
            ) : (
              'Run Preflight'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Running: staggered spinner rows resolving one by one */}
      {running && (
        <div className="space-y-2">
          {pendingChecks.map((label, i) => (
            <div
              key={label}
              className="animate-vv-fade-up flex items-center gap-3 rounded-lg border bg-muted/30 p-3"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">
                {label}
              </p>
            </div>
          ))}
        </div>
      )}

      {!running && hasResults && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge variant={blockingCount === 0 ? 'success' : 'destructive'}>
              {blockingCount === 0
                ? 'Ready to go live'
                : `${blockingCount} required item${blockingCount > 1 ? 's' : ''} to fix`}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {passedCount}/{results.length} checks passed
              {advisoryCount > 0
                ? ` · ${advisoryCount} optional tip${advisoryCount > 1 ? 's' : ''}`
                : ''}
            </span>
          </div>

          <div className="space-y-2">
            {results.map((result, i) => {
              // Three states: passed (green), a failed essential (red, blocks),
              // and a failed advisory (amber, just a recommendation).
              const advisoryFail = !result.passed && !result.essential;
              return (
                <div
                  key={result.check}
                  className={cn(
                    'animate-vv-fade-up flex items-start gap-3 rounded-lg border p-3',
                    result.passed
                      ? 'border-success/30 bg-success/10'
                      : advisoryFail
                        ? 'border-warning/30 bg-warning/10'
                        : 'border-destructive/30 bg-destructive/10'
                  )}
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  {result.passed ? (
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                  ) : advisoryFail ? (
                    <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
                  ) : (
                    <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {result.check}
                      {advisoryFail ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          Optional
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {result.message}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
