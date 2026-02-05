import { n as isDatabaseAvailable } from "./connection-pool-Bhce9fke.mjs";
import { r as getHostUrl } from "./src-BaHhVWSg.mjs";
import { i as getCachedCliHost, o as getDatabricksToken, r as getAuthSession, t as getAuthMethod } from "./src-pe6ovBD5.mjs";
import { A as updateChatLastContextById, C as getProjectFiles, D as saveChat, E as removeFileFromProject, F as generateUUID, I as ChatSDKError, M as updateProject, N as updateProjectContext, O as saveFileUpload, P as convertToUIMessages, S as getProjectContexts, T as removeChatFromProject, _ as getFileUploadById, a as addChatToProject, b as getMessagesByChatId, c as createProject, d as deleteMessagesByChatIdAfterTimestamp, f as deleteProject, g as getChatsByUserId, h as getChatsByProjectId, i as checkChatAccess, j as updateChatVisiblityById, k as saveMessages, l as deleteChatById, m as getChatById, n as postRequestBodySchema, o as addFileToProject, p as deleteProjectContext, r as StreamCache, s as addProjectContext, t as myProvider, u as deleteFileUpload, v as getFileUploadsByChatId, w as getProjectsByUserId, x as getProjectById, y as getMessageById } from "./src-CPfaeN6Y.mjs";
import "./src-CqvC4Bjf.mjs";
import { a as getDefaultFoundationModel, i as FOUNDATION_MODELS } from "./src-C4zvqxEt.mjs";
import { createRequire } from "node:module";
import dotenv from "dotenv";
import * as path$1 from "node:path";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express, { Router } from "express";
import cors from "cors";
import { convertToModelMessages, createUIMessageStream, generateText, pipeUIMessageStreamToResponse, streamText } from "ai";
import { z } from "zod";
import * as fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { DATABRICKS_TOOL_CALL_ID, DATABRICKS_TOOL_DEFINITION, extractApprovalStatus } from "@databricks/ai-sdk-provider";
import fileUpload from "express-fileupload";
import * as os from "node:os";

//#region src/env.ts
const __filename = fileURLToPath(import.meta.url);
const __dirname$1 = path.dirname(__filename);
if (!process.env.TEST_MODE) dotenv.config({ path: path.resolve(__dirname$1, "../..", ".env") });

//#endregion
//#region src/middleware/auth.ts
/**
* Middleware to authenticate requests and attach session to request object
*/
async function authMiddleware(req, _res, next) {
	try {
		req.session = await getAuthSession({ getRequestHeader: (name) => req.headers[name.toLowerCase()] }) || void 0;
		next();
	} catch (error) {
		console.error("Auth middleware error:", error);
		next(error);
	}
}
/**
* Middleware to require authentication - returns 401 if no session
*/
function requireAuth(req, res, next) {
	if (!req.session?.user) {
		const response = new ChatSDKError("unauthorized:chat").toResponse();
		return res.status(response.status).json(response.json);
	}
	next();
}
async function requireChatAccess(req, res, next) {
	const { id } = req.params;
	if (!id) {
		console.error("Chat access middleware error: no chat ID provided", req.params);
		const response = new ChatSDKError("bad_request:api").toResponse();
		return res.status(response.status).json(response.json);
	}
	const { allowed, reason } = await checkChatAccess(id, req.session?.user.id);
	if (!allowed) {
		console.error("Chat access middleware error: user does not have access to chat", reason);
		const response = new ChatSDKError("forbidden:chat", reason).toResponse();
		return res.status(response.status).json(response.json);
	}
	next();
}

