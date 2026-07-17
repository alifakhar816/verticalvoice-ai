'use client';

import type { CSSProperties } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Mic, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LiveCallOrb, type TranscriptLine } from '@/components/shared/live-call-orb';
import { accentVar } from '../accent';
import type { StepProps } from '../types';

const voices: {
  id: string;
  name: string;
  desc: string;
  tags: string[];
  sample: TranscriptLine[];
}[] = [
  {
    id: 'sophia',
    name: 'Sophia',
    desc: 'Warm and conversational, great for patient care',
    tags: ['Female', 'Warm'],
    sample: [
      { speaker: 'caller', text: 'I need to come in today' },
      { speaker: 'agent', text: 'Of course, I can see a 2:30 opening this afternoon. Does that work?' },
    ],
  },
  {
    id: 'james',
    name: 'James',
    desc: 'Confident and professional, ideal for business calls',
    tags: ['Male', 'Professional'],
    sample: [
      { speaker: 'caller', text: 'Do you have anything available this week?' },
      { speaker: 'agent', text: 'We do. I have Thursday at 10 or Friday at 4. Which suits you better?' },
    ],
  },
  {
    id: 'luna',
    name: 'Luna',
    desc: 'Friendly and upbeat, perfect for hospitality',
    tags: ['Female', 'Energetic'],
    sample: [
      { speaker: 'caller', text: 'A table for four tonight?' },
      { speaker: 'agent', text: 'Wonderful, I have 7:15 open for four. Shall I lock that in for you?' },
    ],
  },
  {
    id: 'marcus',
    name: 'Marcus',
    desc: 'Calm and reassuring, suitable for sensitive calls',
    tags: ['Male', 'Calm'],
    sample: [
      { speaker: 'caller', text: 'I am not sure what I need' },
      { speaker: 'agent', text: 'That is completely fine. Let us take it one step at a time together.' },
    ],
  },
  {
    id: 'aria',
    name: 'Aria',
    desc: 'Polished and articulate, excellent for real estate',
    tags: ['Female', 'Professional'],
    sample: [
      { speaker: 'caller', text: 'Is the listing on Oak Street still available?' },
      { speaker: 'agent', text: 'It is. I can arrange a showing tomorrow at 5. Would that work for you?' },
    ],
  },
  {
    id: 'noah',
    name: 'Noah',
    desc: 'Natural and approachable, versatile for any vertical',
    tags: ['Male', 'Natural'],
    sample: [
      { speaker: 'caller', text: 'Hi, can you help me book something?' },
      { speaker: 'agent', text: 'Absolutely, happy to help. What day were you hoping for?' },
    ],
  },
];

