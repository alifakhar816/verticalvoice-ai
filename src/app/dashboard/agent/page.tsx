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
import { Bot, Pencil, Play, Volume2, Globe, MessageSquare } from "lucide-react";

export default function AgentPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agent</h1>
          <p className="text-muted-foreground">
            Configure and manage your AI calling agent.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Play className="mr-2 size-4" />
            Test Agent
          </Button>
          <Button>
            <Pencil className="mr-2 size-4" />
            Edit Configuration
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Agent Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="size-5" />
              Agent Status
            </CardTitle>
            <CardDescription>
              Current state and readiness of your AI agent.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant="outline" className="border-green-500 text-green-600">
                Active
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Last Updated
              </span>
              <span className="text-sm">Not configured</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Version</span>
              <span className="text-sm">v1.0</span>
            </div>
          </CardContent>
        </Card>

        {/* Voice Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="size-5" />
              Voice Configuration
            </CardTitle>
            <CardDescription>
              Voice and speech settings for your agent.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Voice</span>
              <span className="text-sm">Default</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Language</span>
              <span className="text-sm">English (US)</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Speed</span>
              <span className="text-sm">Normal</span>
            </div>
          </CardContent>
        </Card>

        {/* Greeting & Behavior */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="size-5" />
              Greeting & Behavior
            </CardTitle>
            <CardDescription>
              How your agent introduces itself and handles conversations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="text-sm text-muted-foreground">Greeting</span>
              <p className="mt-1 text-sm italic text-foreground/70">
                &quot;Hello, thank you for calling. How can I help you
                today?&quot;
              </p>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Handoff Threshold
              </span>
              <span className="text-sm">3 failed attempts</span>
            </div>
          </CardContent>
        </Card>

        {/* Industry & Knowledge */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="size-5" />
              Industry & Knowledge
            </CardTitle>
            <CardDescription>
              Domain-specific configuration for your agent.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Industry</span>
              <span className="text-sm">Not selected</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Knowledge Sources
              </span>
              <span className="text-sm">0 documents</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Custom Instructions
              </span>
              <span className="text-sm">None</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
