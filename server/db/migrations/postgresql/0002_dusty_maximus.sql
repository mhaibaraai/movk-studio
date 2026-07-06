ALTER TABLE "chats" ADD COLUMN "workspace" text DEFAULT 'map' NOT NULL;--> statement-breakpoint
CREATE INDEX "chats_workspace_idx" ON "chats" USING btree ("user_id","workspace");