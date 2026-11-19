import { clsx, type ClassValue } from "clsx";

/** Tiny class-name helper (shadcn-compatible) built on the existing clsx dependency. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
