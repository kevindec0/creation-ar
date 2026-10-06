CREATE TYPE "public"."asset_kind" AS ENUM('image', 'video', 'audio', 'model', 'link');--> statement-breakpoint
CREATE TYPE "public"."asset_role" AS ENUM('overlay', 'extra');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'artist');--> statement-breakpoint
CREATE TYPE "public"."work_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_id" integer NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"role" "asset_role" DEFAULT 'extra' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"storage_key" text,
	"url" text,
	"mime" text,
	"size" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"csrf_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'artist' NOT NULL,
	"slug" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_stats" (
	"work_id" integer NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"scans" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "work_stats_work_id_day_pk" PRIMARY KEY("work_id","day")
);
--> statement-breakpoint
CREATE TABLE "works" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"technique" text DEFAULT '' NOT NULL,
	"year" integer,
	"status" "work_status" DEFAULT 'draft' NOT NULL,
	"share_token" text NOT NULL,
	"target_image_key" text NOT NULL,
	"target_mind_key" text NOT NULL,
	"target_width" integer NOT NULL,
	"target_height" integer NOT NULL,
	"feature_points" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_stats" ADD CONSTRAINT "work_stats_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_work_idx" ON "assets" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_slug_idx" ON "users" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "works_share_token_idx" ON "works" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "works_user_idx" ON "works" USING btree ("user_id");