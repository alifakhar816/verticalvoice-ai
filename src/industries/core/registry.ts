import type { IndustryId, IndustryPack } from "@/industries/core/industry-pack";

const registry = new Map<IndustryId, IndustryPack>();

export function registerIndustryPack(pack: IndustryPack): void {
  if (registry.has(pack.id)) {
    throw new Error(
      `IndustryPack "${pack.id}" is already registered. Each industry can only be registered once.`
    );
  }
  registry.set(pack.id, pack);
}

export function getIndustryPack(id: IndustryId): IndustryPack {
  const pack = registry.get(id);
  if (!pack) {
    const registered = Array.from(registry.keys()).join(", ") || "(none)";
    throw new Error(
      `IndustryPack "${id}" is not registered. Registered packs: ${registered}`
    );
  }
  return pack;
}

export function getAllIndustryPacks(): IndustryPack[] {
  return Array.from(registry.values());
}

export function hasIndustryPack(id: IndustryId): boolean {
  return registry.has(id);
}

export function clearRegistry(): void {
  registry.clear();
}

export function getRegisteredIndustryIds(): IndustryId[] {
  return Array.from(registry.keys());
}
