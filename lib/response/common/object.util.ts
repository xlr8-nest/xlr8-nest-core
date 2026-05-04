export type UnknownRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === 'object' && value !== null;
};
