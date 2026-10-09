BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "membership";

-- CreateEnum
CREATE TYPE "membership"."resident_role" AS ENUM ('owner', 'family_member', 'tenant');

-- CreateEnum
CREATE TYPE "membership"."assignment_role" AS ENUM ('chief_administrator', 'administrator', 'chairman', 'zone_takeover');

-- CreateTable
CREATE TABLE "membership"."unit_memberships" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "role" "membership"."resident_role" NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),

    CONSTRAINT "unit_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership"."node_assignments" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "node_id" UUID NOT NULL,
    "role" "membership"."assignment_role" NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),

    CONSTRAINT "node_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "unit_memberships_account_id_idx" ON "membership"."unit_memberships"("account_id");

-- CreateIndex
CREATE INDEX "unit_memberships_unit_id_idx" ON "membership"."unit_memberships"("unit_id");

-- CreateIndex
CREATE INDEX "node_assignments_account_id_idx" ON "membership"."node_assignments"("account_id");

-- CreateIndex
CREATE INDEX "node_assignments_node_id_idx" ON "membership"."node_assignments"("node_id");

-- AddForeignKey
ALTER TABLE "membership"."unit_memberships" ADD CONSTRAINT "unit_memberships_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership"."unit_memberships" ADD CONSTRAINT "unit_memberships_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "structure"."units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership"."node_assignments" ADD CONSTRAINT "node_assignments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership"."node_assignments" ADD CONSTRAINT "node_assignments_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "structure"."nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "unit_memberships_active_account_id_unit_id_key" ON "membership"."unit_memberships"("account_id", "unit_id") WHERE "ended_at" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "node_assignments_active_account_id_node_id_role_key" ON "membership"."node_assignments"("account_id", "node_id", "role") WHERE "ended_at" IS NULL;

COMMIT;
