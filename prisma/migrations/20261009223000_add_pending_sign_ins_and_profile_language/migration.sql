BEGIN;

DELETE FROM "identity"."phone_codes";

-- CreateEnum
CREATE TYPE "identity"."profile_language" AS ENUM ('ro', 'ru');

-- DropIndex
DROP INDEX "identity"."phone_codes_pending_token_hash_key";

-- AlterTable
ALTER TABLE "identity"."accounts" ADD COLUMN     "language" "identity"."profile_language";

-- AlterTable
ALTER TABLE "identity"."phone_codes" DROP COLUMN "confirmed_at",
DROP COLUMN "pending_token_hash",
ADD COLUMN     "language" "identity"."profile_language" NOT NULL;

-- CreateTable
CREATE TABLE "identity"."pending_sign_ins" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "language" "identity"."profile_language" NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pending_sign_ins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_sign_ins_phone_key" ON "identity"."pending_sign_ins"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "pending_sign_ins_token_hash_key" ON "identity"."pending_sign_ins"("token_hash");

-- CreateIndex
CREATE INDEX "pending_sign_ins_expires_at_idx" ON "identity"."pending_sign_ins"("expires_at");

COMMIT;
