ALTER TABLE "ai_chatbot"."FileUpload" ADD COLUMN "volumePath" text;--> statement-breakpoint
ALTER TABLE "ai_chatbot"."FileUpload" ADD COLUMN "volumeCatalog" text;--> statement-breakpoint
ALTER TABLE "ai_chatbot"."FileUpload" ADD COLUMN "volumeSchema" text;--> statement-breakpoint
ALTER TABLE "ai_chatbot"."FileUpload" ADD COLUMN "volumeName" text;--> statement-breakpoint
ALTER TABLE "ai_chatbot"."FileUpload" ADD COLUMN "storageType" varchar DEFAULT 'memory' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_chatbot"."FileUpload" ADD COLUMN "fileChecksum" text;