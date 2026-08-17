ALTER TABLE "agents" ADD COLUMN "role" text DEFAULT 'agent' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "birthday" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "last_birthday_broadcast_date" date;