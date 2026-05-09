/**
 * shadcn/ui utilities. Required by every primitive in components/ui/.
 *
 * Owned by: Foundation. shadcn expects this file at @/lib/utils.
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
