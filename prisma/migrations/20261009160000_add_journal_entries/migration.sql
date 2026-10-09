BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "journal";

-- CreateEnum
CREATE TYPE "journal"."actor_kind" AS ENUM ('account', 'system');

-- CreateEnum
CREATE TYPE "journal"."actor_role" AS ENUM ('chief_administrator', 'administrator', 'chairman', 'owner', 'family_member', 'tenant');

-- CreateTable
CREATE TABLE "journal"."entries" (
    "id" UUID NOT NULL,
    "complex_id" UUID NOT NULL,
    "owner_node_id" UUID NOT NULL,
    "actor_account_id" UUID,
    "subject_account_id" UUID,
    "subject_unit_id" UUID,
    "action" TEXT NOT NULL,
    "actor_kind" "journal"."actor_kind" NOT NULL,
    "actor_role" "journal"."actor_role",
    "details" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entries_complex_id_created_at_id_idx" ON "journal"."entries"("complex_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "entries_owner_node_id_created_at_id_idx" ON "journal"."entries"("owner_node_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "entries_actor_account_id_created_at_id_idx" ON "journal"."entries"("actor_account_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "entries_subject_account_id_idx" ON "journal"."entries"("subject_account_id");

-- CreateIndex
CREATE INDEX "entries_subject_unit_id_idx" ON "journal"."entries"("subject_unit_id");

-- AddForeignKey
ALTER TABLE "journal"."entries" ADD CONSTRAINT "entries_complex_id_fkey" FOREIGN KEY ("complex_id") REFERENCES "structure"."nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal"."entries" ADD CONSTRAINT "entries_owner_node_id_fkey" FOREIGN KEY ("owner_node_id") REFERENCES "structure"."nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal"."entries" ADD CONSTRAINT "entries_actor_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "identity"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal"."entries" ADD CONSTRAINT "entries_subject_account_id_fkey" FOREIGN KEY ("subject_account_id") REFERENCES "identity"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal"."entries" ADD CONSTRAINT "entries_subject_unit_id_fkey" FOREIGN KEY ("subject_unit_id") REFERENCES "structure"."units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddCheck
ALTER TABLE "journal"."entries" ADD CONSTRAINT "entries_actor_check" CHECK (
    ("actor_kind" = 'account' AND "actor_account_id" IS NOT NULL)
    OR ("actor_kind" = 'system' AND "actor_account_id" IS NULL AND "actor_role" IS NULL)
);

-- CreateFunction
CREATE FUNCTION "journal"."refuse_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'journal.entries is append-only: % is refused', TG_OP
        USING ERRCODE = 'EB001',
              HINT = 'An entry of the action journal is never changed or removed: docs/decisions.md, R-7';
END;
$$;

-- CreateTrigger
CREATE TRIGGER "entries_append_only"
    BEFORE UPDATE OR DELETE OR TRUNCATE ON "journal"."entries"
    FOR EACH STATEMENT EXECUTE FUNCTION "journal"."refuse_change"();

-- CreateTrigger
CREATE TRIGGER "entries_rows_append_only"
    BEFORE UPDATE OR DELETE ON "journal"."entries"
    FOR EACH ROW EXECUTE FUNCTION "journal"."refuse_change"();

COMMIT;
