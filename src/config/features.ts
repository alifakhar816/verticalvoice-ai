type FeatureFlags = {
  healthcare_demo_mode: boolean;
  restaurant_ordering: boolean;
  real_estate_outbound: boolean;
  phi_mode: boolean;
  outbound_calling: boolean;
};

const defaults: FeatureFlags = {
  healthcare_demo_mode: false,
  restaurant_ordering: false,
  real_estate_outbound: false,
  phi_mode: false,
  outbound_calling: false,
};

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

export function getFeatureFlags(): FeatureFlags {
  return {
    healthcare_demo_mode: parseBool(
      process.env.NEXT_PUBLIC_FF_HEALTHCARE_DEMO_MODE,
      defaults.healthcare_demo_mode
    ),
    restaurant_ordering: parseBool(
      process.env.NEXT_PUBLIC_FF_RESTAURANT_ORDERING,
      defaults.restaurant_ordering
    ),
    real_estate_outbound: parseBool(
      process.env.NEXT_PUBLIC_FF_REAL_ESTATE_OUTBOUND,
      defaults.real_estate_outbound
    ),
    phi_mode: false, // PHI mode is never enabled via env — requires code change
    outbound_calling: parseBool(
      process.env.NEXT_PUBLIC_FF_OUTBOUND_CALLING,
      defaults.outbound_calling
    ),
  };
}

export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
  return getFeatureFlags()[flag];
}

export type { FeatureFlags };
