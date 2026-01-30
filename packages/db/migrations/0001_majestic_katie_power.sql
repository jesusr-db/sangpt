CREATE TABLE "ai_chatbot"."ChatContext" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chatId" uuid NOT NULL,
	"fileId" uuid,
	"contextType" varchar NOT NULL,
	"content" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_chatbot"."FileUpload" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chatId" uuid NOT NULL,
	"userId" text NOT NULL,
	"filename" text NOT NULL,
	"contentType" text NOT NULL,
	"fileSize" integer NOT NULL,
	"storagePath" text,
	"extractedContent" text,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_chatbot"."ChatContext" ADD CONSTRAINT "ChatContext_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "ai_chatbot"."Chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chatbot"."ChatContext" ADD CONSTRAINT "ChatContext_fileId_FileUpload_id_fk" FOREIGN KEY ("fileId") REFERENCES "ai_chatbot"."FileUpload"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chatbot"."FileUpload" ADD CONSTRAINT "FileUpload_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "ai_chatbot"."Chat"("id") ON DELETE cascade ON UPDATE no action;