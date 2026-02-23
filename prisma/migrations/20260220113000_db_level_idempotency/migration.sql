SET NOCOUNT ON;

DECLARE @ordersSchema SYSNAME;
DECLARE @ordersTable SYSNAME;
DECLARE @webhooksSchema SYSNAME;
DECLARE @webhooksTable SYSNAME;

DECLARE @ordersUserCol SYSNAME;
DECLARE @ordersIdempotencyCol SYSNAME;
DECLARE @webhooksProviderCol SYSNAME;
DECLARE @webhooksEventCol SYSNAME;
DECLARE @webhooksResourceCol SYSNAME;

DECLARE @sql NVARCHAR(MAX);
DECLARE @hasDuplicates BIT;

/* -------------------------------------------------------------------------
   Resolve schemas/tables/columns from catalog metadata (no name assumptions)
------------------------------------------------------------------------- */
SELECT TOP (1)
  @ordersSchema = t.TABLE_SCHEMA,
  @ordersTable = t.TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES t
WHERE t.TABLE_TYPE = 'BASE TABLE'
  AND LOWER(t.TABLE_NAME) = 'orders'
ORDER BY CASE WHEN t.TABLE_SCHEMA = 'dbo' THEN 0 ELSE 1 END, t.TABLE_SCHEMA, t.TABLE_NAME;

SELECT TOP (1)
  @webhooksSchema = t.TABLE_SCHEMA,
  @webhooksTable = t.TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES t
WHERE t.TABLE_TYPE = 'BASE TABLE'
  AND LOWER(t.TABLE_NAME) = 'payment_webhook_events'
ORDER BY CASE WHEN t.TABLE_SCHEMA = 'dbo' THEN 0 ELSE 1 END, t.TABLE_SCHEMA, t.TABLE_NAME;

IF @ordersSchema IS NULL OR @ordersTable IS NULL
  THROW 51010, 'Migration aborted: could not locate orders table via INFORMATION_SCHEMA.TABLES.', 1;

IF @webhooksSchema IS NULL OR @webhooksTable IS NULL
  THROW 51011, 'Migration aborted: could not locate payment_webhook_events table via INFORMATION_SCHEMA.TABLES.', 1;

SELECT TOP (1) @ordersUserCol = c.COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_SCHEMA = @ordersSchema
  AND c.TABLE_NAME = @ordersTable
  AND LOWER(c.COLUMN_NAME) IN ('user_id', 'userid')
ORDER BY CASE WHEN LOWER(c.COLUMN_NAME) = 'user_id' THEN 0 ELSE 1 END, c.ORDINAL_POSITION;

SELECT TOP (1) @ordersIdempotencyCol = c.COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_SCHEMA = @ordersSchema
  AND c.TABLE_NAME = @ordersTable
  AND LOWER(c.COLUMN_NAME) IN ('idempotency_key', 'idempotencykey')
ORDER BY CASE WHEN LOWER(c.COLUMN_NAME) = 'idempotency_key' THEN 0 ELSE 1 END, c.ORDINAL_POSITION;

SELECT TOP (1) @webhooksProviderCol = c.COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_SCHEMA = @webhooksSchema
  AND c.TABLE_NAME = @webhooksTable
  AND LOWER(c.COLUMN_NAME) IN ('provider')
ORDER BY c.ORDINAL_POSITION;

SELECT TOP (1) @webhooksEventCol = c.COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_SCHEMA = @webhooksSchema
  AND c.TABLE_NAME = @webhooksTable
  AND LOWER(c.COLUMN_NAME) IN ('event_id', 'eventid')
ORDER BY CASE WHEN LOWER(c.COLUMN_NAME) = 'event_id' THEN 0 ELSE 1 END, c.ORDINAL_POSITION;

SELECT TOP (1) @webhooksResourceCol = c.COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_SCHEMA = @webhooksSchema
  AND c.TABLE_NAME = @webhooksTable
  AND LOWER(c.COLUMN_NAME) IN ('resource_id', 'resourceid');

IF @ordersUserCol IS NULL
  THROW 51012, 'Migration aborted: could not locate orders user column (expected user_id/userId).', 1;

IF @ordersIdempotencyCol IS NULL
  THROW 51013, 'Migration aborted: could not locate orders idempotency column (expected idempotency_key/idempotencyKey).', 1;

IF @webhooksProviderCol IS NULL
  THROW 51014, 'Migration aborted: could not locate payment_webhook_events provider column.', 1;

