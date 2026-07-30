CREATE TYPE "public"."locker_status" AS ENUM('available', 'occupied');--> statement-breakpoint
CREATE TYPE "public"."package_status" AS ENUM('stored', 'retrieved');--> statement-breakpoint
CREATE TABLE "locker" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"station_id" uuid NOT NULL,
	"size_id" uuid NOT NULL,
	"label" text NOT NULL,
	"status" "locker_status" DEFAULT 'available' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "locker_size" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"rank" integer NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "package" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"customer_id" uuid NOT NULL,
	"size_id" uuid NOT NULL,
	"locker_id" uuid NOT NULL,
	"pickup_code_hash" text NOT NULL,
	"status" "package_status" DEFAULT 'stored' NOT NULL,
	"stored_at" timestamp with time zone NOT NULL,
	"retrieved_at" timestamp with time zone,
	"fee_charged" numeric(12, 2),
	"stored_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fee_tier" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"from_day" integer NOT NULL,
	"to_day" integer,
	"multiplier_hundredths" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pricing_config" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"base_rate_per_day" numeric(12, 2) NOT NULL,
	"currency_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "station" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
--
-- Hand-completed below this line, and the only edited migration in the repo.
--
-- drizzle-kit emits a bare `SET DATA TYPE uuid`, which Postgres refuses on a
-- text column — "column \"id\" cannot be cast automatically to type uuid" —
-- because it will not guess a cast that could fail halfway through a table. The
-- `USING` clause is the missing half, and Drizzle has no way to express it.
--
-- The foreign keys come off first for the same reason: a key cannot span a uuid
-- and a text column, so altering either side while the other still differs
-- fails. They are recreated at the end, identical to how Drizzle declared them.
--
-- BetterAuth's ids were 32-character base62 strings before this migration, and
-- none of them casts to a uuid. This runs against an empty set of auth rows.
--
ALTER TABLE "account" DROP CONSTRAINT "account_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "session" DROP CONSTRAINT "session_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "customer" DROP CONSTRAINT "customer_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();--> statement-breakpoint
ALTER TABLE "customer" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "customer" ALTER COLUMN "created_by" SET DATA TYPE uuid USING "created_by"::uuid;--> statement-breakpoint
ALTER TABLE "customer" ALTER COLUMN "updated_by" SET DATA TYPE uuid USING "updated_by"::uuid;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locker" ADD CONSTRAINT "locker_station_id_station_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."station"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locker" ADD CONSTRAINT "locker_size_id_locker_size_id_fk" FOREIGN KEY ("size_id") REFERENCES "public"."locker_size"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package" ADD CONSTRAINT "package_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package" ADD CONSTRAINT "package_size_id_locker_size_id_fk" FOREIGN KEY ("size_id") REFERENCES "public"."locker_size"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package" ADD CONSTRAINT "package_locker_id_locker_id_fk" FOREIGN KEY ("locker_id") REFERENCES "public"."locker"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package" ADD CONSTRAINT "package_stored_by_user_id_fk" FOREIGN KEY ("stored_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "locker_station_label_unique" ON "locker" USING btree ("station_id","label");--> statement-breakpoint
CREATE INDEX "locker_station_status_idx" ON "locker" USING btree ("station_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "locker_size_code_unique" ON "locker_size" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "locker_size_rank_unique" ON "locker_size" USING btree ("rank");