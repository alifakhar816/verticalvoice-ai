import type { Industry } from './types';

/* =====================================================================
   Workspace accent
   ---------------------------------------------------------------------
   Step 1 (Choose Industry) sets `data.industry`, which becomes the
   workspace accent (the vertical jewel) for the rest of the flow. Every
   step receives `data`, so each derives its accent locally from
   `data.industry` via these helpers, no prop plumbing required. When no
   industry is selected yet the accent falls back to the brass brand.

   `accentVar` returns a CSS variable string suitable for the LiveCallOrb
   `accent` prop and inline `style` tints. `accentClasses` returns the
   matching Tailwind utility classes for tinting cards, tiles, and rings.
   ===================================================================== */

export interface AccentClasses {
  /** text-* utility painting to the jewel (or brass). */
  text: string;
  /** solid bg-* utility. */
  bg: string;
  /** ring-* utility for selection rings. */
  ring: string;
  /** border-* utility. */
  border: string;
}

const VERTICAL_VAR: Record<Industry, string> = {
  healthcare: 'var(--vertical-healthcare)',
  restaurant: 'var(--vertical-restaurant)',
  real_estate: 'var(--vertical-realestate)',
};

const VERTICAL_CLASSES: Record<Industry, AccentClasses> = {
  healthcare: {
    text: 'text-vertical-healthcare',
    bg: 'bg-vertical-healthcare',
    ring: 'ring-vertical-healthcare',
    border: 'border-vertical-healthcare',
  },
  restaurant: {
    text: 'text-vertical-restaurant',
    bg: 'bg-vertical-restaurant',
    ring: 'ring-vertical-restaurant',
    border: 'border-vertical-restaurant',
  },
  real_estate: {
    text: 'text-vertical-realestate',
    bg: 'bg-vertical-realestate',
    ring: 'ring-vertical-realestate',
    border: 'border-vertical-realestate',
  },
};

const BRAND_CLASSES: AccentClasses = {
  text: 'text-brand',
  bg: 'bg-brand',
  ring: 'ring-brand',
  border: 'border-brand',
};

/** CSS variable string for the current workspace accent. */
export function accentVar(industry: Industry | null): string {
  return industry ? VERTICAL_VAR[industry] : 'var(--brand)';
}

/** Tailwind utility classes for the current workspace accent. */
export function accentClasses(industry: Industry | null): AccentClasses {
  return industry ? VERTICAL_CLASSES[industry] : BRAND_CLASSES;
}

export const industryLabels: Record<Industry, string> = {
  healthcare: 'Healthcare',
  restaurant: 'Restaurant',
  real_estate: 'Real Estate',
};