IF @webhooksEventCol IS NULL
  THROW 51015, 'Migration aborted: could not locate payment_webhook_events event_id/eventId column.', 1;

/* -------------------------------------------------------------------------
   Preflight duplicate checks (fail fast, no silent data mutation)
------------------------------------------------------------------------- */

/*
Diagnostic query for THROW 51000 (orders duplicate idempotency per user):
SELECT [user_col], [idempotency_col], COUNT(*) AS duplicate_count
FROM [schema].[orders_table]
WHERE [idempotency_col] IS NOT NULL
GROUP BY [user_col], [idempotency_col]
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, [user_col], [idempotency_col];
*/
SET @hasDuplicates = 0;
SET @sql = N'
IF EXISTS (
  SELECT 1
  FROM ' + QUOTENAME(@ordersSchema) + N'.' + QUOTENAME(@ordersTable) + N'
  WHERE ' + QUOTENAME(@ordersIdempotencyCol) + N' IS NOT NULL
  GROUP BY ' + QUOTENAME(@ordersUserCol) + N', ' + QUOTENAME(@ordersIdempotencyCol) + N'
  HAVING COUNT(*) > 1
)
  SELECT @hasDupOut = 1;
ELSE
  SELECT @hasDupOut = 0;';
EXEC sp_executesql @sql, N'@hasDupOut BIT OUTPUT', @hasDupOut = @hasDuplicates OUTPUT;

IF @hasDuplicates = 1
  THROW 51000, 'Migration aborted: duplicate (user, idempotency_key) rows exist in orders. Run the diagnostic SELECT in the migration comments.', 1;

/*
Diagnostic query for THROW 51001 (webhook duplicate provider+event):
SELECT [provider_col], [event_col], COUNT(*) AS duplicate_count
FROM [schema].[payment_webhook_events_table]
GROUP BY [provider_col], [event_col]
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, [provider_col], [event_col];
*/
SET @hasDuplicates = 0;
SET @sql = N'
IF EXISTS (
  SELECT 1
  FROM ' + QUOTENAME(@webhooksSchema) + N'.' + QUOTENAME(@webhooksTable) + N'
  GROUP BY ' + QUOTENAME(@webhooksProviderCol) + N', ' + QUOTENAME(@webhooksEventCol) + N'
  HAVING COUNT(*) > 1
)
  SELECT @hasDupOut = 1;
ELSE
  SELECT @hasDupOut = 0;';
EXEC sp_executesql @sql, N'@hasDupOut BIT OUTPUT', @hasDupOut = @hasDuplicates OUTPUT;

IF @hasDuplicates = 1
  THROW 51001, 'Migration aborted: duplicate (provider, event_id) rows exist in payment_webhook_events. Run the diagnostic SELECT in the migration comments.', 1;

/* Ensure resource_id/resourceId column exists before provider+resource duplicate validation. */
IF @webhooksResourceCol IS NULL
BEGIN
  SET @sql = N'ALTER TABLE ' + QUOTENAME(@webhooksSchema) + N'.' + QUOTENAME(@webhooksTable)
           + N' ADD [resource_id] VARCHAR(255) NULL;';
  EXEC sp_executesql @sql;
  SET @webhooksResourceCol = N'resource_id';
END;

/*
Diagnostic query for THROW 51002 (webhook duplicate provider+resource when resource is not null):
SELECT [provider_col], [resource_col], COUNT(*) AS duplicate_count
FROM [schema].[payment_webhook_events_table]
WHERE [resource_col] IS NOT NULL
GROUP BY [provider_col], [resource_col]
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, [provider_col], [resource_col];
*/
SET @hasDuplicates = 0;
SET @sql = N'
IF EXISTS (
  SELECT 1
  FROM ' + QUOTENAME(@webhooksSchema) + N'.' + QUOTENAME(@webhooksTable) + N'
  WHERE ' + QUOTENAME(@webhooksResourceCol) + N' IS NOT NULL
  GROUP BY ' + QUOTENAME(@webhooksProviderCol) + N', ' + QUOTENAME(@webhooksResourceCol) + N'
  HAVING COUNT(*) > 1
)
  SELECT @hasDupOut = 1;
ELSE
  SELECT @hasDupOut = 0;';
EXEC sp_executesql @sql, N'@hasDupOut BIT OUTPUT', @hasDupOut = @hasDuplicates OUTPUT;