//#endregion
//#region src/services/file-processor.ts
const pdfParse = createRequire(import.meta.url)("pdf-parse");
var FileProcessor = class FileProcessor {
	static MAX_FILE_SIZE = 10 * 1024 * 1024;
	static ALLOWED_EXTENSIONS = [
		".txt",
		".md",
		".py",
		".js",
		".jsx",
		".ts",
		".tsx",
		".json",
		".csv",
		".jpg",
		".jpeg",
		".png",
		".pdf",
		".docx"
	];
	/**
	* Process an uploaded file and extract its content
	*/
	static async processFile(filePath, originalName, mimeType) {
		const fileExtension = path$1.extname(originalName).toLowerCase();
		if (!FileProcessor.ALLOWED_EXTENSIONS.includes(fileExtension)) throw new Error(`File type ${fileExtension} is not supported`);
		const stats = await fs.stat(filePath);
		if (stats.size > FileProcessor.MAX_FILE_SIZE) throw new Error(`File size exceeds maximum allowed size of ${FileProcessor.MAX_FILE_SIZE / 1024 / 1024}MB`);
		let extractedContent = "";
		const metadata = {
			extension: fileExtension,
			originalSize: stats.size,
			processedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		let base64Content;
		switch (fileExtension) {
			case ".txt":
			case ".md":
			case ".py":
			case ".js":
			case ".jsx":
			case ".ts":
			case ".tsx":
			case ".json":
			case ".csv":
				extractedContent = await fs.readFile(filePath, "utf-8");
				metadata.lineCount = extractedContent.split("\n").length;
				break;
			case ".jpg":
			case ".jpeg":
			case ".png":
				base64Content = (await fs.readFile(filePath)).toString("base64");
				extractedContent = `[Image: ${originalName}]`;
				metadata.isImage = true;
				metadata.base64Size = base64Content.length;
				break;
			case ".pdf":
				try {
					const pdfData = await pdfParse(await fs.readFile(filePath));
					metadata.isPDF = true;
					metadata.pageCount = pdfData.numpages;
					metadata.pdfInfo = pdfData.info;
					const text = pdfData.text?.trim() || "";
					if (text.length > 0) extractedContent = text;
					else {
						extractedContent = `[PDF File: ${originalName}]\n\nNote: This PDF appears to be scanned or image-based. No text content could be extracted. The document has ${pdfData.numpages} page(s).`;
						metadata.isScannedPDF = true;
						metadata.warning = "PDF appears to be scanned/image-based with no extractable text";
					}
				} catch (error) {
					console.error("Error processing PDF:", error);
					const errorMessage = error instanceof Error ? error.message : "Unknown error";
					extractedContent = `[PDF File: ${originalName} - Content extraction failed: ${errorMessage}]`;
					metadata.isPDF = true;
					metadata.error = errorMessage;
				}
				break;
			case ".docx":
				try {
					extractedContent = `[Word Document: ${originalName}]`;
					metadata.isDocx = true;
					try {
						const mammothModule = await import("mammoth").catch(() => null);
						if (mammothModule) {
							const result = await mammothModule.extractRawText({ path: filePath });
							if (result?.value) {
								extractedContent = result.value;
								metadata.messages = result.messages;
							}
						}
					} catch (_parseError) {
						console.log("DOCX parsing unavailable, using placeholder content");
						metadata.note = "Word document text extraction is temporarily disabled. File stored successfully.";
					}
				} catch (error) {
					console.error("Error processing DOCX:", error);
					extractedContent = `[Word Document: ${originalName} - Content extraction failed]`;
					metadata.isDocx = true;
					metadata.error = "Content extraction failed";
				}
				break;
			default: throw new Error(`Unsupported file type: ${fileExtension}`);
		}
		return {
			filename: originalName,
			contentType: mimeType,
			fileSize: stats.size,
			extractedContent,
			metadata,
			base64Content
		};
	}
	/**
	* Truncate content to fit within token limits
	*/
	static truncateContent(content, maxLength = 1e4) {
		if (content.length <= maxLength) return content;
		return `${content.substring(0, maxLength)}\n\n[Content truncated...]`;
	}
	/**
	* Prepare file content for inclusion in chat context
	*/
	static formatForContext(file) {
		const filename = "filename" in file ? file.filename : file.filename;
		const content = "extractedContent" in file ? file.extractedContent : "";
		return `File: ${filename}\n---\n${FileProcessor.truncateContent(content)}\n---`;
	}
	/**
	* Check if file type supports vision models
	*/
	static isImageFile(filename) {
		const ext = path$1.extname(filename).toLowerCase();
		return [
			".jpg",
			".jpeg",
			".png"
		].includes(ext);
	}
	/**
	* Convert a ProcessedFile to AI SDK content parts for multimodal models.
	* Images with base64 data are returned as image parts for vision models.
	* All other files are returned as text parts with their extracted content.
	*/
	static toContentParts(file) {
		if (FileProcessor.isImageFile(file.filename) && file.base64Content) return [{
			type: "file",
			data: `data:${file.contentType};base64,${file.base64Content}`,
			mediaType: file.contentType
		}];
		return [{
			type: "text",
			text: `File: ${file.filename}\n---\n${FileProcessor.truncateContent(file.extractedContent)}\n---`
		}];
	}
	/**
	* Clean up temporary file
	*/
	static async cleanupTempFile(filePath) {
		try {
			await fs.unlink(filePath);
		} catch (error) {
			console.error("Failed to cleanup temp file:", error);
		}
	}
};

//#endregion
//#region src/services/volume-storage.ts
/**
* Databricks Volume Storage Service
*
* Handles file storage in Databricks Unity Catalog Volumes using the Files API.
* Volumes provide persistent, scalable storage for chat file attachments.
*/
/**
* Get volume configuration from environment variables
*/
function getVolumeConfig() {
	const catalog = process.env.VOLUME_CATALOG;
	const schema = process.env.VOLUME_SCHEMA;
	const volume = process.env.VOLUME_NAME;
	if (!catalog || !schema || !volume) return null;
	return {
		catalog,
		schema,
		volume
	};
}
/**
* Check if volume storage is configured and available
*/
function isVolumeStorageAvailable() {
	return getVolumeConfig() !== null;
}
/**
* Get the Databricks host URL for API calls
*/
function getDatabricksHostUrl() {
	if (getAuthMethod() === "cli") {
		const cachedHost = getCachedCliHost();
		if (cachedHost) return cachedHost;
	}
	return getHostUrl();
}
/**
* Build the volume path for a file using the hierarchical directory structure:
*
* /Volumes/{catalog}/{schema}/{volume}/
* ├── users/
* │   └── {userId}/
* │       ├── chats/
* │       │   └── {chatId}/
* │       │       └── {fileId}/
* │       │           └── {filename}
* │       └── orphan-files/           # Files not yet associated with a chat
* │           └── {fileId}/
* │               └── {filename}
* ├── projects/
* │   └── {projectId}/
* │       └── files/
* │           └── {fileId}/
* │               └── {filename}
* └── shared/
*     └── templates/                  # Future: org-wide templates
*/
function buildVolumePath(config, options, filename) {
	const { chatId, projectId, userId, fileId } = options;
	const base = `/Volumes/${config.catalog}/${config.schema}/${config.volume}`;
	if (projectId) return `${base}/projects/${projectId}/files/${fileId}/${filename}`;
	if (chatId && userId) return `${base}/users/${userId}/chats/${chatId}/${fileId}/${filename}`;
	if (chatId) return `${base}/chats/${chatId}/files/${fileId}/${filename}`;
	if (userId) return `${base}/users/${userId}/orphan-files/${fileId}/${filename}`;
	return `${base}/temp/${fileId}/${filename}`;
}
/**
* Calculate SHA-256 checksum for integrity verification
*/
function calculateChecksum(buffer) {
	return createHash("sha256").update(buffer).digest("hex");
}
/**
* Databricks Volume Storage class
*/
var DatabricksVolumeStorage = class {
	config;
	constructor() {
		const config = getVolumeConfig();
		if (!config) throw new Error("Volume storage not configured. Set VOLUME_CATALOG, VOLUME_SCHEMA, and VOLUME_NAME environment variables.");
		this.config = config;
	}
	/**
	* Upload a file to Databricks Volume
	*/
	async uploadFile(buffer, filename, options) {
		const volumePath = buildVolumePath(this.config, options, filename);
		const checksum = calculateChecksum(buffer);
		const hostUrl = getDatabricksHostUrl();
		const token = await getDatabricksToken();
		const url = `${hostUrl}/api/2.0/fs/files/Volumes/${volumePath.replace("/Volumes/", "")}?overwrite=true`;
		console.log(`[VolumeStorage] Uploading file to: ${volumePath}`);
		const response = await fetch(url, {
			method: "PUT",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/octet-stream"
			},
			body: buffer
		});
		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Failed to upload file to volume: ${response.status} ${errorText}`);
		}
		console.log(`[VolumeStorage] File uploaded successfully: ${volumePath} (${buffer.length} bytes)`);
		return {
			volumePath,
			volumeCatalog: this.config.catalog,
			volumeSchema: this.config.schema,
			volumeName: this.config.volume,
			checksum
		};
	}
	/**
	* Download a file from Databricks Volume
	*/
	async downloadFile(volumePath) {
		const hostUrl = getDatabricksHostUrl();
		const token = await getDatabricksToken();
		const url = `${hostUrl}/api/2.0/fs/files/Volumes/${volumePath.replace("/Volumes/", "")}`;
		console.log(`[VolumeStorage] Downloading file from: ${volumePath}`);
		const response = await fetch(url, {
			method: "GET",
			headers: { Authorization: `Bearer ${token}` }
		});
		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Failed to download file from volume: ${response.status} ${errorText}`);
		}
		const arrayBuffer = await response.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		console.log(`[VolumeStorage] File downloaded successfully: ${volumePath} (${buffer.length} bytes)`);
		return buffer;
	}
	/**
	* Delete a file from Databricks Volume
	*/
	async deleteFile(volumePath) {
		const hostUrl = getDatabricksHostUrl();
		const token = await getDatabricksToken();
		const url = `${hostUrl}/api/2.0/fs/files/Volumes/${volumePath.replace("/Volumes/", "")}`;
		console.log(`[VolumeStorage] Deleting file: ${volumePath}`);
		const response = await fetch(url, {
			method: "DELETE",
			headers: { Authorization: `Bearer ${token}` }
		});
		if (!response.ok) {
			const errorText = await response.text();
			if (response.status !== 404) throw new Error(`Failed to delete file from volume: ${response.status} ${errorText}`);
		}
		console.log(`[VolumeStorage] File deleted successfully: ${volumePath}`);
	}
	/**
	* Check if a file exists in the Volume
	*/
	async fileExists(volumePath) {
		const hostUrl = getDatabricksHostUrl();
		const token = await getDatabricksToken();
		const url = `${hostUrl}/api/2.0/fs/files/Volumes/${volumePath.replace("/Volumes/", "")}`;
		try {
			return (await fetch(url, {
				method: "HEAD",
				headers: { Authorization: `Bearer ${token}` }
			})).ok;
		} catch {
			return false;
		}
	}
	/**
	* Get the volume configuration
	*/
	getConfig() {
		return { ...this.config };
	}
};
/**
* Get a singleton instance of the volume storage
* Returns null if volume storage is not configured
*/
let volumeStorageInstance = null;
function getVolumeStorage() {
	if (!isVolumeStorageAvailable()) return null;
	if (!volumeStorageInstance) try {
		volumeStorageInstance = new DatabricksVolumeStorage();
	} catch (error) {
		console.warn("[VolumeStorage] Failed to initialize:", error);
		return null;
	}
	return volumeStorageInstance;
}

//#endregion
//#region src/services/session-memory.ts
/**
* Manages in-memory session storage for uploaded files
*/
var SessionMemory = class SessionMemory {
	static instance;
	sessions = /* @__PURE__ */ new Map();
	SESSION_TTL_MS = 1440 * 60 * 1e3;
	cleanupInterval = null;
	constructor() {
		this.startCleanupInterval();
	}
	static getInstance() {
		if (!SessionMemory.instance) SessionMemory.instance = new SessionMemory();
		return SessionMemory.instance;
	}
	/**
	* Add a file to a session
	*/
	addFile(chatId, userId, fileId, file) {
		let session = this.sessions.get(chatId);
		if (!session) {
			session = {
				files: /* @__PURE__ */ new Map(),
				lastActivity: /* @__PURE__ */ new Date()
			};
			this.sessions.set(chatId, session);
		}
		session.files.set(fileId, {
			id: fileId,
			chatId,
			userId,
			file,
			uploadedAt: /* @__PURE__ */ new Date()
		});
		session.lastActivity = /* @__PURE__ */ new Date();
	}
	/**
	* Get all files for a chat session
	*/
	getSessionFiles(chatId) {
		const session = this.sessions.get(chatId);
		if (!session) return [];
		session.lastActivity = /* @__PURE__ */ new Date();
		return Array.from(session.files.values());
	}
	/**
	* Get a specific file from a session
	*/
	getFile(chatId, fileId) {
		const session = this.sessions.get(chatId);
		if (!session) return;
		session.lastActivity = /* @__PURE__ */ new Date();
		return session.files.get(fileId);
	}
	/**
	* Remove a file from a session
	*/
	removeFile(chatId, fileId) {
		const session = this.sessions.get(chatId);
		if (!session) return false;
		const deleted = session.files.delete(fileId);
		session.lastActivity = /* @__PURE__ */ new Date();
		if (session.files.size === 0) this.sessions.delete(chatId);
		return deleted;
	}
	/**
	* Clear all files for a session
	*/
	clearSession(chatId) {
		this.sessions.delete(chatId);
	}
	/**
	* Get context string for all files in a session
	*/
	getContextString(chatId, maxFiles = 10) {
		const files = this.getSessionFiles(chatId);
		if (files.length === 0) return "";
		const contextParts = files.slice(0, maxFiles).map((sf) => FileProcessor.formatForContext(sf.file));
		if (files.length > maxFiles) contextParts.push(`\n[${files.length - maxFiles} additional files not shown]`);
		return contextParts.join("\n\n");
	}
	/**
	* Find files by name pattern in a session
	*/
	findFilesByName(chatId, pattern) {
		const files = this.getSessionFiles(chatId);
		const regex = new RegExp(pattern, "i");
		return files.filter((sf) => regex.test(sf.file.filename));
	}
	/**
	* Get files that contain specific content
	*/
	searchFilesContent(chatId, searchTerm) {
		const files = this.getSessionFiles(chatId);
		const regex = new RegExp(searchTerm, "i");
		return files.filter((sf) => regex.test(sf.file.extractedContent) || regex.test(sf.file.filename));
	}
	/**
	* Clean up expired sessions
	*/
	cleanupExpiredSessions() {
		const now = /* @__PURE__ */ new Date();
		const expired = [];
		for (const [chatId, session] of this.sessions.entries()) if (now.getTime() - session.lastActivity.getTime() > this.SESSION_TTL_MS) expired.push(chatId);
		for (const chatId of expired) {
			console.log(`Cleaning up expired session: ${chatId}`);
			this.sessions.delete(chatId);
		}
	}
	/**
	* Start periodic cleanup of expired sessions
	*/
	startCleanupInterval() {
		this.cleanupInterval = setInterval(() => {
			this.cleanupExpiredSessions();
		}, 3600 * 1e3);
	}
	/**
	* Stop the cleanup interval (for graceful shutdown)
	*/
	stopCleanup() {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
	}
	/**
	* Get session statistics
	*/
	getStats() {
		let totalFiles = 0;
		let oldestSession = null;
		for (const session of this.sessions.values()) {
			totalFiles += session.files.size;
			if (!oldestSession || session.lastActivity < oldestSession) oldestSession = session.lastActivity;
		}
		return {
			totalSessions: this.sessions.size,
			totalFiles,
			oldestSession
		};
	}
};

