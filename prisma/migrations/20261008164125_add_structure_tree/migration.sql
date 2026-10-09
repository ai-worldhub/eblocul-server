BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "structure";

-- CreateEnum
CREATE TYPE "structure"."node_kind" AS ENUM ('quarter', 'zone', 'building', 'line', 'entrance');

-- CreateEnum
CREATE TYPE "structure"."unit_type" AS ENUM ('apartment', 'townhouse', 'house', 'duplex');

-- CreateTable
CREATE TABLE "structure"."nodes" (
    "id" UUID NOT NULL,
    "complex_id" UUID NOT NULL,
    "kind" "structure"."node_kind" NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "structure"."node_ancestors" (
    "node_id" UUID NOT NULL,
    "ancestor_id" UUID NOT NULL,
    "depth" INTEGER NOT NULL,

    CONSTRAINT "node_ancestors_pkey" PRIMARY KEY ("node_id","ancestor_id")
);

-- CreateTable
CREATE TABLE "structure"."units" (
    "id" UUID NOT NULL,
    "complex_id" UUID NOT NULL,
    "node_id" UUID NOT NULL,
    "type" "structure"."unit_type" NOT NULL,
    "number" TEXT NOT NULL,
    "floor" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nodes_complex_id_idx" ON "structure"."nodes"("complex_id");

-- CreateIndex
CREATE INDEX "node_ancestors_ancestor_id_node_id_idx" ON "structure"."node_ancestors"("ancestor_id", "node_id");

-- CreateIndex
CREATE INDEX "units_complex_id_idx" ON "structure"."units"("complex_id");

-- CreateIndex
CREATE UNIQUE INDEX "units_node_id_number_key" ON "structure"."units"("node_id", "number");

-- AddForeignKey
ALTER TABLE "structure"."nodes" ADD CONSTRAINT "nodes_complex_id_fkey" FOREIGN KEY ("complex_id") REFERENCES "structure"."nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structure"."node_ancestors" ADD CONSTRAINT "node_ancestors_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "structure"."nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structure"."node_ancestors" ADD CONSTRAINT "node_ancestors_ancestor_id_fkey" FOREIGN KEY ("ancestor_id") REFERENCES "structure"."nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structure"."units" ADD CONSTRAINT "units_complex_id_fkey" FOREIGN KEY ("complex_id") REFERENCES "structure"."nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structure"."units" ADD CONSTRAINT "units_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "structure"."nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
