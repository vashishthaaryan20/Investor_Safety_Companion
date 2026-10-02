export const Palette = {
  navy: "#0F172A",
  navySoft: "#1E293B",
  ink: "#111827",
  text: "#1F2937",
  muted: "#6B7280",
  subtle: "#9CA3AF",
  border: "#E5E7EB",
  surface: "#FFFFFF",
  background: "#F5F7FB",
  brand: "#2563EB",
  brandSoft: "#EFF6FF",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
  warning: "#EA580C",
  warningSoft: "#FFF7ED",
  caution: "#D97706",
  cautionSoft: "#FFFBEB",
  success: "#16A34A",
  successSoft: "#F0FDF4",
  highlight: "#FDE68A",
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const CardShadow = {
  shadowColor: "#0F172A",
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;
