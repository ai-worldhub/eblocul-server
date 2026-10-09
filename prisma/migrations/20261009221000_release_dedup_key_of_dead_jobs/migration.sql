BEGIN;

-- DropIndex
DROP INDEX "jobs"."jobs_kind_dedup_key_key";

-- CreateIndex
CREATE UNIQUE INDEX "jobs_live_kind_dedup_key_key" ON "jobs"."jobs"("kind", "dedup_key") WHERE "state" <> 'dead' AND "dedup_key" IS NOT NULL;

COMMIT;
