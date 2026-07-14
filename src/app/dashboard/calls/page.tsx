"use client";

import { PhoneOff } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSearchParams } from "next/navigation";

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <PhoneOff className="size-8 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">No calls yet</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Complete your agent setup to start receiving calls. Once your AI agent is
        configured and a phone number is assigned, calls will appear here.
      </p>
    </div>
  );
}

export default function CallsPage() {
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") === "history" ? "history" : "live";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Calls</h1>
        <p className="text-muted-foreground">
          Monitor live calls and review call history.
        </p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="live">Live Calls</TabsTrigger>
          <TabsTrigger value="history">Call History</TabsTrigger>
        </TabsList>

        <TabsContent value="live">
          <Card>
            <CardHeader>
              <CardTitle>Live Calls</CardTitle>
              <CardDescription>
                Calls currently being handled by your AI agent.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmptyState />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Call History</CardTitle>
              <CardDescription>
                Review past calls, transcripts, and outcomes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmptyState />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
