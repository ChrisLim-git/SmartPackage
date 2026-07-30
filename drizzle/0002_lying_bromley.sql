DROP INDEX "customer_email_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "customer_email_unique" ON "customer" USING btree ("email");