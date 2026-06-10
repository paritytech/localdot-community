/**
 * Input filters for number-only form fields. Used in CreateListing,
 * RegisterAgent and Exchange where amount/fee inputs must reject letters
 * and (for integer fields) decimal separators.
 */

import type { KeyboardEvent } from "react";

export function filterIntegerInput(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

export function filterDecimalInput(value: string): string {
  return value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
}

/** Prevent native browsers from inserting `.`, `,`, `e`, `+`, `-` in integer inputs. */
export function blockDecimalKeys(e: KeyboardEvent): void {
  if ([".", ",", "e", "E", "+", "-"].includes(e.key)) {
    e.preventDefault();
  }
}
