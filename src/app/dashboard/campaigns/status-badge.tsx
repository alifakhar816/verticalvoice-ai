import { Badge } from "@/components/ui/badge";
import { CAMPAIGN_STATUS_LABELS, type CampaignStatus } from "@/lib/campaign-ui/progress";

/**
 * A campaign's lifecycle state as a pill.
 *
 * Shared by the list and the detail header so the same status never renders two
 * different ways. The raw column value ("cancelled") is never displayed — the
 * label comes from CAMPAIGN_STATUS_LABELS.
 */

const VARIANTS: Record<CampaignStatus, "success" | "warning" | "secondary" | "outline"> = {
  draft: "outline",
  running: "success",
  paused: "warning",
  completed: "secondary",
  // Deliberately not `destructive`: cancelling is a normal, deliberate action,
  // not an error, and painting it red would read as something having gone wrong.
  cancelled: "secondary",
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <Badge variant={VARIANTS[status] ?? "outline"}>
      {CAMPAIGN_STATUS_LABELS[status] ?? "Unknown"}
    </Badge>
  );
}
