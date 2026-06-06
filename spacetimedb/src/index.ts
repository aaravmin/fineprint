// Module entry. Reducers must evaluate after the schema, so re-export order matters:
// './reducers' imports './schema' internally, which guarantees the schema instance
// is fully initialized before any reducer registers against it.
export * from "./reducers";
export { default } from "./schema";
