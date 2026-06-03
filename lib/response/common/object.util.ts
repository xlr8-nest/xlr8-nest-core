export type UnknownRecord = Record<string, unknown>;

/** True when value is a plain (non-array) object. */
export const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};
