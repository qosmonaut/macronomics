CREATE TABLE "ingestion_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"query" text,
	"products_upserted" integer DEFAULT 0 NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "product_i18n" (
	"product_uid" text NOT NULL,
	"locale" varchar(2) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "product_i18n_product_uid_locale_pk" PRIMARY KEY("product_uid","locale")
);
--> statement-breakpoint
CREATE TABLE "product_metrics" (
	"product_uid" text PRIMARY KEY NOT NULL,
	"protein_per_100" double precision,
	"protein_per_chf" double precision,
	"protein_per_kcal" double precision,
	"protein_per_carb" double precision,
	"protein_per_fat" double precision
);
--> statement-breakpoint
CREATE TABLE "product_nutrition" (
	"product_uid" text PRIMARY KEY NOT NULL,
	"basis" text NOT NULL,
	"energy_kcal" double precision,
	"protein_g" double precision,
	"carbs_g" double precision,
	"fat_g" double precision,
	"sugars_g" double precision,
	"saturated_fat_g" double precision,
	"fibre_g" double precision,
	"salt_g" double precision
);
--> statement-breakpoint
CREATE TABLE "products" (
	"uid" text PRIMARY KEY NOT NULL,
	"migros_id" text,
	"brand" text,
	"image_url" text,
	"price_chf" double precision,
	"price_per_100" double precision,
	"price_per_100_unit" text,
	"quantity" text,
	"raw" jsonb,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_i18n" ADD CONSTRAINT "product_i18n_product_uid_products_uid_fk" FOREIGN KEY ("product_uid") REFERENCES "public"."products"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_metrics" ADD CONSTRAINT "product_metrics_product_uid_products_uid_fk" FOREIGN KEY ("product_uid") REFERENCES "public"."products"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_nutrition" ADD CONSTRAINT "product_nutrition_product_uid_products_uid_fk" FOREIGN KEY ("product_uid") REFERENCES "public"."products"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_metrics_protein_per_100" ON "product_metrics" USING btree ("protein_per_100");--> statement-breakpoint
CREATE INDEX "idx_metrics_protein_per_chf" ON "product_metrics" USING btree ("protein_per_chf");--> statement-breakpoint
CREATE INDEX "idx_metrics_protein_per_kcal" ON "product_metrics" USING btree ("protein_per_kcal");--> statement-breakpoint
CREATE INDEX "idx_metrics_protein_per_carb" ON "product_metrics" USING btree ("protein_per_carb");--> statement-breakpoint
CREATE INDEX "idx_metrics_protein_per_fat" ON "product_metrics" USING btree ("protein_per_fat");