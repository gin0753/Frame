-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tmdbMovieId" INTEGER NOT NULL,
    "inWatchlist" BOOLEAN NOT NULL DEFAULT false,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isWatched" BOOLEAN NOT NULL DEFAULT false,
    "viewedOn" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LibraryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tmdbMovieId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryEntry_userId_tmdbMovieId_key" ON "LibraryEntry"("userId", "tmdbMovieId");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_userId_tmdbMovieId_key" ON "Rating"("userId", "tmdbMovieId");

-- AddForeignKey
ALTER TABLE "LibraryEntry" ADD CONSTRAINT "LibraryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Settled logical invariants not expressible in Prisma schema syntax.
ALTER TABLE "User" ADD CONSTRAINT "User_email_normalized" CHECK ("email" = lower(btrim("email")) AND length("email") > 0);
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_valid" CHECK ("score" BETWEEN 1 AND 10 AND "tmdbMovieId" > 0);
ALTER TABLE "LibraryEntry" ADD CONSTRAINT "LibraryEntry_movie_positive" CHECK ("tmdbMovieId" > 0);
ALTER TABLE "LibraryEntry" ADD CONSTRAINT "LibraryEntry_viewed_requires_watched" CHECK ("viewedOn" IS NULL OR "isWatched");