//#endregion
//#region src/services/project-session-memory.ts
/**
* Extends SessionMemory to support project-level file storage and context inheritance
*/
var ProjectSessionMemory = class ProjectSessionMemory extends SessionMemory {
	static projectInstance;
	projectContexts = /* @__PURE__ */ new Map();
	chatToProject = /* @__PURE__ */ new Map();
	constructor() {
		super();
	}
	static getInstance() {
		if (!ProjectSessionMemory.projectInstance) ProjectSessionMemory.projectInstance = new ProjectSessionMemory();
		return ProjectSessionMemory.projectInstance;
	}
	/**
	* Initialize a chat with project context
	*/
	initializeChatWithProject(chatId, projectId) {
		this.chatToProject.set(chatId, projectId);
		const projectContext = this.projectContexts.get(projectId);
		if (projectContext) for (const [_fileId, _file] of projectContext.files);
	}
	/**
	* Add a file to a project (shared across all project chats)
	*/
	addProjectFile(projectId, fileId, file) {
		let context = this.projectContexts.get(projectId);
		if (!context) {
			context = {
				files: /* @__PURE__ */ new Map(),
				instructions: [],
				lastActivity: /* @__PURE__ */ new Date()
			};
			this.projectContexts.set(projectId, context);
		}
		context.files.set(fileId, file);
		context.lastActivity = /* @__PURE__ */ new Date();
	}
	/**
	* Get all files for a project
	*/
	getProjectFiles(projectId) {
		const context = this.projectContexts.get(projectId);
		if (!context) return [];
		context.lastActivity = /* @__PURE__ */ new Date();
		return Array.from(context.files.values());
	}
	/**
	* Remove a file from a project
	*/
	removeProjectFile(projectId, fileId) {
		const context = this.projectContexts.get(projectId);
		if (!context) return false;
		const deleted = context.files.delete(fileId);
		context.lastActivity = /* @__PURE__ */ new Date();
		if (context.files.size === 0 && context.instructions.length === 0) this.projectContexts.delete(projectId);
		return deleted;
	}
	/**
	* Add project instructions/context
	*/
	addProjectInstructions(projectId, instructions) {
		let context = this.projectContexts.get(projectId);
		if (!context) {
			context = {
				files: /* @__PURE__ */ new Map(),
				instructions: [],
				lastActivity: /* @__PURE__ */ new Date()
			};
			this.projectContexts.set(projectId, context);
		}
		context.instructions.push(instructions);
		context.lastActivity = /* @__PURE__ */ new Date();
	}
	/**
	* Get project instructions
	*/
	getProjectInstructions(projectId) {
		return this.projectContexts.get(projectId)?.instructions || [];
	}
	/**
	* Clear project instructions
	*/
	clearProjectInstructions(projectId) {
		const context = this.projectContexts.get(projectId);
		if (context) {
			context.instructions = [];
			context.lastActivity = /* @__PURE__ */ new Date();
		}
	}
	/**
	* Get context string for a chat, including inherited project context
	*/
	getContextString(chatId, maxFiles = 10) {
		const contextParts = [];
		const projectId = this.chatToProject.get(chatId);
		if (projectId) {
			const projectFiles = this.getProjectFiles(projectId);
			if (projectFiles.length > 0) {
				contextParts.push("=== Project Files ===");
				const limitedProjectFiles = projectFiles.slice(0, Math.floor(maxFiles / 2));
				for (const file of limitedProjectFiles) contextParts.push(this.formatFileForContext(file));
				if (projectFiles.length > limitedProjectFiles.length) contextParts.push(`[${projectFiles.length - limitedProjectFiles.length} additional project files not shown]`);
			}
		}
		const chatFiles = this.getSessionFiles(chatId);
		if (chatFiles.length > 0) {
			if (contextParts.length > 0) contextParts.push("\n=== Chat Files ===");
			const remainingSlots = maxFiles - (contextParts.length > 0 ? Math.floor(maxFiles / 2) : 0);
			const limitedChatFiles = chatFiles.slice(0, remainingSlots);
			for (const sf of limitedChatFiles) contextParts.push(this.formatFileForContext(sf.file));
			if (chatFiles.length > limitedChatFiles.length) contextParts.push(`[${chatFiles.length - limitedChatFiles.length} additional chat files not shown]`);
		}
		return contextParts.join("\n\n");
	}
	/**
	* Get all files for a chat as AI SDK content parts (for multimodal models).
	* Returns both project files and chat-specific files as content parts.
	* Images are returned as image parts, other files as text parts.
	*/
	getFilesAsContentParts(chatId) {
		const contentParts = [];
		const projectId = this.chatToProject.get(chatId);
		if (projectId) {
			const projectFiles = this.getProjectFiles(projectId);
			for (const file of projectFiles) contentParts.push(...FileProcessor.toContentParts(file));
		}
		const chatFiles = this.getSessionFiles(chatId);
		for (const sf of chatFiles) contentParts.push(...FileProcessor.toContentParts(sf.file));
		return contentParts;
	}
	/**
	* Format a file for context inclusion
	*/
	formatFileForContext(file) {
		const parts = [];
		parts.push(`File: ${file.filename}`);
		parts.push(`Type: ${file.contentType}`);
		parts.push(`Size: ${file.fileSize} bytes`);
		if (file.extractedContent) {
			const maxContentLength = 5e3;
			let content = file.extractedContent;
			if (content.length > maxContentLength) content = `${content.substring(0, maxContentLength)}...[truncated]`;
			parts.push(`Content:\n${content}`);
		}
		return parts.join("\n");
	}
	/**
	* Search for files across both project and chat contexts
	*/
	searchAllFiles(chatId, searchTerm) {
		const results = [];
		const regex = new RegExp(searchTerm, "i");
		const projectId = this.chatToProject.get(chatId);
		if (projectId) {
			const projectFiles = this.getProjectFiles(projectId);
			for (const file of projectFiles) if (regex.test(file.extractedContent) || regex.test(file.filename)) results.push(file);
		}
		const chatFiles = this.searchFilesContent(chatId, searchTerm);
		for (const sf of chatFiles) results.push(sf.file);
		return results;
	}
	/**
	* Clear all project context
	*/
	clearProjectContext(projectId) {
		this.projectContexts.delete(projectId);
		const affectedChats = [];
		for (const [chatId, pid] of this.chatToProject.entries()) if (pid === projectId) affectedChats.push(chatId);
		for (const chatId of affectedChats) this.chatToProject.delete(chatId);
	}
	/**
	* Get comprehensive statistics including project data
	*/
	getExtendedStats() {
		const baseStats = this.getStats();
		let totalProjectFiles = 0;
		for (const context of this.projectContexts.values()) totalProjectFiles += context.files.size;
		return {
			...baseStats,
			totalProjects: this.projectContexts.size,
			totalProjectFiles
		};
	}
	/**
	* Add a ProcessedFile directly to chat context (for backward compatibility)
	*/
	addContext(chatId, file) {
		const fileId = file.id || `temp-${Date.now()}`;
		this.addFile(chatId, "system", fileId, file);
	}
};

