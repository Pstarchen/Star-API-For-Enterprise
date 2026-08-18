CREATE TABLE "OAuthPendingLogin" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "username" TEXT,
    "redirectPath" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT,
    "emailCodeHash" TEXT,
    "emailCodeExpiresAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthPendingLogin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OAuthPendingLogin_tokenHash_key" ON "OAuthPendingLogin"("tokenHash");
CREATE UNIQUE INDEX "OAuthPendingLogin_provider_providerAccountId_key" ON "OAuthPendingLogin"("provider", "providerAccountId");
CREATE INDEX "OAuthPendingLogin_expiresAt_idx" ON "OAuthPendingLogin"("expiresAt");
