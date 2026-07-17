"use client";

import {
  Phone,
  Calendar,
  Mail,
  MessageSquare,
  Building2,
  HeartPulse,
  CreditCard,
  DollarSign,
  Zap,
  ExternalLink,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type HealthStatus = "healthy" | "degraded" | "error";

interface ConnectedIntegration {
  name: string;
  icon: React.ReactNode;
  status: HealthStatus;
  statusLabel: string;
  detail: string;
  lastChecked: string;
}

interface AvailableIntegration {
  name: string;
  icon: React.ReactNode;
  description: string;
}

const healthDotColor: Record<HealthStatus, string> = {
  healthy: "bg-success",
  degraded: "bg-warning",
  error: "bg-destructive",
};

const healthBorderColor: Record<HealthStatus, string> = {
  healthy: "border-l-success",
  degraded: "border-l-warning",
  error: "border-l-destructive",
};

const healthBadgeVariant: Record<HealthStatus, "success" | "warning" | "destructive"> = {
  healthy: "success",
  degraded: "warning",
  error: "destructive",
};

const connectedIntegrations: ConnectedIntegration[] = [
  {
    name: "Twilio",
    icon: <Phone className="size-5" />,
    status: "healthy",
    statusLabel: "Connected",
    detail: "+1 (555) 123-4567",
    lastChecked: "2 min ago",
  },
  {
    name: "Google Calendar",
    icon: <Calendar className="size-5" />,
    status: "healthy",
    statusLabel: "Connected",
    detail: "3 calendars synced",
    lastChecked: "5 min ago",
  },
  {
    name: "SendGrid",
    icon: <Mail className="size-5" />,
    status: "degraded",
    statusLabel: "Degraded",
    detail: "Email delivery delayed",
    lastChecked: "1 min ago",
  },
];

const availableIntegrations: AvailableIntegration[] = [
  {
    name: "Slack",
    icon: <MessageSquare className="size-6 text-muted-foreground" />,
    description: "Send notifications and alerts to your Slack channels.",
  },
  {
    name: "Salesforce",
    icon: <Building2 className="size-6 text-muted-foreground" />,
    description: "Sync call data and contacts with your Salesforce CRM.",
  },
  {
    name: "Epic EHR",
    icon: <HeartPulse className="size-6 text-muted-foreground" />,
    description:
      "Access patient records and schedule appointments via Epic.",
  },
  {
    name: "Square POS",
    icon: <CreditCard className="size-6 text-muted-foreground" />,
    description: "Process payments and manage transactions through Square.",
  },
  {
    name: "Stripe",
    icon: <DollarSign className="size-6 text-muted-foreground" />,
    description: "Handle billing, invoicing, and payment collection.",
  },
  {
    name: "Zapier",
    icon: <Zap className="size-6 text-muted-foreground" />,
    description:
      "Connect to 5,000+ apps with automated workflows.",
  },
];

export default function IntegrationsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground">
          Connect your tools and services to extend your AI agent.
        </p>
      </div>

      {/* Connected Integrations */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Connected</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {connectedIntegrations.map((integration) => (
            <Card
              key={integration.name}
              className={`border-l-2 ${healthBorderColor[integration.status]} transition-all hover:-translate-y-0.5 hover:shadow-sm`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      {integration.icon}
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        {integration.name}
                      </CardTitle>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className={`inline-block size-2 rounded-full ${healthDotColor[integration.status]}`}
                          aria-hidden
                        />
                        <span className="text-xs text-muted-foreground">
                          {integration.statusLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Badge variant={healthBadgeVariant[integration.status]}>
                    {integration.statusLabel}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="font-mono text-sm font-medium">
                  {integration.detail}
                </p>
                <p className="text-xs text-muted-foreground">
                  Last checked{" "}
                  <span className="font-mono">{integration.lastChecked}</span>
                </p>
                <Separator />
                <Button variant="outline" size="sm" className="w-full">
                  Disconnect
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Available Integrations */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Available Integrations</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {availableIntegrations.map((integration) => (
            <Card
              key={integration.name}
              className="transition-all hover:-translate-y-0.5 hover:shadow-sm"
            >
              <CardHeader>
                <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
                  {integration.icon}
                </div>
                <CardTitle className="mt-3 text-base">
                  {integration.name}
                </CardTitle>
                <CardDescription>{integration.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full gap-2">
                  <ExternalLink className="size-4" />
                  Connect
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
