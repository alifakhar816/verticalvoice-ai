export interface PhoneNumberRef {
  id: string;
  number: string;
  provider: string;
  providerSid: string;
}

export interface ProvisionNumberInput {
  country: string;
  areaCode?: string;
  capabilities: ("voice" | "sms")[];
}

export interface InboundRouteInput {
  phoneNumberSid: string;
  webhookUrl: string;
  statusCallbackUrl?: string;
}

export interface TransferInput {
  callSid: string;
  toNumber: string;
  announceMessage?: string;
}

export interface SmsInput {
  to: string;
  from: string;
  body: string;
}

export interface MessageRef {
  id: string;
  status: "queued" | "sent" | "delivered" | "failed";
}

export interface CostEstimateInput {
  direction: "inbound" | "outbound";
  durationMinutes: number;
  country: string;
}

export interface MoneyEstimate {
  amount: number;
  currency: string;
  breakdown: { item: string; amount: number }[];
}

export interface TelephonyProvider {
  readonly name: string;
  provisionNumber(input: ProvisionNumberInput): Promise<PhoneNumberRef>;
  configureInboundRoute(input: InboundRouteInput): Promise<void>;
  transferCall(input: TransferInput): Promise<void>;
  sendSms(input: SmsInput): Promise<MessageRef>;
  validateWebhook(request: Request): Promise<boolean>;
  estimateCost(input: CostEstimateInput): Promise<MoneyEstimate>;
}
