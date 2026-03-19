import { StatusCode } from '../../core/constants';
import { DetailError } from "./error.type";

export interface ApiResponse<T> {
  success: boolean;
  code: string;
  message: string;
  statusCode?: StatusCode;
}

export interface SuccessApiResponse<T> extends ApiResponse<T> {
  data: T;
}

export interface ErrorApiResponse extends ApiResponse<unknown> {
  errors?: DetailError[];
}