IF @hasDuplicates = 1
  THROW 51002, 'Migration aborted: duplicate (provider, resource_id) rows exist where resource_id is not null. Run the diagnostic SELECT in the migration comments.', 1;

/* -------------------------------------------------------------------------
   Drop legacy unique constraints/indexes on single key columns
------------------------------------------------------------------------- */

DECLARE @dropName SYSNAME;
DECLARE @dropSql NVARCHAR(MAX);

-- orders: drop any UNIQUE CONSTRAINT defined only on idempotency_key/idempotencyKey
DECLARE orders_constraints_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT kc.name
FROM sys.key_constraints kc
JOIN sys.tables t ON t.object_id = kc.parent_object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.indexes i ON i.object_id = kc.parent_object_id AND i.index_id = kc.unique_index_id
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.key_ordinal > 0
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE kc.[type] = 'UQ'
  AND s.name = @ordersSchema
  AND t.name = @ordersTable
GROUP BY kc.name
HAVING COUNT(*) = 1
   AND MAX(c.name) = @ordersIdempotencyCol;

OPEN orders_constraints_cursor;
FETCH NEXT FROM orders_constraints_cursor INTO @dropName;
WHILE @@FETCH_STATUS = 0
BEGIN
  SET @dropSql = N'ALTER TABLE ' + QUOTENAME(@ordersSchema) + N'.' + QUOTENAME(@ordersTable)
               + N' DROP CONSTRAINT ' + QUOTENAME(@dropName) + N';';
  EXEC sp_executesql @dropSql;
  FETCH NEXT FROM orders_constraints_cursor INTO @dropName;
END
CLOSE orders_constraints_cursor;
DEALLOCATE orders_constraints_cursor;

-- orders: drop any standalone UNIQUE INDEX defined only on idempotency_key/idempotencyKey
DECLARE orders_indexes_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT i.name
FROM sys.indexes i
JOIN sys.tables t ON t.object_id = i.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.key_ordinal > 0
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.is_unique = 1
  AND i.is_primary_key = 0
  AND i.is_unique_constraint = 0
  AND s.name = @ordersSchema
  AND t.name = @ordersTable
GROUP BY i.name
HAVING COUNT(*) = 1
   AND MAX(c.name) = @ordersIdempotencyCol;

OPEN orders_indexes_cursor;
FETCH NEXT FROM orders_indexes_cursor INTO @dropName;
WHILE @@FETCH_STATUS = 0
BEGIN
  SET @dropSql = N'DROP INDEX ' + QUOTENAME(@dropName) + N' ON '
               + QUOTENAME(@ordersSchema) + N'.' + QUOTENAME(@ordersTable) + N';';
  EXEC sp_executesql @dropSql;
  FETCH NEXT FROM orders_indexes_cursor INTO @dropName;
END
CLOSE orders_indexes_cursor;
DEALLOCATE orders_indexes_cursor;

/* -------------------------------------------------------------------------
   Create new deterministic constraints/indexes
------------------------------------------------------------------------- */

IF NOT EXISTS (
  SELECT 1
  FROM sys.key_constraints kc
  JOIN sys.tables t ON t.object_id = kc.parent_object_id
  JOIN sys.schemas s ON s.schema_id = t.schema_id
  WHERE kc.[type] = 'UQ'
    AND kc.name = 'uq_orders_user_idempotency'
    AND s.name = @ordersSchema
    AND t.name = @ordersTable
)
BEGIN
  SET @sql = N'ALTER TABLE ' + QUOTENAME(@ordersSchema) + N'.' + QUOTENAME(@ordersTable)
           + N' ADD CONSTRAINT [uq_orders_user_idempotency] UNIQUE ('
           + QUOTENAME(@ordersUserCol) + N', ' + QUOTENAME(@ordersIdempotencyCol) + N');';
  EXEC sp_executesql @sql;
END;

-- payment_webhook_events: drop any UNIQUE CONSTRAINT defined only on event_id/eventId
DECLARE webhooks_constraints_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT kc.name
FROM sys.key_constraints kc
JOIN sys.tables t ON t.object_id = kc.parent_object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.indexes i ON i.object_id = kc.parent_object_id AND i.index_id = kc.unique_index_id
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.key_ordinal > 0
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE kc.[type] = 'UQ'
  AND s.name = @webhooksSchema
  AND t.name = @webhooksTable
