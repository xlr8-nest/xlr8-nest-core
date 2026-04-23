export interface ErrorType<TCode extends string = string> {
  code: TCode;
  message: string;
}

export interface DetailError<TCode extends string = string> extends ErrorType<TCode> {}

export type ErrorDetails<TField extends string = string, TCode extends string = string> = Record<TField, DetailError<TCode>>;