//#endregion
//#region src/routes/chat.ts
const chatRouter = Router();
const streamCache = new StreamCache();
const sessionMemory$2 = ProjectSessionMemory.getInstance();
chatRouter.use(authMiddleware);
/**
* POST /api/chat - Send a message and get streaming response
*
* Note: Works in ephemeral mode when database is disabled.
* Streaming continues normally, but no chat/message persistence occurs.
*/
chatRouter.post("/", requireAuth, async (req, res) => {
	const dbAvailable = isDatabaseAvailable();
	if (!dbAvailable) console.log("[Chat] Running in ephemeral mode - no persistence");
	console.log(`CHAT POST REQUEST ${Date.now()}`);
	let requestBody;
	try {
		requestBody = postRequestBodySchema.parse(req.body);
	} catch (_) {
		console.error("Error parsing request body:", _);
		const response = new ChatSDKError("bad_request:api").toResponse();
		return res.status(response.status).json(response.json);
	}
	try {
		const { id, message, selectedChatModel, selectedVisibilityType, projectId } = requestBody;
		const session = req.session;
		if (!session) {
			const response = new ChatSDKError("unauthorized:chat").toResponse();
			return res.status(response.status).json(response.json);
		}
		const { chat, allowed, reason } = await checkChatAccess(id, session?.user.id);
		if (reason !== "not_found" && !allowed) {
			const response = new ChatSDKError("forbidden:chat").toResponse();
			return res.status(response.status).json(response.json);
		}
		if (!chat) {
			if (isDatabaseAvailable() && message) {
				const title = await generateTitleFromUserMessage({ message });
				await saveChat({
					id,
					userId: session.user.id,
					title,
					visibility: selectedVisibilityType,
					projectId
				});
			}
		} else if (chat.userId !== session.user.id) {
			const response = new ChatSDKError("forbidden:chat").toResponse();
			return res.status(response.status).json(response.json);
		}
		const messagesFromDb = await getMessagesByChatId({ id });
		const previousMessages = !dbAvailable || !message && requestBody.previousMessages ? requestBody.previousMessages ?? [] : convertToUIMessages(messagesFromDb);
		let uiMessages;
		if (message) {
			uiMessages = [...previousMessages, message];
			await saveMessages({ messages: [{
				chatId: id,
				id: message.id,
				role: "user",
				parts: message.parts,
				attachments: [],
				createdAt: /* @__PURE__ */ new Date()
			}] });
		} else {
			uiMessages = previousMessages;
			if (dbAvailable && requestBody.previousMessages) {
				const assistantMessages = requestBody.previousMessages.filter((m) => m.role === "assistant");
				if (assistantMessages.length > 0) {
					await saveMessages({ messages: assistantMessages.map((m) => ({
						chatId: id,
						id: m.id,
						role: m.role,
						parts: m.parts,
						attachments: [],
						createdAt: m.metadata?.createdAt ? new Date(m.metadata.createdAt) : /* @__PURE__ */ new Date()
					})) });
					const lastPart = assistantMessages.at(-1)?.parts?.at(-1);
					if ((lastPart?.type === "tool-databricks-tool-call" && lastPart.output ? extractApprovalStatus(lastPart.output) : void 0) === false) {
						res.end();
						return;
					}
				}
			}
		}
		streamCache.clearActiveStream(id);
		let finalUsage;
		const streamId = generateUUID();
		sessionMemory$2.getContextString(id);
		let projectContext = null;
		let projectFileContext = null;
		if (chat?.projectId) try {
			sessionMemory$2.initializeChatWithProject(id, chat.projectId);
			const contexts = await getProjectContexts({ projectId: chat.projectId });
			if (contexts.length > 0) {
				projectContext = contexts.map((ctx) => `[${ctx.contextType}]: ${ctx.content}`).join("\n\n");
				for (const ctx of contexts) sessionMemory$2.addProjectInstructions(chat.projectId, ctx.content);
			}
			const projectFiles = await getProjectFiles({ projectId: chat.projectId });
			if (projectFiles.length > 0) {
				for (const file of projectFiles) sessionMemory$2.addProjectFile(chat.projectId, file.id, {
					id: file.id,
					filename: file.filename,
					contentType: file.contentType,
					fileSize: file.fileSize,
					extractedContent: file.extractedContent || "",
					metadata: file.metadata || {},
					createdAt: file.createdAt
				});
				projectFileContext = projectFiles.map((f) => `- ${f.filename} (${f.contentType}, ${f.fileSize} bytes)`).join("\n");
			}
		} catch (error) {
			console.warn("Failed to fetch project context:", error);
		}
		let messagesForModel = convertToModelMessages(uiMessages);
		const systemMessages = [];
		if (projectContext) systemMessages.push({
			role: "system",
			content: `Project Context and Instructions:\n\n${projectContext}`
		});
		if (isDatabaseAvailable()) try {
			const dbFiles = await getFileUploadsByChatId({ chatId: id });
			const sessionFiles = sessionMemory$2.getSessionFiles(id);
			const sessionFileIds = new Set(sessionFiles.map((sf) => sf.id));
			for (const dbFile of dbFiles) {
				if (sessionFileIds.has(dbFile.id)) continue;
				let base64Content;
				if (FileProcessor.isImageFile(dbFile.filename) && dbFile.storageType === "volume" && dbFile.volumePath) {
					const volumeStorage = getVolumeStorage();
					if (volumeStorage) try {
						base64Content = (await volumeStorage.downloadFile(dbFile.volumePath)).toString("base64");
						console.log(`[Chat] Loaded image from Volume: ${dbFile.filename}`);
					} catch (volumeErr) {
						console.warn(`[Chat] Failed to load image from Volume: ${dbFile.volumePath}`, volumeErr);
					}
				}
				sessionMemory$2.addFile(id, dbFile.userId, dbFile.id, {
					filename: dbFile.filename,
					contentType: dbFile.contentType,
					fileSize: dbFile.fileSize,
					extractedContent: dbFile.extractedContent || "",
					metadata: dbFile.metadata || {},
					base64Content
				});
			}
		} catch (err) {
			console.warn("[Chat] Failed to load files from database:", err);
		}
		console.log(`[Chat] Looking up files for chatId: ${id}`);
		const fileContentParts = sessionMemory$2.getFilesAsContentParts(id);
		const imageContentParts = fileContentParts.filter((p) => p.type === "file" && p.mediaType?.startsWith("image/"));
		const _textContentParts = fileContentParts.filter((p) => p.type === "text");
		const hasImages = imageContentParts.length > 0;
		const imageFiles = sessionMemory$2.getSessionFiles(id).filter((sf) => FileProcessor.isImageFile(sf.file.filename));
		if (imageFiles.length > 0) {
			console.log(`[Chat] Found ${imageFiles.length} image file(s) in session:`, imageFiles.map((sf) => ({
				filename: sf.file.filename,
				hasBase64: !!sf.file.base64Content,
				base64Length: sf.file.base64Content?.length || 0,
				contentType: sf.file.contentType
			})));
			console.log(`[Chat] Converted to ${imageContentParts.length} image part(s) and ${_textContentParts.length} text part(s)`);
		}
		if (hasImages) systemMessages.push({
			role: "system",
			content: "When analyzing images containing text, carefully extract and transcribe all visible text content. Pay close attention to small text, headers, labels, and UI elements. If text is unclear, describe what you can see."
		});
		const allFileContext = sessionMemory$2.getContextString(id);
		if (allFileContext || projectFileContext) {
			let fileMessage = "You have access to the following files:\n\n";
			if (projectFileContext) fileMessage += `Project Files:\n${projectFileContext}\n\n`;
			if (allFileContext) fileMessage += `Chat Files:\n${allFileContext}`;
			fileMessage += "\n\nYou can reference these files by name when responding to user queries.";
			systemMessages.push({
				role: "system",
				content: fileMessage
			});
		}
		if (systemMessages.length > 0) messagesForModel = [...systemMessages, ...messagesForModel];
		if (hasImages) {
			const lastUserMsgIndex = messagesForModel.findLastIndex((m) => m.role === "user");
			if (lastUserMsgIndex !== -1) {
				const lastUserMsg = messagesForModel[lastUserMsgIndex];
				const currentContent = lastUserMsg.content;
				const existingContent = typeof currentContent === "string" ? [{
					type: "text",
					text: currentContent
				}] : Array.isArray(currentContent) ? currentContent : [];
				messagesForModel[lastUserMsgIndex] = {
					...lastUserMsg,
					content: [...imageContentParts, ...existingContent]
				};
				console.log(`[Chat] Injected ${imageContentParts.length} image(s) into user message for vision model`);
				const injectedContent = messagesForModel[lastUserMsgIndex].content;
				console.log("[Chat] User message content after injection:", {
					contentType: typeof injectedContent,
					isArray: Array.isArray(injectedContent),
					partCount: Array.isArray(injectedContent) ? injectedContent.length : "N/A",
					partTypes: Array.isArray(injectedContent) ? injectedContent.map((p) => p.type) : "N/A"
				});
			}
		}
		console.log("[Chat] Messages for model (before streamText):");
		for (const msg of messagesForModel) {
			const content = msg.content;
			if (Array.isArray(content)) {
				console.log(`  ${msg.role}: ${content.length} parts - types: ${content.map((p) => p.type).join(", ")}`);
				for (const part of content) if (part.type === "file") console.log(`    file part: mediaType=${part.mediaType}, dataLength=${part.data?.length || 0}`);
			} else console.log(`  ${msg.role}: string content (${typeof content})`);
		}
		const result = streamText({
			model: await myProvider.languageModel(selectedChatModel),
			messages: messagesForModel,
			onFinish: ({ usage }) => {
				finalUsage = usage;
			},
			tools: { [DATABRICKS_TOOL_CALL_ID]: DATABRICKS_TOOL_DEFINITION }
		});
		pipeUIMessageStreamToResponse({
			stream: createUIMessageStream({
				execute: async ({ writer }) => {
					writer.merge(result.toUIMessageStream({
						originalMessages: uiMessages,
						generateMessageId: generateUUID,
						sendReasoning: true,
						sendSources: true,
						onError: (error) => {
							console.error("Stream error:", error);
							const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
							writer.write({
								type: "data-error",
								data: errorMessage
							});
							return errorMessage;
						}
					}));
				},
				onFinish: async ({ responseMessage }) => {
					console.log("Finished message stream! Saving message...", JSON.stringify(responseMessage, null, 2));
					await saveMessages({ messages: [{
						id: responseMessage.id,
						role: responseMessage.role,
						parts: responseMessage.parts,
						createdAt: /* @__PURE__ */ new Date(),
						attachments: [],
						chatId: id
					}] });
					if (finalUsage) try {
						await updateChatLastContextById({
							chatId: id,
							context: finalUsage
						});
					} catch (err) {
						console.warn("Unable to persist last usage for chat", id, err);
					}
					streamCache.clearActiveStream(id);
				}
			}),
			response: res,
			consumeSseStream({ stream }) {
				streamCache.storeStream({
					streamId,
					chatId: id,
					stream
				});
			}
		});
	} catch (error) {
		if (error instanceof ChatSDKError) {
			const response$1 = error.toResponse();
			return res.status(response$1.status).json(response$1.json);
		}
		console.error("Unhandled error in chat API:", error);
		const response = new ChatSDKError("offline:chat").toResponse();
		return res.status(response.status).json(response.json);
	}
});
/**
* DELETE /api/chat?id=:id - Delete a chat
*/
chatRouter.delete("/:id", [requireAuth, requireChatAccess], async (req, res) => {
	const { id } = req.params;
	const deletedChat = await deleteChatById({ id });
	return res.status(200).json(deletedChat);
});
/**
* GET /api/chat/:id
*/
chatRouter.get("/:id", [requireAuth, requireChatAccess], async (req, res) => {
	const { id } = req.params;
	const { chat } = await checkChatAccess(id, req.session?.user.id);
	return res.status(200).json(chat);
});
/**
* GET /api/chat/:id/stream - Resume a stream
*/
chatRouter.get("/:id/stream", [requireAuth], async (req, res) => {
	const { id: chatId } = req.params;
	const cursor = req.headers["x-resume-stream-cursor"];
	console.log(`[Stream Resume] Cursor: ${cursor}`);
	console.log(`[Stream Resume] GET request for chat ${chatId}`);
	const streamId = streamCache.getActiveStreamId(chatId);
	if (!streamId) {
		console.log(`[Stream Resume] No active stream for chat ${chatId}`);
		const response = new ChatSDKError("empty:stream").toResponse();
		return res.status(response.status).json(response.json);
	}
	const { allowed, reason } = await checkChatAccess(chatId, req.session?.user.id);
	if (reason === "not_found") console.log(`[Stream Resume] Resuming stream for temporary chat ${chatId} (not yet in DB)`);
	else if (!allowed) {
		console.log(`[Stream Resume] User ${req.session?.user.id} does not have access to chat ${chatId} (reason: ${reason})`);
		const response = new ChatSDKError("forbidden:chat", reason).toResponse();
		return res.status(response.status).json(response.json);
	}
	const stream = streamCache.getStream(streamId, { cursor: cursor ? Number.parseInt(cursor) : void 0 });
	if (!stream) {
		console.log(`[Stream Resume] No stream found for ${streamId}`);
		const response = new ChatSDKError("empty:stream").toResponse();
		return res.status(response.status).json(response.json);
	}
	console.log(`[Stream Resume] Resuming stream ${streamId}`);
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");
	stream.pipe(res);
	stream.on("error", (error) => {
		console.error("[Stream Resume] Stream error:", error);
		if (!res.headersSent) res.status(500).end();
	});
});
/**
* POST /api/chat/title - Generate title from message
*/
chatRouter.post("/title", requireAuth, async (req, res) => {
	try {
		const { message } = req.body;
		const title = await generateTitleFromUserMessage({ message });
		res.json({ title });
	} catch (error) {
		console.error("Error generating title:", error);
		res.status(500).json({ error: "Failed to generate title" });
	}
});
/**
* PATCH /api/chat/:id/visibility - Update chat visibility
*/
chatRouter.patch("/:id/visibility", [requireAuth, requireChatAccess], async (req, res) => {
	try {
		const { id } = req.params;
		const { visibility } = req.body;
		if (!visibility || !["public", "private"].includes(visibility)) return res.status(400).json({ error: "Invalid visibility type" });
		await updateChatVisiblityById({
			chatId: id,
			visibility
		});
		res.json({ success: true });
	} catch (error) {
		console.error("Error updating visibility:", error);
		res.status(500).json({ error: "Failed to update visibility" });
	}
});
async function generateTitleFromUserMessage({ message }) {
	const { text: title } = await generateText({
		model: await myProvider.languageModel("title-model"),
		system: `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 80 characters long
    - the title should be a summary of the user's message
    - do not use quotes or colons. do not include other expository content ("I'll help...")`,
		prompt: JSON.stringify(message)
	});
	return title;
}

