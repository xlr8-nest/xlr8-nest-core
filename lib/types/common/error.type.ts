/**
 * Stable machine-readable error definition used across decorators,
 * response builders, and custom error classes.
 */
export interface ErrorType<TCode extends string = string> {
  code: TCode;
  message: string;
}

/**
 * Field-level error entry inside an `errors` map.
 * Alias of ErrorType — kept for named clarity at call sites.
 */
export type DetailError<TCode extends string = string> = ErrorType<TCode>;

/**
 * Structured field-level validation or domain errors keyed by field name.
 */
export type ErrorDetails<TField extends string = string, TCode extends string = string> = Record<TField, DetailError<TCode>>;
