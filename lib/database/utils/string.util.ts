import { format } from '@sqltools/formatter/lib/sqlFormatter';

export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

export function prettifyQuery(query: string) {
  const formattedQuery = format(query, { indent: '  ' });
  return '\n' + formattedQuery.replace(/^/gm, '      ') + '\n    ';
}

export function queryParams(parameters: readonly unknown[] | undefined): string {
  if (!parameters || !parameters.length) {
    return '';
  }

  return `, ${JSON.stringify(parameters)}`;
}
