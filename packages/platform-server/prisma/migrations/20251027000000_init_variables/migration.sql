-- Variables model per Issue #467
CREATE TABLE "Variable" (
  "id" SERIAL PRIMARY KEY,
  "graphName" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Variable_graphName_key_unique" ON "Variable" ("graphName", "key");

