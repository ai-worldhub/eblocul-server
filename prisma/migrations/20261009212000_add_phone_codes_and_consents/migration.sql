BEGIN;

-- CreateTable
CREATE TABLE "identity"."consents" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."phone_codes" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "pending_token_hash" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),

    CONSTRAINT "phone_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consents_account_id_version_key" ON "identity"."consents"("account_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "phone_codes_phone_key" ON "identity"."phone_codes"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "phone_codes_pending_token_hash_key" ON "identity"."phone_codes"("pending_token_hash");

-- CreateIndex
CREATE INDEX "phone_codes_expires_at_idx" ON "identity"."phone_codes"("expires_at");

-- AddForeignKey
ALTER TABLE "identity"."consents" ADD CONSTRAINT "consents_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
