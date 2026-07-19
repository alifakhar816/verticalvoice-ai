import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CampaignForm } from "./campaign-form";

/**
 * Create-a-campaign page.
 *
 * A server shell around one client form: everything on this screen is
 * interactive (call-type choice, audience, pacing), so the form itself is the
 * client boundary and the page around it stays a Server Component.
 */
export default function NewCampaignPage() {
  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-2 text-muted-foreground"
          render={<Link href="/dashboard/campaigns" />}
        >
          <ArrowLeft className="mr-1.5 size-4" aria-hidden="true" />
          Back to campaigns
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">New campaign</h1>
        <p className="text-muted-foreground">
          Choose who to call and how. Nothing is dialled until you start the campaign on the next
          screen.
        </p>
      </div>

      <CampaignForm />
    </div>
  );
}
