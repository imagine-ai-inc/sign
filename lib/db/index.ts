import "server-only";
import postgres from "postgres";
import { env } from "@/lib/env";

declare global {
  // eslint-disable-next-line no-var
  var __signSql: postgres.Sql | undefined;
}

function make() {
  return postgres(env.databaseUrl(), {
    prepare: false, // Supavisor transaction pooler
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    transform: postgres.camel,
    onnotice: () => {},
  });
}

export const sql: postgres.Sql = globalThis.__signSql ?? make();
if (process.env.NODE_ENV !== "production") globalThis.__signSql = sql;

export type Tx = postgres.TransactionSql;
export type Db = postgres.Sql | postgres.TransactionSql;
