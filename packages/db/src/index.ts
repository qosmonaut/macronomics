export * as schema from "./schema.ts";
export { createDb, type Db, type DbHandle, type Schema } from "./client.ts";
export { upsertProduct } from "./repository.ts";
export { listProductsByMetric, getProduct, searchProducts } from "./queries.ts";