//#endregion
//#region src/routes/history.ts
const historyRouter = Router();
historyRouter.use(authMiddleware);
/**
* GET /api/history - Get chat history for authenticated user
*/
historyRouter.get("/", requireAuth, async (req, res) => {
	console.log("[/api/history] Handler called");
	const dbAvailable = isDatabaseAvailable();
	console.log("[/api/history] Database available:", dbAvailable);
	if (!dbAvailable) {
		console.log("[/api/history] Returning 204 No Content");
		return res.status(204).end();
	}
	const session = req.session;
	if (!session) {
		const response = new ChatSDKError("unauthorized:chat").toResponse();
		return res.status(response.status).json(response.json);
	}
	const limit = Number.parseInt(req.query.limit || "10");
	const startingAfter = req.query.starting_after;
	const endingBefore = req.query.ending_before;
	if (startingAfter && endingBefore) {
		const response = new ChatSDKError("bad_request:api", "Only one of starting_after or ending_before can be provided.").toResponse();
		return res.status(response.status).json(response.json);
	}
	try {
		const chats = await getChatsByUserId({
			id: session.user.id,
			limit,
			startingAfter: startingAfter ?? null,
			endingBefore: endingBefore ?? null
		});
		res.json(chats);
	} catch (error) {
		console.error("[/api/history] Error in handler:", error);
		res.status(500).json({ error: "Failed to fetch chat history" });
	}
});

//#endregion
//#region src/routes/session.ts
const sessionRouter = Router();
sessionRouter.use(authMiddleware);
/**
* GET /api/session - Get current user session
*/
sessionRouter.get("/", async (req, res) => {
	console.log("GET /api/session", req.session);
	const session = req.session;
	if (!session?.user) return res.json({ user: null });
	const clientSession = { user: {
		email: session.user.email,
		name: session.user.name,
		preferredUsername: session.user.preferredUsername
	} };
	res.json(clientSession);
});