export function Step5Personality({ data, updateData }: StepProps) {
  const isHealthcare = data.industry === 'healthcare';
  const accent = accentVar(data.industry);
  const selectedVoice = voices.find((v) => v.id === data.voiceId);

  const selectedStyle: CSSProperties = {
    borderColor: accent,
    backgroundColor: `color-mix(in srgb, ${accent} 8%, transparent)`,
  };

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h3 className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Choose a Voice
        </h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {voices.map((voice) => {
            const selected = data.voiceId === voice.id;
            return (
              <Card
                key={voice.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => updateData({ voiceId: voice.id })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    updateData({ voiceId: voice.id });
                  }
                }}
                className={cn(
                  'cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md',
                  selected ? 'shadow-md' : 'hover:border-foreground/20'
                )}
                style={
                  selected
                    ? { ...selectedStyle, boxShadow: `0 0 0 1px ${accent}` }
                    : undefined
                }
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex size-10 items-center justify-center rounded-full',
                          !selected && 'bg-muted text-muted-foreground'
                        )}
                        style={
                          selected
                            ? {
                                backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`,
                                color: accent,
                              }
                            : undefined
                        }
                      >
                        <Mic className="size-5" />
                      </div>
                      <CardTitle className="text-base">{voice.name}</CardTitle>
                    </div>
                    {selected && (
                      <Badge
                        className="gap-1 border-transparent"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)`,
                          color: accent,
                        }}
                      >
                        <Check className="size-3" />
                        Selected
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-2">
                    {voice.desc}
                  </CardDescription>
                  <div className="flex gap-1">
                    {voice.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Voice preview: a small LiveCallOrb playing the chosen voice's sample */}
        <div className="rounded-lg border bg-muted/30 p-5">
          {selectedVoice ? (
            <div className="flex flex-col gap-4">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Preview: {selectedVoice.name}
              </p>
              <LiveCallOrb
                size="sm"
                state="live"
                accent={accent}
                showTranscript
                showTimer={false}
                transcript={selectedVoice.sample}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a voice above to hear a sample of how your agent sounds.
            </p>
          )}
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h3 className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Tone
        </h3>
        <RadioGroup
          value={data.tone}
          onValueChange={(v) =>
            updateData({
              tone: (v ?? 'professional') as typeof data.tone,
            })
          }
          className="grid grid-cols-2 gap-3 md:grid-cols-4"
        >
          {(
            [
              { value: 'warm', label: 'Warm' },
              { value: 'professional', label: 'Professional' },
              { value: 'energetic', label: 'Energetic' },
              { value: 'calm', label: 'Calm' },
            ] as const
          ).map((t) => {
            const on = data.tone === t.value;
            return (
              <label
                key={t.value}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg border p-3 transition-colors',
                  !on && 'hover:bg-muted/50'
                )}
                style={on ? selectedStyle : undefined}
              >
                <RadioGroupItem value={t.value} />
                <span className="text-sm font-medium">{t.label}</span>
              </label>
            );
          })}
        </RadioGroup>
      </section>

      <section className="space-y-4">
        <h3 className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Speaking Pace
        </h3>
        <RadioGroup
          value={data.speakingPace}
          onValueChange={(v) =>
            updateData({
              speakingPace: (v ?? 'natural') as typeof data.speakingPace,
            })
          }
          className="grid grid-cols-3 gap-3"
        >
          {(
            [
              { value: 'slower', label: 'Slower' },
              { value: 'natural', label: 'Natural' },
              { value: 'faster', label: 'Faster' },
            ] as const
          ).map((p) => {
            const on = data.speakingPace === p.value;
            return (
              <label
                key={p.value}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg border p-3 transition-colors',
                  !on && 'hover:bg-muted/50'
                )}
                style={on ? selectedStyle : undefined}
              >
                <RadioGroupItem value={p.value} />
                <span className="text-sm font-medium">{p.label}</span>
              </label>
            );
          })}
        </RadioGroup>
      </section>

      <section className="space-y-4">
        <h3 className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Greeting Style
        </h3>
        <RadioGroup
          value={data.greetingStyle}
          onValueChange={(v) =>
            updateData({
              greetingStyle: (v ?? 'friendly') as typeof data.greetingStyle,
            })
          }
          className="grid grid-cols-3 gap-3"
        >
          {(
            [
              { value: 'formal', label: 'Formal' },
              { value: 'friendly', label: 'Friendly' },
              { value: 'minimal', label: 'Minimal' },
            ] as const
          ).map((g) => {
            const on = data.greetingStyle === g.value;
            return (
              <label
                key={g.value}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg border p-3 transition-colors',
                  !on && 'hover:bg-muted/50'
                )}
                style={on ? selectedStyle : undefined}
              >
                <RadioGroupItem value={g.value} />
                <span className="text-sm font-medium">{g.label}</span>
              </label>
            );
          })}
        </RadioGroup>
      </section>

      <Separator />

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">AI Disclosure</p>
          <p className="text-xs text-muted-foreground">
            Inform callers they are speaking with an AI agent
            {isHealthcare && ' (required for healthcare)'}
          </p>
        </div>
        <Switch
          checked={data.aiDisclosure}
          onCheckedChange={(v) => updateData({ aiDisclosure: v })}
          disabled={isHealthcare}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="transferNumber">Transfer Number</Label>
          <Input
            id="transferNumber"
            value={data.transferNumber}
            onChange={(e) => updateData({ transferNumber: e.target.value })}
            placeholder="+1 (555) 000-0000"
          />
        </div>
        <div className="space-y-2">
          <Label>After-Hours Behavior</Label>
          <Select
            value={data.afterHoursBehavior}
            onValueChange={(v) =>
              updateData({ afterHoursBehavior: v ?? 'voicemail' })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                { v: 'voicemail', l: 'Take a voicemail' },
                { v: 'transfer', l: 'Transfer to on-call' },
                { v: 'schedule', l: 'Offer to schedule callback' },
                { v: 'info_only', l: 'Provide info only' },
              ].map((o) => (
                <SelectItem key={o.v} value={o.v}>
                  {o.l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
