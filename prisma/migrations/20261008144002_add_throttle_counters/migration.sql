BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "throttle";

-- CreateTable
CREATE TABLE "throttle"."rate_buckets" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "full_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "throttle"."attempt_series" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL,
    "lock_ends_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attempt_series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rate_buckets_key_key" ON "throttle"."rate_buckets"("key");

-- CreateIndex
CREATE INDEX "rate_buckets_full_at_idx" ON "throttle"."rate_buckets"("full_at");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_series_key_key" ON "throttle"."attempt_series"("key");

-- CreateIndex
CREATE INDEX "attempt_series_expires_at_idx" ON "throttle"."attempt_series"("expires_at");

COMMIT;