//#endregion
//#region src/routes/messages.ts
const messagesRouter = Router();
messagesRouter.use(authMiddleware);
/**
* GET /api/messages/:id - Get messages by chat ID
*/
messagesRouter.get("/:id", [requireAuth, requireChatAccess], async (req, res) => {
	const { id } = req.params;
	if (!id) return;
	try {
		const messages = await getMessagesByChatId({ id });
		return res.status(200).json(messages);
	} catch (error) {
		console.error("Error getting messages by chat ID:", error);
		return res.status(500).json({ error: "Failed to get messages" });
	}
});
/**
* DELETE /api/messages/:id/trailing - Delete trailing messages after a specific message
*/
messagesRouter.delete("/:id/trailing", [requireAuth], async (req, res) => {
	try {
		const dbAvailable = isDatabaseAvailable();
		console.log("[/api/messages/:id/trailing] Database available:", dbAvailable);
		if (!dbAvailable) {
			console.log("[/api/messages/:id/trailing] Returning 204 No Content");
			return res.status(204).end();
		}
		const { id } = req.params;
		const [message] = await getMessageById({ id });
		if (!message) {
			const response = new ChatSDKError("not_found:message").toResponse();
			return res.status(response.status).json(response.json);
		}
		const { allowed, reason } = await checkChatAccess(message.chatId, req.session?.user.id);
		if (!allowed) {
			const response = new ChatSDKError("forbidden:chat", reason).toResponse();
			return res.status(response.status).json(response.json);
		}
		await deleteMessagesByChatIdAfterTimestamp({
			chatId: message.chatId,
			timestamp: message.createdAt
		});
		res.json({ success: true });
	} catch (error) {
		console.error("Error deleting trailing messages:", error);
		res.status(500).json({ error: "Failed to delete messages" });
	}
});

//#endregion
//#region src/routes/config.ts
const configRouter = Router();
/**
* GET /api/config - Get application configuration
* Returns feature flags based on environment configuration
*/
configRouter.get("/", (_req, res) => {
	res.json({
		features: { chatHistory: isDatabaseAvailable() },
		availableModels: FOUNDATION_MODELS,
		defaultModel: getDefaultFoundationModel()
	});
});

//#endregion
//#region src/routes/files.ts
const filesRouter = Router();
filesRouter.use(fileUpload({
	limits: { fileSize: 10 * 1024 * 1024 },
	useTempFiles: true,
	tempFileDir: os.tmpdir()
}));
filesRouter.use(authMiddleware);
const sessionMemory$1 = ProjectSessionMemory.getInstance();
/**
* POST /api/files/upload - Upload a file to a chat session
*
* Storage strategy:
* 1. Original file -> Databricks Volume (if available)
* 2. Extracted text + metadata -> PostgreSQL (if available)
* 3. Fallback -> Session memory (ephemeral)
*/
filesRouter.post("/upload", requireAuth, async (req, res) => {
	try {
		const { chatId, projectId } = req.body;
		const userId = req.session?.user.id;
		if (!chatId) {
			const response = new ChatSDKError("bad_request:api", "Chat ID is required").toResponse();
			return res.status(response.status).json(response.json);
		}
		if (!req.files || Object.keys(req.files).length === 0) {
			const response = new ChatSDKError("bad_request:api", "No files were uploaded").toResponse();
			return res.status(response.status).json(response.json);
		}
		const uploadedFile = Array.isArray(req.files.file) ? req.files.file[0] : req.files.file;
		if (!uploadedFile) {
			const response = new ChatSDKError("bad_request:api", "File not found in request").toResponse();
			return res.status(response.status).json(response.json);
		}
		const fileId = generateUUID();
		const fileBuffer = await fs.readFile(uploadedFile.tempFilePath);
		const processedFile = await FileProcessor.processFile(uploadedFile.tempFilePath, uploadedFile.name, uploadedFile.mimetype);
		sessionMemory$1.addFile(chatId, userId, fileId, processedFile);
		if (FileProcessor.isImageFile(processedFile.filename)) console.log(`[FileUpload] Image stored in session memory:`, {
			chatId,
			fileId,
			filename: processedFile.filename,
			hasBase64: !!processedFile.base64Content,
			base64Length: processedFile.base64Content?.length || 0
		});
		let storageType = "memory";
		let volumePath;
		let volumeCatalog;
		let volumeSchema;
		let volumeName;
		let fileChecksum;
		const volumeStorage = getVolumeStorage();
		if (volumeStorage) try {
			const volumeResult = await volumeStorage.uploadFile(fileBuffer, uploadedFile.name, {
				chatId,
				projectId,
				userId,
				fileId
			});
			volumePath = volumeResult.volumePath;
			volumeCatalog = volumeResult.volumeCatalog;
			volumeSchema = volumeResult.volumeSchema;
			volumeName = volumeResult.volumeName;
			fileChecksum = volumeResult.checksum;
			storageType = "volume";
			console.log(`[FileUpload] File uploaded to volume: ${volumePath}`);
		} catch (volumeError) {
			console.warn("[FileUpload] Volume upload failed, falling back to memory storage:", volumeError);
		}
		else console.log("[FileUpload] Volume storage not configured, using memory storage");
		if (isDatabaseAvailable()) try {
			const { checkChatAccess: checkChatAccess$1 } = await import("./src-CLzfeF5v.mjs");
			const { chat } = await checkChatAccess$1(chatId, userId);
			if (chat) await saveFileUpload({
				id: fileId,
				chatId,
				userId,
				filename: processedFile.filename,
				contentType: processedFile.contentType,
				fileSize: processedFile.fileSize,
				extractedContent: processedFile.extractedContent,
				metadata: processedFile.metadata,
				volumePath,
				volumeCatalog,
				volumeSchema,
				volumeName,
				storageType,
				fileChecksum
			});
			else console.log(`Chat ${chatId} not in database yet, file metadata stored in session memory only`);
		} catch (dbError) {
			console.log("Could not save file metadata to database, stored in session memory:", dbError);
		}
		await FileProcessor.cleanupTempFile(uploadedFile.tempFilePath);
		res.json({
			id: fileId,
			filename: processedFile.filename,
			contentType: processedFile.contentType,
			fileSize: processedFile.fileSize,
			metadata: processedFile.metadata,
			hasContent: !!processedFile.extractedContent,
			isImage: FileProcessor.isImageFile(processedFile.filename),
			storageType
		});
	} catch (error) {
		console.error("File upload error:", error);
		const response = new ChatSDKError("bad_request:api", error instanceof Error ? error.message : "Failed to upload file").toResponse();
		return res.status(response.status).json(response.json);
	}
});
/**
* GET /api/files/:chatId - Get all files for a chat session
*/
filesRouter.get("/:chatId", requireAuth, async (req, res) => {
	try {
		const { chatId } = req.params;
		const sessionFiles = sessionMemory$1.getSessionFiles(chatId);
		let dbFiles = [];
		if (isDatabaseAvailable()) dbFiles = await getFileUploadsByChatId({ chatId });
		const fileMap = /* @__PURE__ */ new Map();
		for (const file of dbFiles) fileMap.set(file.id, {
			id: file.id,
			filename: file.filename,
			contentType: file.contentType,
			fileSize: file.fileSize,
			metadata: file.metadata,
			uploadedAt: file.createdAt,
			hasContent: !!file.extractedContent,
			isImage: FileProcessor.isImageFile(file.filename),
			storageType: file.storageType || "memory",
			canDownload: file.storageType === "volume" && !!file.volumePath
		});
		for (const sessionFile of sessionFiles) fileMap.set(sessionFile.id, {
			id: sessionFile.id,
			filename: sessionFile.file.filename,
			contentType: sessionFile.file.contentType,
			fileSize: sessionFile.file.fileSize,
			metadata: sessionFile.file.metadata,
			uploadedAt: sessionFile.uploadedAt,
			hasContent: !!sessionFile.file.extractedContent,
			isImage: FileProcessor.isImageFile(sessionFile.file.filename),
			storageType: "memory",
			canDownload: false
		});
		const files = Array.from(fileMap.values());
		res.json({ files });
	} catch (error) {
		console.error("Get files error:", error);
		const response = new ChatSDKError("bad_request:api", "Failed to retrieve files").toResponse();
		return res.status(response.status).json(response.json);
	}
});
/**
* GET /api/files/:chatId/:fileId/content - Get file extracted content (text)
*/
filesRouter.get("/:chatId/:fileId/content", requireAuth, async (req, res) => {
	try {
		const { chatId, fileId } = req.params;
		const sessionFile = sessionMemory$1.getFile(chatId, fileId);
		if (sessionFile) return res.json({
			id: fileId,
			filename: sessionFile.file.filename,
			content: sessionFile.file.extractedContent,
			base64Content: sessionFile.file.base64Content,
			metadata: sessionFile.file.metadata
		});
		if (isDatabaseAvailable()) {
			const file = (await getFileUploadsByChatId({ chatId })).find((f) => f.id === fileId);
			if (file) return res.json({
				id: file.id,
				filename: file.filename,
				content: file.extractedContent,
				metadata: file.metadata
			});
		}
		const response = new ChatSDKError("not_found:api", "File not found").toResponse();
		return res.status(response.status).json(response.json);
	} catch (error) {
		console.error("Get file content error:", error);
		const response = new ChatSDKError("bad_request:api", "Failed to retrieve file content").toResponse();
		return res.status(response.status).json(response.json);
	}
});
/**
* GET /api/files/:chatId/:fileId/download - Download original file from Volume
*/
filesRouter.get("/:chatId/:fileId/download", requireAuth, async (req, res) => {
	try {
		const { chatId, fileId } = req.params;
		if (!isDatabaseAvailable()) {
			const response = new ChatSDKError("bad_request:api", "Database not available for file download").toResponse();
			return res.status(response.status).json(response.json);
		}
		const file = await getFileUploadById({ id: fileId });
		if (!file) {
			const response = new ChatSDKError("not_found:api", "File not found").toResponse();
			return res.status(response.status).json(response.json);
		}
		if (file.chatId !== chatId) {
			const response = new ChatSDKError("forbidden:api", "File does not belong to this chat").toResponse();
			return res.status(response.status).json(response.json);
		}
		if (file.storageType !== "volume" || !file.volumePath) {
			const response = new ChatSDKError("bad_request:api", "File is not available for download (stored in memory only)").toResponse();
			return res.status(response.status).json(response.json);
		}
		const volumeStorage = getVolumeStorage();
		if (!volumeStorage) {
			const response = new ChatSDKError("bad_request:api", "Volume storage not configured").toResponse();
			return res.status(response.status).json(response.json);
		}
		const fileBuffer = await volumeStorage.downloadFile(file.volumePath);
		res.setHeader("Content-Type", file.contentType);
		res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.filename)}"`);
		res.setHeader("Content-Length", fileBuffer.length);
		res.send(fileBuffer);
	} catch (error) {
		console.error("Download file error:", error);
		const response = new ChatSDKError("bad_request:api", error instanceof Error ? error.message : "Failed to download file").toResponse();
		return res.status(response.status).json(response.json);
	}
});
/**
* DELETE /api/files/:chatId/:fileId - Delete a file from session and storage
*/
filesRouter.delete("/:chatId/:fileId", requireAuth, async (req, res) => {
	try {
		const { chatId, fileId } = req.params;
		if (isDatabaseAvailable()) {
			const file = await getFileUploadById({ id: fileId });
			if (file?.storageType === "volume" && file.volumePath) {
				const volumeStorage = getVolumeStorage();
				if (volumeStorage) try {
					await volumeStorage.deleteFile(file.volumePath);
					console.log(`[FileDelete] Deleted from volume: ${file.volumePath}`);
				} catch (volumeError) {
					console.warn("[FileDelete] Failed to delete from volume:", volumeError);
				}
			}
		}
		sessionMemory$1.removeFile(chatId, fileId);
		if (isDatabaseAvailable()) await deleteFileUpload({ id: fileId });
		res.json({ success: true });
	} catch (error) {
		console.error("Delete file error:", error);
		const response = new ChatSDKError("bad_request:api", "Failed to delete file").toResponse();
		return res.status(response.status).json(response.json);
	}
});
/**
* GET /api/files/:chatId/context - Get formatted context for all files
*/
filesRouter.get("/:chatId/context", requireAuth, async (req, res) => {
	try {
		const { chatId } = req.params;
		const { maxFiles = 10 } = req.query;
		const context = sessionMemory$1.getContextString(chatId, Number.parseInt(maxFiles));
		res.json({ context });
	} catch (error) {
		console.error("Get context error:", error);
		const response = new ChatSDKError("bad_request:api", "Failed to get file context").toResponse();
		return res.status(response.status).json(response.json);
	}
});

