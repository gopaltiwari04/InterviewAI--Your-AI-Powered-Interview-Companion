import type { Signature, ValueType } from "../types";

export const usesType = (sig: Signature, type: ValueType): boolean =>
  sig.returns === type || sig.params.some((p) => p.type === type);

export const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
