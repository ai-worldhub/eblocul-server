BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "jobs";

-- CreateEnum
CREATE TYPE "jobs"."job_class" AS ENUM ('p0', 'p1', 'p2', 'p3', 'p4_short', 'p4_long');

-- CreateEnum
CREATE TYPE "jobs"."job_state" AS ENUM ('waiting', 'running', 'dead');

-- CreateTable
CREATE TABLE "jobs"."jobs" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "class" "jobs"."job_class" NOT NULL,
    "state" "jobs"."job_state" NOT NULL,
    "payload" JSONB NOT NULL,
    "dedup_key" TEXT,
    "attempts" INTEGER NOT NULL,
    "lease_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "available_at" TIMESTAMPTZ(3) NOT NULL,
    "lease_expires_at" TIMESTAMPTZ(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_state_available_at_idx" ON "jobs"."jobs"("state", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_kind_dedup_key_key" ON "jobs"."jobs"("kind", "dedup_key");

COMMIT;
