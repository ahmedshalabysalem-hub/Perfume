-- INV-002 (ADR-023): movement types for batch inspection and the LEGACY
-- carry-over. Kept apart from the batches migration because PostgreSQL does not
-- let a transaction use an enum value it has just added.
ALTER TYPE "StockMovementType" ADD VALUE 'INSPECTION';
ALTER TYPE "StockMovementType" ADD VALUE 'BATCH_ASSIGNMENT';