//#endregion
//#region src/routes/projects.ts
const createProjectSchema = z.object({
	name: z.string().min(1).max(100),
	description: z.string().optional(),
	color: z.string().optional(),
	icon: z.string().optional(),
	metadata: z.record(z.any()).optional()
});
const updateProjectSchema = z.object({
	name: z.string().min(1).max(100).optional(),
	description: z.string().optional(),
	color: z.string().optional(),
	icon: z.string().optional(),
	isActive: z.boolean().optional(),
	metadata: z.record(z.any()).optional()
});
const addContextSchema = z.object({
	contextType: z.enum([
		"instruction",
		"memory",
		"reference"
	]),
	content: z.string().min(1)
});
const updateContextSchema = z.object({ content: z.string().min(1) });
const projectsRouter = Router();
projectsRouter.use(authMiddleware);
projectsRouter.use(fileUpload({
	limits: { fileSize: 10 * 1024 * 1024 },
	useTempFiles: true,
	tempFileDir: os.tmpdir()
}));
const sessionMemory = ProjectSessionMemory.getInstance();
projectsRouter.post("/", requireAuth, async (req, res) => {
	try {
		const validatedData = createProjectSchema.parse(req.body);
		const userId = req.session?.user.id;
		const project = await createProject({
			userId,
			...validatedData
		});
		if (!project) throw new ChatSDKError("internal:database", "Failed to create project");
		res.json(project);
	} catch (error) {
		if (error instanceof z.ZodError) res.status(400).json({
			error: "Invalid request data",
			details: error.errors
		});
		else if (error instanceof ChatSDKError) res.status(500).json({ error: error.message });
		else res.status(500).json({ error: "Internal server error" });
	}
});
projectsRouter.get("/", requireAuth, async (req, res) => {
	try {
		const userId = req.session?.user.id;
		const projects = await getProjectsByUserId({ userId });
		res.json(projects);
	} catch (_error) {
		res.status(500).json({ error: "Failed to fetch projects" });
	}
});
projectsRouter.get("/:id", requireAuth, async (req, res) => {
	try {
		const userId = req.session?.user.id;
		const project = await getProjectById({
			id: req.params.id,
			userId
		});
		if (!project) throw new ChatSDKError("not_found:project", "Project not found");
		res.json(project);
	} catch (error) {
		if (error instanceof ChatSDKError && error.code === "not_found:project") res.status(404).json({ error: error.message });
		else res.status(500).json({ error: "Failed to fetch project" });
	}
});
projectsRouter.patch("/:id", requireAuth, async (req, res) => {
	try {
		const validatedData = updateProjectSchema.parse(req.body);
		const userId = req.session?.user.id;
		const project = await updateProject({
			id: req.params.id,
			userId,
			...validatedData
		});
		if (!project) throw new ChatSDKError("not_found:project", "Project not found");
		res.json(project);
	} catch (error) {
		if (error instanceof z.ZodError) res.status(400).json({
			error: "Invalid request data",
			details: error.errors
		});
		else if (error instanceof ChatSDKError && error.code === "not_found:project") res.status(404).json({ error: error.message });
		else res.status(500).json({ error: "Failed to update project" });
	}
});
projectsRouter.delete("/:id", requireAuth, async (req, res) => {
	try {
		const userId = req.session?.user.id;
		if (!await deleteProject({
			id: req.params.id,
			userId
		})) throw new ChatSDKError("not_found:project", "Project not found");
		res.status(204).send();
	} catch (error) {
		if (error instanceof ChatSDKError && error.code === "not_found:project") res.status(404).json({ error: error.message });
		else res.status(500).json({ error: "Failed to delete project" });
	}
});
projectsRouter.post("/:id/chats/:chatId", requireAuth, async (req, res) => {
	try {
		const userId = req.session?.user.id;
		const { id: projectId, chatId } = req.params;
		if (!await getProjectById({
			id: projectId,
			userId
		})) throw new ChatSDKError("not_found:project", "Project not found");
		const chat = await getChatById({ id: chatId });
		if (!chat || chat.userId !== userId) throw new ChatSDKError("not_found:chat", "Chat not found");
		if (!await addChatToProject({
			chatId,
			projectId,
			userId
		})) throw new ChatSDKError("internal:database", "Failed to add chat to project");
		res.json({ success: true });
	} catch (error) {
		if (error instanceof ChatSDKError) {
			const status = error.code.startsWith("not_found") ? 404 : 500;
			res.status(status).json({ error: error.message });
		} else res.status(500).json({ error: "Failed to add chat to project" });
	}
});
projectsRouter.delete("/:id/chats/:chatId", requireAuth, async (req, res) => {
	try {
		const userId = req.session?.user.id;
		const { chatId } = req.params;
		if (!await removeChatFromProject({
			chatId,
			userId
		})) throw new ChatSDKError("internal:database", "Failed to remove chat from project");
		res.status(204).send();
	} catch (_error) {
		res.status(500).json({ error: "Failed to remove chat from project" });
	}
});
projectsRouter.get("/:id/chats", requireAuth, async (req, res) => {
	try {
		const userId = req.session?.user.id;
		const chats = await getChatsByProjectId({
			projectId: req.params.id,
			userId
		});
		res.json(chats);
	} catch (_error) {
		res.status(500).json({ error: "Failed to fetch project chats" });
	}
});
projectsRouter.post("/:id/files", requireAuth, async (req, res) => {
	try {
		const userId = req.session?.user.id;
		const { id: projectId } = req.params;
		const { fileId } = req.body;
		if (!fileId) throw new ChatSDKError("bad_request:missing_param", "fileId is required");
		const projectFile = await addFileToProject({
			projectId,
			fileId,
			userId
		});
		if (!projectFile) throw new ChatSDKError("internal:database", "Failed to add file to project");
		res.json(projectFile);
	} catch (error) {
		if (error instanceof ChatSDKError) {
			const status = error.code.startsWith("bad_request") ? 400 : 500;
			res.status(status).json({ error: error.message });
		} else res.status(500).json({ error: "Failed to add file to project" });
	}
});
projectsRouter.get("/:id/files", requireAuth, async (req, res) => {
	try {
		const files = await getProjectFiles({ projectId: req.params.id });
		res.json(files);
	} catch (_error) {
		res.status(500).json({ error: "Failed to fetch project files" });
	}
});
projectsRouter.delete("/:id/files/:fileId", requireAuth, async (req, res) => {
	try {
		const { id: projectId, fileId } = req.params;
		if (!await removeFileFromProject({
			projectId,
			fileId
		})) throw new ChatSDKError("internal:database", "Failed to remove file from project");
		sessionMemory.removeProjectFile(projectId, fileId);
		res.status(204).send();
	} catch (_error) {
		res.status(500).json({ error: "Failed to remove file from project" });
	}
});
projectsRouter.post("/:id/upload", requireAuth, async (req, res) => {
	try {
		const { id: projectId } = req.params;
		const userId = req.session?.user.id;
		const project = await getProjectById(projectId);
		if (!project || project.userId !== userId) {
			const response = new ChatSDKError("forbidden:project", "Access denied to project").toResponse();
			return res.status(response.status).json(response.json);
		}
		if (!req.files || Object.keys(req.files).length === 0) {
			const response = new ChatSDKError("bad_request:api", "No files were uploaded").toResponse();
			return res.status(response.status).json(response.json);
		}
		const uploadedFiles = [];
		const fileArray = Array.isArray(req.files.file) ? req.files.file : [req.files.file];
		for (const file of fileArray) try {
			const tempPath = file.tempFilePath;
			const processedFile = await FileProcessor.processFile(tempPath, file.name, file.mimetype);
			const fileId = generateUUID();
			const fileBuffer = await fs.readFile(tempPath);
			let storageType = "memory";
			let volumePath;
			let volumeCatalog;
			let volumeSchema;
			let volumeName;
			let fileChecksum;
			const volumeStorage = getVolumeStorage();
			if (volumeStorage) try {
				const volumeResult = await volumeStorage.uploadFile(fileBuffer, file.name, {
					projectId,
					fileId
				});
				volumePath = volumeResult.volumePath;
				volumeCatalog = volumeResult.volumeCatalog;
				volumeSchema = volumeResult.volumeSchema;
				volumeName = volumeResult.volumeName;
				fileChecksum = volumeResult.checksum;
				storageType = "volume";
				console.log(`[Projects] File uploaded to volume: ${volumePath}`);
			} catch (volumeError) {
				console.warn("[Projects] Volume upload failed, falling back to memory storage:", volumeError);
			}
			else console.log("[Projects] Volume storage not configured, using memory storage");
			if (isDatabaseAvailable()) {
				await saveFileUpload({
					id: fileId,
					chatId: null,
					userId,
					filename: file.name,
					contentType: file.mimetype,
					fileSize: file.size,
					extractedContent: processedFile.extractedContent,
					metadata: processedFile.metadata,
					volumePath,
					volumeCatalog,
					volumeSchema,
					volumeName,
					storageType,
					fileChecksum
				});
				await addFileToProject({
					projectId,
					fileId,
					userId
				});
			}
			sessionMemory.addProjectFile(projectId, fileId, {
				id: fileId,
				filename: file.name,
				contentType: file.mimetype,
				fileSize: file.size,
				extractedContent: processedFile.extractedContent,
				metadata: processedFile.metadata || {},
				createdAt: /* @__PURE__ */ new Date()
			});
			uploadedFiles.push({
				id: fileId,
				filename: file.name,
				contentType: file.mimetype,
				fileSize: file.size,
				extractedContent: processedFile.extractedContent,
				projectId,
				storageType
			});
			if (tempPath) try {
				await fs.unlink(tempPath);
			} catch (err) {
				console.warn("Failed to clean up temp file:", err);
			}
		} catch (error) {
			console.error(`Failed to process file ${file.name}:`, error);
		}
		if (uploadedFiles.length === 0) {
			const response = new ChatSDKError("internal:processing", "Failed to process any files").toResponse();
			return res.status(response.status).json(response.json);
		}
		res.json({
			files: uploadedFiles,
			projectId
		});
	} catch (error) {
		console.error("Error uploading files to project:", error);
		if (error instanceof ChatSDKError) {
			const response = error.toResponse();
			return res.status(response.status).json(response.json);
		}
		res.status(500).json({ error: "Failed to upload files to project" });
	}
});
projectsRouter.post("/:id/context", requireAuth, async (req, res) => {
	try {
		const validatedData = addContextSchema.parse(req.body);
		const { id: projectId } = req.params;
		const context = await addProjectContext({
			projectId,
			...validatedData
		});
		if (!context) throw new ChatSDKError("internal:database", "Failed to add project context");
		res.json(context);
	} catch (error) {
		if (error instanceof z.ZodError) res.status(400).json({
			error: "Invalid request data",
			details: error.errors
		});
		else res.status(500).json({ error: "Failed to add project context" });
	}
});
projectsRouter.get("/:id/context", requireAuth, async (req, res) => {
	try {
		const contexts = await getProjectContexts({ projectId: req.params.id });
		res.json(contexts);
	} catch (_error) {
		res.status(500).json({ error: "Failed to fetch project contexts" });
	}
});
projectsRouter.patch("/:id/context/:contextId", requireAuth, async (req, res) => {
	try {
		const validatedData = updateContextSchema.parse(req.body);
		const { contextId } = req.params;
		const context = await updateProjectContext({
			id: contextId,
			...validatedData
		});
		if (!context) throw new ChatSDKError("not_found:context", "Context not found");
		res.json(context);
	} catch (error) {
		if (error instanceof z.ZodError) res.status(400).json({
			error: "Invalid request data",
			details: error.errors
		});
		else if (error instanceof ChatSDKError && error.code === "not_found:context") res.status(404).json({ error: error.message });
		else res.status(500).json({ error: "Failed to update context" });
	}
});
projectsRouter.delete("/:id/context/:contextId", requireAuth, async (req, res) => {
	try {
		const { contextId } = req.params;
		if (!await deleteProjectContext({ id: contextId })) throw new ChatSDKError("internal:database", "Failed to delete context");
		res.status(204).send();
	} catch (_error) {
		res.status(500).json({ error: "Failed to delete context" });
	}
});