GROUP BY kc.name
HAVING COUNT(*) = 1
   AND MAX(c.name) = @webhooksEventCol;

OPEN webhooks_constraints_cursor;
FETCH NEXT FROM webhooks_constraints_cursor INTO @dropName;
WHILE @@FETCH_STATUS = 0
BEGIN
  SET @dropSql = N'ALTER TABLE ' + QUOTENAME(@webhooksSchema) + N'.' + QUOTENAME(@webhooksTable)
               + N' DROP CONSTRAINT ' + QUOTENAME(@dropName) + N';';
  EXEC sp_executesql @dropSql;
  FETCH NEXT FROM webhooks_constraints_cursor INTO @dropName;
END
CLOSE webhooks_constraints_cursor;
DEALLOCATE webhooks_constraints_cursor;

-- payment_webhook_events: drop any standalone UNIQUE INDEX defined only on event_id/eventId
DECLARE webhooks_indexes_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT i.name
FROM sys.indexes i
JOIN sys.tables t ON t.object_id = i.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.key_ordinal > 0
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.is_unique = 1
  AND i.is_primary_key = 0
  AND i.is_unique_constraint = 0
  AND s.name = @webhooksSchema
  AND t.name = @webhooksTable
GROUP BY i.name
HAVING COUNT(*) = 1
   AND MAX(c.name) = @webhooksEventCol;

OPEN webhooks_indexes_cursor;
FETCH NEXT FROM webhooks_indexes_cursor INTO @dropName;
WHILE @@FETCH_STATUS = 0
BEGIN
  SET @dropSql = N'DROP INDEX ' + QUOTENAME(@dropName) + N' ON '
               + QUOTENAME(@webhooksSchema) + N'.' + QUOTENAME(@webhooksTable) + N';';
  EXEC sp_executesql @dropSql;
  FETCH NEXT FROM webhooks_indexes_cursor INTO @dropName;
END
CLOSE webhooks_indexes_cursor;
DEALLOCATE webhooks_indexes_cursor;

IF NOT EXISTS (
  SELECT 1
  FROM sys.key_constraints kc
  JOIN sys.tables t ON t.object_id = kc.parent_object_id
  JOIN sys.schemas s ON s.schema_id = t.schema_id
  WHERE kc.[type] = 'UQ'
    AND kc.name = 'uq_payment_webhook_events_provider_event'
    AND s.name = @webhooksSchema
    AND t.name = @webhooksTable
)
BEGIN
  SET @sql = N'ALTER TABLE ' + QUOTENAME(@webhooksSchema) + N'.' + QUOTENAME(@webhooksTable)
           + N' ADD CONSTRAINT [uq_payment_webhook_events_provider_event] UNIQUE ('
           + QUOTENAME(@webhooksProviderCol) + N', ' + QUOTENAME(@webhooksEventCol) + N');';
  EXEC sp_executesql @sql;
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes i
  JOIN sys.tables t ON t.object_id = i.object_id
  JOIN sys.schemas s ON s.schema_id = t.schema_id
  WHERE i.name = 'uq_payment_webhook_events_provider_resource'
    AND s.name = @webhooksSchema
    AND t.name = @webhooksTable
)
BEGIN
  SET @sql = N'CREATE UNIQUE INDEX [uq_payment_webhook_events_provider_resource] ON '
           + QUOTENAME(@webhooksSchema) + N'.' + QUOTENAME(@webhooksTable)
           + N' (' + QUOTENAME(@webhooksProviderCol) + N', ' + QUOTENAME(@webhooksResourceCol) + N')'
           + N' WHERE ' + QUOTENAME(@webhooksResourceCol) + N' IS NOT NULL;';
  EXEC sp_executesql @sql;
END;

/* -------------------------------------------------------------------------
   Post-check verification queries (run manually after migration)
-------------------------------------------------------------------------
SELECT s.name AS schema_name, t.name AS table_name, kc.name AS constraint_name
FROM sys.key_constraints kc
JOIN sys.tables t ON t.object_id = kc.parent_object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE kc.name IN (
  'uq_orders_user_idempotency',
  'uq_payment_webhook_events_provider_event'
);

SELECT s.name AS schema_name, t.name AS table_name, i.name AS index_name, i.filter_definition
FROM sys.indexes i
JOIN sys.tables t ON t.object_id = i.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE i.name = 'uq_payment_webhook_events_provider_resource';
------------------------------------------------------------------------- */