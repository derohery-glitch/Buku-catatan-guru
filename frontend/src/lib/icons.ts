import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/src/lib/theme";

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  wallet: "wallet",
  "hand-heart": "heart-circle",
  "plus-circle": "add-circle",
  utensils: "restaurant",
  car: "car",
  "shopping-bag": "bag",
  heart: "heart",
  "book-open": "book",
  activity: "fitness",
  "more-horizontal": "ellipsis-horizontal",
  tag: "pricetag",
};

export function categoryIcon(icon?: string | null): keyof typeof Ionicons.glyphMap {
  return ICON_MAP[icon ?? ""] ?? "pricetag";
}

export const DONUT_COLORS = [
  COLORS.primary,
  COLORS.expense,
  "#8FAE93",
  "#D7A98F",
  "#A4866B",
  "#5E8772",
  "#B14C3A",
  "#C2B280",
  "#6E8B7F",
  "#A36B53",
];
