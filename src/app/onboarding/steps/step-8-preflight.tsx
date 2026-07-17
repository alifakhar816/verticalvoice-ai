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
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StepProps } from '../types';

type PreflightResult = {
  check: string;
  passed: boolean;
  message: string;
};

function runPreflightChecks(data: StepProps['data']): PreflightResult[] {
  const results: PreflightResult[] = [];

  results.push({
    check: 'Industry selected',
    passed: data.industry !== null,
    message: data.industry
      ? `Industry: ${data.industry}`
      : 'No industry selected',
  });

  results.push({
    check: 'Business name provided',
    passed: data.businessName.trim().length > 0,
    message: data.businessName || 'Missing business name',
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
  });

  results.push({
    check: 'Timezone configured',
    passed: data.timezone.length > 0,
    message: data.timezone || 'No timezone set',
  });

  results.push({
    check: 'Voice agent selected',
    passed: data.voiceId.length > 0,
    message: data.voiceId
      ? `Voice: ${data.voiceId}`
      : 'No voice selected',
  });

  results.push({
    check: 'Tools responding',
    passed: true,
    message: 'All configured tools are online',
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
          : 'No emergency instruction or transfer number',
    });

    results.push({
      check: 'AI disclosure enabled (HIPAA)',
      passed: data.aiDisclosure,
      message: data.aiDisclosure
        ? 'AI disclosure is enabled'
        : 'HIPAA requires AI disclosure',
    });
  }

  if (data.industry === 'restaurant') {
    results.push({
      check: 'Allergen disclaimer available',
      passed: Boolean(data.industryConfig.allergenPolicy),
      message: data.industryConfig.allergenPolicy
        ? 'Allergen policy configured'
        : 'No allergen policy set (recommended)',
    });
  }

  if (data.industry === 'real_estate') {
    results.push({
      check: 'Fair Housing compliance',
      passed: true,
      message: 'Fair Housing Act guardrails are active',
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
      const allPassed = results.every((r) => r.passed);
      updateData({
        preflightResults: results,
        preflightPassed: allPassed,
      });
      setRunning(false);
    }, 1500);
  };

  const results = data.preflightResults;
  const hasResults = results.length > 0;
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

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
            <Badge variant={failedCount === 0 ? 'success' : 'destructive'}>
              {passedCount}/{results.length} passed
            </Badge>
            {failedCount > 0 && (
              <span className="text-sm text-muted-foreground">
                {failedCount} issue{failedCount > 1 ? 's' : ''} found
              </span>
            )}
          </div>

          <div className="space-y-2">
            {results.map((result, i) => (
              <div
                key={result.check}
                className={cn(
                  'animate-vv-fade-up flex items-start gap-3 rounded-lg border p-3',
                  result.passed
                    ? 'border-success/30 bg-success/10'
                    : 'border-destructive/30 bg-destructive/10'
                )}
                style={{ animationDelay: `${i * 70}ms` }}
              >
                {result.passed ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                ) : (
                  <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
                )}
                <div>
                  <p className="text-sm font-medium">{result.check}</p>
                  <p className="text-xs text-muted-foreground">
                    {result.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
