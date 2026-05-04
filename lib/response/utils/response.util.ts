export const maybeAttachStatusCode = <TResponse extends { statusCode?: number }>(
  response: TResponse,
  statusCode: number,
  includeStatusCode?: boolean,
): TResponse => {
  if (includeStatusCode) {
    response.statusCode = statusCode;
  }

  return response;
};
