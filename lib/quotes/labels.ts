import { CATEGORY_LABELS, type CategoryCode } from "@/lib/catalog/v1";

export function categoryLabel(c: string): string {
  return CATEGORY_LABELS[c as CategoryCode] ?? c;
}
