import type { IndustryId } from "@/industries/core/industry-pack";
import type { ToolHandler, ToolHandlerMap } from "./types";
import { healthcareToolHandlers } from "./healthcare";
import { restaurantToolHandlers } from "./restaurant";
import { realEstateToolHandlers } from "./real-estate";
import { transferCallHandler } from "./transfer-call";

const registry: Record<IndustryId, ToolHandlerMap> = {
  healthcare: { ...healthcareToolHandlers, ...transferCallHandler },
  restaurant: { ...restaurantToolHandlers, ...transferCallHandler },
  real_estate: { ...realEstateToolHandlers, ...transferCallHandler },
};

export function getToolHandler(industry: IndustryId, toolId: string): ToolHandler | undefined {
  return registry[industry]?.[toolId];
}