//#endregion
//#region src/index.ts
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const isDevelopment = process.env.NODE_ENV !== "production";
const PORT = process.env.CHAT_APP_PORT || process.env.PORT || (isDevelopment ? 3001 : 3e3);
app.use(cors({
	origin: isDevelopment ? "http://localhost:3000" : true,
	credentials: true
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.get("/ping", (_req, res) => {
	res.status(200).send("pong");
});
app.use("/api/chat", chatRouter);
app.use("/api/history", historyRouter);
app.use("/api/session", sessionRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/config", configRouter);
app.use("/api/files", filesRouter);
app.use("/api/projects", projectsRouter);
if (!isDevelopment) {
	const clientBuildPath = path.join(__dirname, "../../client/dist");
	app.use(express.static(clientBuildPath));
	app.get(/^\/(?!api).*/, (_req, res) => {
		res.sendFile(path.join(clientBuildPath, "index.html"));
	});
}
app.use((err, _req, res, _next) => {
	console.error("Error:", err);
	if (err instanceof ChatSDKError) {
		const response = err.toResponse();
		return res.status(response.status).json(response.json);
	}
	res.status(500).json({
		error: "Internal Server Error",
		message: isDevelopment ? err.message : "An unexpected error occurred"
	});
});
async function startServer() {
	if (process.env.PLAYWRIGHT === "True") {
		console.log("[Test Mode] Starting MSW mock server for API mocking...");
		try {
			const modulePath = path.join(dirname(dirname(__dirname)), "tests", "api-mocking", "api-mock-server.ts");
			console.log("[Test Mode] Attempting to load MSW from:", modulePath);
			const { mockServer } = await import(modulePath);
			mockServer.listen({ onUnhandledRequest: (request) => {
				console.warn(`[MSW] Unhandled ${request.method} request to ${request.url}`);
			} });
			console.log("[Test Mode] MSW mock server started successfully");
			console.log("[Test Mode] Registered handlers:", mockServer.listHandlers().length);
		} catch (error) {
			console.error("[Test Mode] Failed to start MSW:", error);
			console.error("[Test Mode] Error details:", error instanceof Error ? error.stack : error);
		}
	}
	app.listen(PORT, () => {
		console.log(`Backend server is running on http://localhost:${PORT}`);
		console.log(`Environment: ${isDevelopment ? "development" : "production"}`);
	});
}
startServer();
var src_default = app;

//#endregion
export { src_default as default };