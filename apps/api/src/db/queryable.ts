import type { QueryConfig, QueryResult, QueryResultRow } from "pg";

/** A pool, a pooled client or a client inside a transaction. */
export interface Queryable {
  query<R extends QueryResultRow = any>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
  query<R extends any[] = any[]>(
    config: QueryConfig & { rowMode: "array" },
  ): Promise<QueryResult<R>>;
}
