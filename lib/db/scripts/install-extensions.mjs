import pg from "pg";

const url = process.env.LOCAL_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("install-extensions: no LOCAL_DATABASE_URL or DATABASE_URL set; skipping");
  process.exit(0);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  console.log("install-extensions: pg_trgm ensured");
} finally {
  await client.end();
}
