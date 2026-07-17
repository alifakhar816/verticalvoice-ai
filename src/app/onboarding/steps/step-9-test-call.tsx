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
import { Separator } from '@/components/ui/separator';
import {
  Phone,
  MessageSquare,
  Target,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LiveCallOrb, type TranscriptLine } from '@/components/shared/live-call-orb';
import { accentVar } from '../accent';
import type { StepProps } from '../types';

export function Step9TestCall({ data, updateData }: StepProps) {
  const [calling, setCalling] = useState(false);
  const [callDone, setCallDone] = useState(data.testCallCompleted);

  const canCall = data.preflightPassed;
  const accent = accentVar(data.industry);

  const transcript: TranscriptLine[] = [
    {
      speaker: 'agent',
      text: `Hello! Thank you for calling ${data.businessName || 'us'}. How can I help you today?`,
    },
    {
      speaker: 'caller',
      text: 'Hi, I would like to schedule an appointment for next week.',
    },
    {
      speaker: 'agent',
      text: 'Of course! Could you tell me your preferred date and time?',
    },
    { speaker: 'caller', text: 'How about Tuesday at 2pm?' },
    {
      speaker: 'agent',
      text: 'Tuesday at 2pm is confirmed. You will receive a confirmation shortly. Anything else I can help with?',
    },
  ];

  const handleCall = () => {
    setCalling(true);
    setTimeout(() => {
      setCalling(false);
      setCallDone(true);
      updateData({ testCallCompleted: true });
    }, 3000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            {calling
              ? 'Calling your agent...'
              : callDone
                ? 'Test call complete'
                : 'Test your AI agent'}
          </CardTitle>
          <CardDescription>
            {calling
              ? 'Connecting you to your configured agent. Listen in below.'
              : callDone
                ? 'Your agent handled the test call successfully.'
                : 'Make a simulated test call to hear your agent in action.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          {calling ? (
            <LiveCallOrb
              size="lg"
              state="live"
              accent={accent}
              showTranscript
              transcript={transcript}
              className="w-full justify-center"
            />
          ) : (
            <>
              <LiveCallOrb
                size="lg"
                state={callDone ? 'idle' : 'ringing'}
                accent={accent}
                showTimer={false}
              />
              {!callDone ? (
                <>
                  <Button
                    size="lg"
                    onClick={handleCall}
                    disabled={!canCall || calling}
                  >
                    <Phone className="mr-2 size-4" />
                    Call My Agent
                  </Button>
                  {!canCall && (
                    <p className="text-center text-xs text-muted-foreground">
                      Complete the preflight check first
                    </p>
                  )}
                </>
              ) : (
                <Button variant="outline" size="lg" onClick={handleCall}>
                  <Phone className="mr-2 size-4" />
                  Call Again
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {callDone && (
        <>
          <Separator />

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Target className="size-4 text-muted-foreground" />
                  <CardTitle className="text-sm">Detected Intent</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <Badge variant="secondary">Appointment Booking</Badge>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  Confidence: 94%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Star className="size-4 text-muted-foreground" />
                  <CardTitle className="text-sm">Evaluation Score</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-1">
                  <span className="font-mono text-3xl font-semibold text-brand">
                    92
                  </span>
                  <span className="font-mono text-sm text-muted-foreground">
                    / 100
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Excellent performance
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <MessageSquare className="size-4 text-muted-foreground" />
                  <CardTitle className="text-sm">Summary</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Agent greeted caller, identified intent, collected required
                  information, and confirmed the appointment booking.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Call Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                {transcript.map((line, i) => {
                  const isAgent = line.speaker === 'agent';
                  return (
                    <div
                      key={i}
                      className={cn(
                        'flex',
                        isAgent ? 'justify-end' : 'justify-start'
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed',
                          isAgent
                            ? 'border border-brand/20 bg-accent text-accent-foreground'
                            : 'bg-secondary text-secondary-foreground'
                        )}
                      >
                        {line.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
