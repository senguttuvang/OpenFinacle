export const coreEnvironment = (database: string): Record<string, string> => {
  const db = new URL(database);
  return {
    FINERACT_SERVER_SSL_ENABLED: "false",
    FINERACT_SERVER_PORT: "8080",
    FINERACT_HIKARI_DRIVER_SOURCE_CLASS_NAME: "org.postgresql.Driver",
    FINERACT_HIKARI_JDBC_URL: `jdbc:postgresql://${db.hostname}:${db.port}/fineract_tenants?sslmode=require`,
    FINERACT_HIKARI_USERNAME: decodeURIComponent(db.username),
    FINERACT_HIKARI_PASSWORD: decodeURIComponent(db.password),
    FINERACT_DEFAULT_TENANTDB_HOSTNAME: db.hostname,
    FINERACT_DEFAULT_TENANTDB_PORT: db.port,
    FINERACT_DEFAULT_TENANTDB_UID: decodeURIComponent(db.username),
    FINERACT_DEFAULT_TENANTDB_PWD: decodeURIComponent(db.password),
    FINERACT_DEFAULT_TENANTDB_CONN_PARAMS: "sslmode=require",
    FINERACT_DEFAULT_TENANTDB_NAME: "fineract_default",
    FINERACT_DEFAULT_TENANTDB_TIMEZONE: "Asia/Kolkata",
    FINERACT_CONTENT_FILESYSTEM_ROOT_FOLDER: "/tmp",
    JAVA_TOOL_OPTIONS: "-Xmx1500m -XX:+UseContainerSupport",
    FINERACT_HIKARI_MINIMUM_IDLE: "1",
    FINERACT_HIKARI_MAXIMUM_POOL_SIZE: "5",
    FINERACT_EXTERNAL_EVENTS_ENABLED: "false",
    FINERACT_NODE_ID: "1",
  };
};
