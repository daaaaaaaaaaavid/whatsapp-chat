/** Quote a PostgREST filter value so `.`, `,`, and spaces stay literal. */
export function quotePostgrestValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

/** Case-insensitive exact match filter for `.or()`, with LIKE wildcards escaped. */
export function ilikeExactOr(column: string, values: string[]): string {
  return values
    .map((value) => {
      const pattern = value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
      return `${column}.ilike.${quotePostgrestValue(pattern)}`
    })
    .join(",")
}
