export interface ProviderAgentRef {
  providerId: string;
  providerName: string;
  externalId: string;
}

export interface CallRef {
  callId: string;
  providerCallId: string;
  providerName: string;
}

export interface NormalizedCall {
  callId: string;
  providerCallId: string;
  direction: "inbound" | "outbound";
  status: "ringing" | "in_progress" | "completed" | "failed";
  callerNumber?: string;
  calledNumber?: string;
  durationSeconds?: number;
  startedAt: string;
  endedAt?: string;
  recordingUrl?: string;
  transcript?: Array<{ role: "agent" | "caller"; content: string; timestamp: string }>;
}

export interface OutboundCallInput {
  agentRef: ProviderAgentRef;
  toNumber: string;
  fromNumber: string;
  metadata?: Record<string, string>;
}

export interface RecordingRef {
  url: string;
  durationSeconds: number;
  format: string;
}

export interface VoiceRuntimeProvider {
  readonly name: string;
  createAgent(config: {
    systemPrompt: string;
    voice: { voiceId: string; speed: number };
    tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
    greeting: string;
    maxDurationSeconds: number;
    silenceTimeoutSeconds: number;
  }): Promise<ProviderAgentRef>;
  updateAgent(ref: ProviderAgentRef, config: {
    systemPrompt: string;
    voice: { voiceId: string; speed: number };
    tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
    greeting: string;
    maxDurationSeconds: number;
    silenceTimeoutSeconds: number;
  }): Promise<void>;
  startOutboundCall(input: OutboundCallInput): Promise<CallRef>;
  getCall(callId: string): Promise<NormalizedCall>;
  getRecording(callId: string): Promise<RecordingRef | null>;
  terminateCall(callId: string): Promise<void>;
}
