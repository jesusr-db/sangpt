CREATE TABLE "ai_chatbot"."Project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text,
	"icon" text,
	"isActive" varchar DEFAULT 'true' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "ai_chatbot"."ProjectContext" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"contextType" varchar NOT NULL,
	"content" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_chatbot"."ProjectFile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"fileId" uuid NOT NULL,
	"addedAt" timestamp DEFAULT now() NOT NULL,
	"addedBy" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_chatbot"."Chat" ADD COLUMN "projectId" uuid;--> statement-breakpoint
ALTER TABLE "ai_chatbot"."ProjectContext" ADD CONSTRAINT "ProjectContext_projectId_Project_id_fk" FOREIGN KEY ("projectId") REFERENCES "ai_chatbot"."Project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chatbot"."ProjectFile" ADD CONSTRAINT "ProjectFile_projectId_Project_id_fk" FOREIGN KEY ("projectId") REFERENCES "ai_chatbot"."Project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chatbot"."ProjectFile" ADD CONSTRAINT "ProjectFile_fileId_FileUpload_id_fk" FOREIGN KEY ("fileId") REFERENCES "ai_chatbot"."FileUpload"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chatbot"."Chat" ADD CONSTRAINT "Chat_projectId_Project_id_fk" FOREIGN KEY ("projectId") REFERENCES "ai_chatbot"."Project"("id") ON DELETE set null ON UPDATE no action;