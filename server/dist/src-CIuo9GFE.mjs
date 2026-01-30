import { _ as lt, a as fileUpload, c as projectContext, d as desc, f as and, g as inArray, h as gte, i as chat, l as projectFile, m as gt, n as isDatabaseAvailable, o as message, p as eq, r as drizzle, s as project, u as asc, v as sql } from "./connection-pool-CIODZxSg.mjs";
import { n as getAuthMethodDescription, t as getAuthMethod } from "./src-pe6ovBD5.mjs";
import { t as src_default } from "./src-CqvC4Bjf.mjs";
import { z } from "zod";
import { Readable } from "node:stream";

//#region ../packages/core/src/types.ts
z.object({ createdAt: z.string() });

//#endregion
//#region ../packages/core/src/errors.ts
const visibilityBySurface = {
	database: "log",
	chat: "response",
	auth: "response",
	api: "response",
	history: "response",
	stream: "response",
	message: "response"
};
var ChatSDKError = class extends Error {
	type;
	surface;
	statusCode;
	cause;
	constructor(errorCode, cause) {
		super();
		let type;
		let surface;
		try {
			const [_type, _surface] = errorCode.split(":");
			type = _type;
			surface = _surface;
		} catch (error) {
			console.error("Error parsing error code:", error);
			throw new Error("Invalid error code");
		}
		this.type = type;
		this.cause = cause;
		this.surface = surface;
		this.message = getMessageByErrorCode(errorCode);
		this.statusCode = getStatusCodeByType(this.type);
	}
	toResponse() {
		const code = `${this.type}:${this.surface}`;
		const visibility = visibilityBySurface[this.surface];
		const { message: message$1, cause, statusCode } = this;
		if (visibility === "log") {
			console.error({
				code,
				message: message$1,
				cause
			});
			return {
				status: statusCode,
				json: {
					code: "",
					message: "Something went wrong. Please try again later."
				}
			};
		}
		return {
			status: statusCode,
			json: {
				code,
				message: message$1,
				cause
			}
		};
	}
};
function getMessageByErrorCode(errorCode) {
	if (errorCode.includes("database")) return "An error occurred while executing a database query.";
	switch (errorCode) {
		case "bad_request:api": return "The request couldn't be processed. Please check your input and try again.";
		case "unauthorized:auth": return "You need to sign in before continuing.";
		case "forbidden:auth": return "Your account does not have access to this feature.";
		case "rate_limit:chat": return "You have exceeded your maximum number of messages for the day. Please try again later.";
		case "not_found:chat": return "The requested chat was not found. Please check the chat ID and try again.";
		case "forbidden:chat": return "This chat belongs to another user. Please check the chat ID and try again.";
		case "unauthorized:chat": return "You need to sign in to view this chat. Please sign in and try again.";
		case "offline:chat": return "We're having trouble sending your message. Please check your internet connection and try again.";
		default: return "Something went wrong. Please try again later.";
	}
}
function getStatusCodeByType(type) {
	switch (type) {
		case "bad_request": return 400;
		case "unauthorized": return 401;
		case "forbidden": return 403;
		case "not_found": return 404;
		case "rate_limit": return 429;
		case "offline": return 503;
		case "empty": return 204;
		default: return 500;
	}
}

//#endregion
//#region ../packages/core/node_modules/date-fns/constants.js
/**
* @constant
* @name daysInYear
* @summary Days in 1 year.
*
* @description
* How many days in a year.
*
* One years equals 365.2425 days according to the formula:
*
* > Leap year occurs every 4 years, except for years that are divisible by 100 and not divisible by 400.
* > 1 mean year = (365+1/4-1/100+1/400) days = 365.2425 days
*/
const daysInYear = 365.2425;
/**
* @constant
* @name maxTime
* @summary Maximum allowed time.
*
* @example
* import { maxTime } from "./constants/date-fns/constants";
*
* const isValid = 8640000000000001 <= maxTime;
* //=> false
*
* new Date(8640000000000001);
* //=> Invalid Date
*/
const maxTime = Math.pow(10, 8) * 24 * 60 * 60 * 1e3;
/**
* @constant
* @name secondsInHour
* @summary Seconds in 1 hour.
*/
const secondsInHour = 3600;
/**
* @constant
* @name secondsInDay
* @summary Seconds in 1 day.
*/
const secondsInDay = secondsInHour * 24;
/**
* @constant
* @name secondsInWeek
* @summary Seconds in 1 week.
*/
const secondsInWeek = secondsInDay * 7;
/**
* @constant
* @name secondsInYear
* @summary Seconds in 1 year.
*/
const secondsInYear = secondsInDay * daysInYear;
/**
* @constant
* @name secondsInMonth
* @summary Seconds in 1 month
*/
const secondsInMonth = secondsInYear / 12;
/**
* @constant
* @name secondsInQuarter
* @summary Seconds in 1 quarter.
*/
const secondsInQuarter = secondsInMonth * 3;
/**
* @constant
* @name constructFromSymbol
* @summary Symbol enabling Date extensions to inherit properties from the reference date.
*
* The symbol is used to enable the `constructFrom` function to construct a date
* using a reference date and a value. It allows to transfer extra properties
* from the reference date to the new date. It's useful for extensions like
* [`TZDate`](https://github.com/date-fns/tz) that accept a time zone as
* a constructor argument.
*/
const constructFromSymbol = Symbol.for("constructDateFrom");

//#endregion
//#region ../packages/core/node_modules/date-fns/constructFrom.js
/**
* @name constructFrom
* @category Generic Helpers
* @summary Constructs a date using the reference date and the value
*
* @description
* The function constructs a new date using the constructor from the reference
* date and the given value. It helps to build generic functions that accept
* date extensions.
*
* It defaults to `Date` if the passed reference date is a number or a string.
*
* Starting from v3.7.0, it allows to construct a date using `[Symbol.for("constructDateFrom")]`
* enabling to transfer extra properties from the reference date to the new date.
* It's useful for extensions like [`TZDate`](https://github.com/date-fns/tz)
* that accept a time zone as a constructor argument.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
*
* @param date - The reference date to take constructor from
* @param value - The value to create the date
*
* @returns Date initialized using the given date and value
*
* @example
* import { constructFrom } from "./constructFrom/date-fns";
*
* // A function that clones a date preserving the original type
* function cloneDate<DateType extends Date>(date: DateType): DateType {
*   return constructFrom(
*     date, // Use constructor from the given date
*     date.getTime() // Use the date value to create a new date
*   );
* }
*/
function constructFrom(date, value) {
	if (typeof date === "function") return date(value);
	if (date && typeof date === "object" && constructFromSymbol in date) return date[constructFromSymbol](value);
	if (date instanceof Date) return new date.constructor(value);
	return new Date(value);
}

//#endregion
//#region ../packages/core/node_modules/date-fns/toDate.js
/**
* @name toDate
* @category Common Helpers
* @summary Convert the given argument to an instance of Date.
*
* @description
* Convert the given argument to an instance of Date.
*
* If the argument is an instance of Date, the function returns its clone.
*
* If the argument is a number, it is treated as a timestamp.
*
* If the argument is none of the above, the function returns Invalid Date.
*
* Starting from v3.7.0, it clones a date using `[Symbol.for("constructDateFrom")]`
* enabling to transfer extra properties from the reference date to the new date.
* It's useful for extensions like [`TZDate`](https://github.com/date-fns/tz)
* that accept a time zone as a constructor argument.
*
* **Note**: *all* Date arguments passed to any *date-fns* function is processed by `toDate`.
*
* @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
* @typeParam ResultDate - The result `Date` type, it is the type returned from the context function if it is passed, or inferred from the arguments.
*
* @param argument - The value to convert
*
* @returns The parsed date in the local time zone
*
* @example
* // Clone the date:
* const result = toDate(new Date(2014, 1, 11, 11, 30, 30))
* //=> Tue Feb 11 2014 11:30:30
*
* @example
* // Convert the timestamp to date:
* const result = toDate(1392098430000)
* //=> Tue Feb 11 2014 11:30:30
*/
function toDate(argument, context) {
	return constructFrom(context || argument, argument);
}

//#endregion
//#region ../packages/core/node_modules/date-fns/_lib/addLeadingZeros.js
function addLeadingZeros(number, targetLength) {
	return (number < 0 ? "-" : "") + Math.abs(number).toString().padStart(targetLength, "0");
}

//#endregion
//#region ../packages/core/node_modules/date-fns/formatISO.js
/**
* The {@link formatISO} function options.
*/
/**
* @name formatISO
* @category Common Helpers
* @summary Format the date according to the ISO 8601 standard (https://support.sas.com/documentation/cdl/en/lrdict/64316/HTML/default/viewer.htm#a003169814.htm).
*
* @description
* Return the formatted date string in ISO 8601 format. Options may be passed to control the parts and notations of the date.
*
* @param date - The original date
* @param options - An object with options.
*
* @returns The formatted date string (in local time zone)
*
* @throws `date` must not be Invalid Date
*
* @example
* // Represent 18 September 2019 in ISO 8601 format (local time zone is UTC):
* const result = formatISO(new Date(2019, 8, 18, 19, 0, 52))
* //=> '2019-09-18T19:00:52Z'
*
* @example
* // Represent 18 September 2019 in ISO 8601, short format (local time zone is UTC):
* const result = formatISO(new Date(2019, 8, 18, 19, 0, 52), { format: 'basic' })
* //=> '20190918T190052'
*
* @example
* // Represent 18 September 2019 in ISO 8601 format, date only:
* const result = formatISO(new Date(2019, 8, 18, 19, 0, 52), { representation: 'date' })
* //=> '2019-09-18'
*
* @example
* // Represent 18 September 2019 in ISO 8601 format, time only (local time zone is UTC):
* const result = formatISO(new Date(2019, 8, 18, 19, 0, 52), { representation: 'time' })
* //=> '19:00:52Z'
*/
function formatISO(date, options) {
	const date_ = toDate(date, options?.in);
	if (isNaN(+date_)) throw new RangeError("Invalid time value");
	const format = options?.format ?? "extended";
	const representation = options?.representation ?? "complete";
	let result = "";
	let tzOffset = "";
	const dateDelimiter = format === "extended" ? "-" : "";
	const timeDelimiter = format === "extended" ? ":" : "";
	if (representation !== "time") {
		const day = addLeadingZeros(date_.getDate(), 2);
		const month = addLeadingZeros(date_.getMonth() + 1, 2);
		result = `${addLeadingZeros(date_.getFullYear(), 4)}${dateDelimiter}${month}${dateDelimiter}${day}`;
	}
	if (representation !== "date") {
		const offset = date_.getTimezoneOffset();
		if (offset !== 0) {
			const absoluteOffset = Math.abs(offset);
			const hourOffset = addLeadingZeros(Math.trunc(absoluteOffset / 60), 2);
			const minuteOffset = addLeadingZeros(absoluteOffset % 60, 2);
			tzOffset = `${offset < 0 ? "+" : "-"}${hourOffset}:${minuteOffset}`;
		} else tzOffset = "Z";
		const hour = addLeadingZeros(date_.getHours(), 2);
		const minute = addLeadingZeros(date_.getMinutes(), 2);
		const second = addLeadingZeros(date_.getSeconds(), 2);
		const separator = result === "" ? "" : "T";
		const time = [
			hour,
			minute,
			second
		].join(timeDelimiter);
		result = `${result}${separator}${time}${tzOffset}`;
	}
	return result;
}

//#endregion
//#region ../packages/core/src/utils.ts
function generateUUID() {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = Math.random() * 16 | 0;
		return (c === "x" ? r : r & 3 | 8).toString(16);
	});
}
function convertToUIMessages(messages) {
	return messages.map((message$1) => ({
		id: message$1.id,
		role: message$1.role,
		parts: message$1.parts,
		metadata: { createdAt: formatISO(message$1.createdAt) }
	}));
}

//#endregion
//#region ../packages/db/src/queries.ts
let _db;
const getOrInitializeDb = async () => {
	if (!isDatabaseAvailable()) throw new Error("Database configuration required. Please set PGDATABASE/PGHOST/PGUSER or POSTGRES_URL environment variables.");
	if (_db) return _db;
	const authMethod = getAuthMethod();
	if (authMethod === "oauth" || authMethod === "cli") console.log(`Using ${getAuthMethodDescription()} authentication for Postgres connection`);
	else if (process.env.POSTGRES_URL) _db = drizzle(src_default(process.env.POSTGRES_URL));
	return _db;
};
async function ensureDb() {
	const db = await getOrInitializeDb();
	const authMethod = getAuthMethod();
	if (authMethod === "oauth" || authMethod === "cli") {
		const authDescription = getAuthMethodDescription();
		console.log(`[ensureDb] Getting ${authDescription} database connection...`);
		try {
			const { getDb } = await import("./connection-pool-DfUGJLvO.mjs");
			const database = await getDb();
			console.log(`[ensureDb] ${authDescription} db connection obtained successfully`);
			return database;
		} catch (error) {
			console.error(`[ensureDb] Failed to get ${authDescription} connection:`, error);
			throw error;
		}
	}
	if (!db) {
		console.error("[ensureDb] DB is still null after initialization attempt!");
		throw new Error("Database connection could not be established");
	}
	return db;
}
async function saveChat({ id, userId, title, visibility, projectId }) {
	if (!isDatabaseAvailable()) {
		console.log("[saveChat] Database not available, skipping persistence");
		return;
	}
	try {
		return await (await ensureDb()).insert(chat).values({
			id,
			createdAt: /* @__PURE__ */ new Date(),
			userId,
			title,
			visibility,
			projectId: projectId || null
		});
	} catch (error) {
		console.error("[saveChat] Error saving chat:", error);
		throw new ChatSDKError("bad_request:database", "Failed to save chat");
	}
}
async function deleteChatById({ id }) {
	if (!isDatabaseAvailable()) {
		console.log("[deleteChatById] Database not available, skipping deletion");
		return null;
	}
	try {
		await (await ensureDb()).delete(message).where(eq(message.chatId, id));
		const [chatsDeleted] = await (await ensureDb()).delete(chat).where(eq(chat.id, id)).returning();
		return chatsDeleted;
	} catch (_error) {
		throw new ChatSDKError("bad_request:database", "Failed to delete chat by id");
	}
}
async function getChatsByUserId({ id, limit, startingAfter, endingBefore, projectId }) {
	if (!isDatabaseAvailable()) {
		console.log("[getChatsByUserId] Database not available, returning empty");
		return {
			chats: [],
			hasMore: false
		};
	}
	try {
		const extendedLimit = limit + 1;
		const query = async (whereCondition) => {
			const database = await ensureDb();
			let finalCondition = eq(chat.userId, id);
			if (projectId !== void 0) {
				const projectCondition = projectId === null ? sql`${chat.projectId} IS NULL` : eq(chat.projectId, projectId);
				finalCondition = and(finalCondition, projectCondition);
			}
			if (whereCondition) finalCondition = and(whereCondition, finalCondition);
			return database.select({
				id: chat.id,
				createdAt: chat.createdAt,
				title: chat.title,
				userId: chat.userId,
				projectId: chat.projectId,
				visibility: chat.visibility,
				lastContext: chat.lastContext
			}).from(chat).where(finalCondition).orderBy(desc(chat.createdAt)).limit(extendedLimit);
		};
		let filteredChats = [];
		if (startingAfter) {
			console.log("[getChatsByUserId] Fetching chat for startingAfter:", startingAfter);
			const [selectedChat] = await (await ensureDb()).select().from(chat).where(eq(chat.id, startingAfter)).limit(1);
			if (!selectedChat) throw new ChatSDKError("not_found:database", `Chat with id ${startingAfter} not found`);
			filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
		} else if (endingBefore) {
			console.log("[getChatsByUserId] Fetching chat for endingBefore:", endingBefore);
			const [selectedChat] = await (await ensureDb()).select().from(chat).where(eq(chat.id, endingBefore)).limit(1);
			if (!selectedChat) throw new ChatSDKError("not_found:database", `Chat with id ${endingBefore} not found`);
			filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
		} else {
			console.log("[getChatsByUserId] Executing main query without pagination");
			filteredChats = await query();
		}
		const hasMore = filteredChats.length > limit;
		console.log("[getChatsByUserId] Query successful, found", filteredChats.length, "chats");
		return {
			chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
			hasMore
		};
	} catch (error) {
		console.error("[getChatsByUserId] Error details:", error);
		console.error("[getChatsByUserId] Error stack:", error instanceof Error ? error.stack : "No stack available");
		throw new ChatSDKError("bad_request:database", "Failed to get chats by user id");
	}
}
async function getChatById({ id }) {
	if (!isDatabaseAvailable()) {
		console.log("[getChatById] Database not available, returning null");
		return null;
	}
	try {
		const [selectedChat] = await (await ensureDb()).select().from(chat).where(eq(chat.id, id));
		if (!selectedChat) return null;
		return selectedChat;
	} catch (_error) {
		throw new ChatSDKError("bad_request:database", "Failed to get chat by id");
	}
}
async function saveMessages({ messages }) {
	if (!isDatabaseAvailable()) {
		console.log("[saveMessages] Database not available, skipping persistence");
		return;
	}
	try {
		return await (await ensureDb()).insert(message).values(messages).onConflictDoUpdate({
			target: message.id,
			set: {
				parts: sql`excluded.parts`,
				attachments: sql`excluded.attachments`
			}
		});
	} catch (_error) {
		throw new ChatSDKError("bad_request:database", "Failed to save messages");
	}
}
async function getMessagesByChatId({ id }) {
	if (!isDatabaseAvailable()) {
		console.log("[getMessagesByChatId] Database not available, returning empty");
		return [];
	}
	try {
		return await (await ensureDb()).select().from(message).where(eq(message.chatId, id)).orderBy(asc(message.createdAt));
	} catch (_error) {
		throw new ChatSDKError("bad_request:database", "Failed to get messages by chat id");
	}
}
async function getMessageById({ id }) {
	if (!isDatabaseAvailable()) {
		console.log("[getMessageById] Database not available, returning empty");
		return [];
	}
	try {
		return await (await ensureDb()).select().from(message).where(eq(message.id, id));
	} catch (_error) {
		throw new ChatSDKError("bad_request:database", "Failed to get message by id");
	}
}
async function deleteMessagesByChatIdAfterTimestamp({ chatId, timestamp }) {
	if (!isDatabaseAvailable()) {
		console.log("[deleteMessagesByChatIdAfterTimestamp] Database not available, skipping deletion");
		return;
	}
	try {
		const messageIds = (await (await ensureDb()).select({ id: message.id }).from(message).where(and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)))).map((message$1) => message$1.id);
		if (messageIds.length > 0) return await (await ensureDb()).delete(message).where(and(eq(message.chatId, chatId), inArray(message.id, messageIds)));
	} catch (_error) {
		throw new ChatSDKError("bad_request:database", "Failed to delete messages by chat id after timestamp");
	}
}
async function updateChatVisiblityById({ chatId, visibility }) {
	if (!isDatabaseAvailable()) {
		console.log("[updateChatVisiblityById] Database not available, skipping update");
		return;
	}
	try {
		return await (await ensureDb()).update(chat).set({ visibility }).where(eq(chat.id, chatId));
	} catch (_error) {
		throw new ChatSDKError("bad_request:database", "Failed to update chat visibility by id");
	}
}
async function updateChatLastContextById({ chatId, context }) {
	if (!isDatabaseAvailable()) {
		console.log("[updateChatLastContextById] Database not available, skipping update");
		return;
	}
	try {
		return await (await ensureDb()).update(chat).set({ lastContext: context }).where(eq(chat.id, chatId));
	} catch (error) {
		console.warn("Failed to update lastContext for chat", chatId, error);
		return;
	}
}
async function saveFileUpload({ id, chatId, userId, filename, contentType, fileSize, storagePath, extractedContent, metadata }) {
	if (!isDatabaseAvailable()) {
		console.log("[saveFileUpload] Database not available, skipping save");
		return;
	}
	try {
		const [result] = await (await ensureDb()).insert(fileUpload).values({
			id,
			chatId: chatId || null,
			userId,
			filename,
			contentType,
			fileSize,
			storagePath: storagePath || null,
			extractedContent: extractedContent || null,
			metadata: metadata || {},
			createdAt: /* @__PURE__ */ new Date()
		}).returning();
		return result;
	} catch (error) {
		console.error("Failed to save file upload:", error);
		throw new ChatSDKError("bad_request:db", "Failed to save file upload");
	}
}
async function getFileUploadsByChatId({ chatId }) {
	if (!isDatabaseAvailable()) {
		console.log("[getFileUploadsByChatId] Database not available, returning empty array");
		return [];
	}
	try {
		return await (await ensureDb()).select().from(fileUpload).where(eq(fileUpload.chatId, chatId)).orderBy(desc(fileUpload.createdAt));
	} catch (error) {
		console.error("Failed to get file uploads:", error);
		return [];
	}
}
async function deleteFileUpload({ id }) {
	if (!isDatabaseAvailable()) {
		console.log("[deleteFileUpload] Database not available, skipping delete");
		return;
	}
	try {
		await (await ensureDb()).delete(fileUpload).where(eq(fileUpload.id, id));
	} catch (error) {
		console.error("Failed to delete file upload:", error);
		throw new ChatSDKError("bad_request:db", "Failed to delete file upload");
	}
}
async function createProject({ userId, name, description, color, icon, metadata }) {
	if (!isDatabaseAvailable()) {
		console.log("[createProject] Database not available, skipping");
		return null;
	}
	try {
		const [result] = await (await ensureDb()).insert(project).values({
			userId,
			name,
			description: description || null,
			color: color || null,
			icon: icon || null,
			metadata: metadata || {}
		}).returning();
		return result;
	} catch (error) {
		console.error("[createProject] Failed to create project:", error);
		throw new ChatSDKError("bad_request:database", "Failed to create project");
	}
}
async function getProjectsByUserId({ userId }) {
	if (!isDatabaseAvailable()) {
		console.log("[getProjectsByUserId] Database not available, returning empty");
		return [];
	}
	try {
		return await (await ensureDb()).select().from(project).where(eq(project.userId, userId)).orderBy(desc(project.createdAt));
	} catch (error) {
		console.error("[getProjectsByUserId] Failed to get projects:", error);
		return [];
	}
}
async function getProjectById({ id, userId }) {
	if (!isDatabaseAvailable()) {
		console.log("[getProjectById] Database not available, returning null");
		return null;
	}
	try {
		const [result] = await (await ensureDb()).select().from(project).where(and(eq(project.id, id), eq(project.userId, userId)));
		return result || null;
	} catch (error) {
		console.error("[getProjectById] Failed to get project:", error);
		return null;
	}
}
async function updateProject({ id, userId, name, description, color, icon, isActive, metadata }) {
	if (!isDatabaseAvailable()) {
		console.log("[updateProject] Database not available, skipping");
		return null;
	}
	try {
		const updateData = { updatedAt: /* @__PURE__ */ new Date() };
		if (name !== void 0) updateData.name = name;
		if (description !== void 0) updateData.description = description;
		if (color !== void 0) updateData.color = color;
		if (icon !== void 0) updateData.icon = icon;
		if (isActive !== void 0) updateData.isActive = isActive ? "true" : "false";
		if (metadata !== void 0) updateData.metadata = metadata;
		const [result] = await (await ensureDb()).update(project).set(updateData).where(and(eq(project.id, id), eq(project.userId, userId))).returning();
		return result || null;
	} catch (error) {
		console.error("[updateProject] Failed to update project:", error);
		throw new ChatSDKError("bad_request:database", "Failed to update project");
	}
}
async function deleteProject({ id, userId }) {
	if (!isDatabaseAvailable()) {
		console.log("[deleteProject] Database not available, skipping");
		return false;
	}
	try {
		await (await ensureDb()).delete(project).where(and(eq(project.id, id), eq(project.userId, userId)));
		return true;
	} catch (error) {
		console.error("[deleteProject] Failed to delete project:", error);
		throw new ChatSDKError("bad_request:database", "Failed to delete project");
	}
}
async function addChatToProject({ chatId, projectId, userId }) {
	if (!isDatabaseAvailable()) {
		console.log("[addChatToProject] Database not available, skipping");
		return false;
	}
	try {
		await (await ensureDb()).update(chat).set({ projectId }).where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
		return true;
	} catch (error) {
		console.error("[addChatToProject] Failed to add chat to project:", error);
		return false;
	}
}
async function removeChatFromProject({ chatId, userId }) {
	if (!isDatabaseAvailable()) {
		console.log("[removeChatFromProject] Database not available, skipping");
		return false;
	}
	try {
		await (await ensureDb()).update(chat).set({ projectId: null }).where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
		return true;
	} catch (error) {
		console.error("[removeChatFromProject] Failed to remove chat from project:", error);
		return false;
	}
}
async function getChatsByProjectId({ projectId, userId }) {
	if (!isDatabaseAvailable()) {
		console.log("[getChatsByProjectId] Database not available, returning empty");
		return [];
	}
	try {
		return await (await ensureDb()).select().from(chat).where(and(eq(chat.projectId, projectId), eq(chat.userId, userId))).orderBy(desc(chat.createdAt));
	} catch (error) {
		console.error("[getChatsByProjectId] Failed to get chats by project:", error);
		return [];
	}
}
async function addFileToProject({ projectId, fileId, userId }) {
	if (!isDatabaseAvailable()) {
		console.log("[addFileToProject] Database not available, skipping");
		return null;
	}
	try {
		const [result] = await (await ensureDb()).insert(projectFile).values({
			projectId,
			fileId,
			addedBy: userId
		}).returning();
		return result;
	} catch (error) {
		console.error("[addFileToProject] Failed to add file to project:", error);
		return null;
	}
}
async function getProjectFiles({ projectId }) {
	if (!isDatabaseAvailable()) {
		console.log("[getProjectFiles] Database not available, returning empty");
		return [];
	}
	try {
		return (await (await ensureDb()).select({ file: fileUpload }).from(projectFile).innerJoin(fileUpload, eq(projectFile.fileId, fileUpload.id)).where(eq(projectFile.projectId, projectId)).orderBy(desc(projectFile.addedAt))).map((r) => r.file);
	} catch (error) {
		console.error("[getProjectFiles] Failed to get project files:", error);
		return [];
	}
}
async function removeFileFromProject({ projectId, fileId }) {
	if (!isDatabaseAvailable()) {
		console.log("[removeFileFromProject] Database not available, skipping");
		return false;
	}
	try {
		await (await ensureDb()).delete(projectFile).where(and(eq(projectFile.projectId, projectId), eq(projectFile.fileId, fileId)));
		return true;
	} catch (error) {
		console.error("[removeFileFromProject] Failed to remove file from project:", error);
		return false;
	}
}
async function addProjectContext({ projectId, contextType, content }) {
	if (!isDatabaseAvailable()) {
		console.log("[addProjectContext] Database not available, skipping");
		return null;
	}
	try {
		const [result] = await (await ensureDb()).insert(projectContext).values({
			projectId,
			contextType,
			content
		}).returning();
		return result;
	} catch (error) {
		console.error("[addProjectContext] Failed to add project context:", error);
		return null;
	}
}
async function getProjectContexts({ projectId }) {
	if (!isDatabaseAvailable()) {
		console.log("[getProjectContexts] Database not available, returning empty");
		return [];
	}
	try {
		return await (await ensureDb()).select().from(projectContext).where(eq(projectContext.projectId, projectId)).orderBy(desc(projectContext.createdAt));
	} catch (error) {
		console.error("[getProjectContexts] Failed to get project contexts:", error);
		return [];
	}
}
async function updateProjectContext({ id, content }) {
	if (!isDatabaseAvailable()) {
		console.log("[updateProjectContext] Database not available, skipping");
		return null;
	}
	try {
		const [result] = await (await ensureDb()).update(projectContext).set({
			content,
			updatedAt: /* @__PURE__ */ new Date()
		}).where(eq(projectContext.id, id)).returning();
		return result || null;
	} catch (error) {
		console.error("[updateProjectContext] Failed to update project context:", error);
		return null;
	}
}
async function deleteProjectContext({ id }) {
	if (!isDatabaseAvailable()) {
		console.log("[deleteProjectContext] Database not available, skipping");
		return false;
	}
	try {
		await (await ensureDb()).delete(projectContext).where(eq(projectContext.id, id));
		return true;
	} catch (error) {
		console.error("[deleteProjectContext] Failed to delete project context:", error);
		return false;
	}
}

//#endregion
//#region ../packages/core/src/chat-acl.ts
/**
* Check if a user can access a chat based on visibility and ownership
*
* @param chatId - The ID of the chat to check access for
* @param userId - The ID of the user requesting access
* @returns ChatAccessResult indicating if access is allowed and why
*/
async function checkChatAccess(chatId, userId) {
	console.log(`checking chat access for chat ID: ${chatId} and user ID: ${userId}`);
	const chat$1 = await getChatById({ id: chatId });
	console.log(`chat: ${JSON.stringify(chat$1)}`);
	if (!chat$1) return {
		allowed: false,
		chat: null,
		reason: "not_found"
	};
	if (chat$1.visibility === "public") return {
		allowed: true,
		chat: chat$1
	};
	if (chat$1.visibility === "private") {
		console.log(`checking chat user ID vs user ID. chat user ID: ${chat$1.userId}, user ID: ${userId}`);
		if (chat$1.userId !== userId) return {
			allowed: false,
			chat: chat$1,
			reason: "forbidden"
		};
	}
	return {
		allowed: true,
		chat: chat$1
	};
}

//#endregion
//#region ../packages/core/src/stream-cache.ts
/**
* In-memory stream cache for resumable streams.
*
* This provides a simple in-memory alternative to Redis for stream resumption.
* Streams are stored with a TTL and automatically cleaned up.
*
* Note: This is not suitable for distributed deployments. For production
* with multiple instances, use Redis or another distributed cache.
*/
var StreamCache = class {
	cache = /* @__PURE__ */ new Map();
	activeStreams = /* @__PURE__ */ new Map();
	TTL_MS = 300 * 1e3;
	cleanupInterval = null;
	constructor() {
		console.log("[StreamCache] constructor");
		this.startCleanup();
	}
	startCleanup() {
		if (this.cleanupInterval) return;
		this.cleanupInterval = setInterval(() => {
			const now = Date.now();
			const expiredKeys = [];
			for (const [streamId, stream] of this.cache.entries()) if (now - stream.lastAccessedAt > this.TTL_MS) expiredKeys.push(streamId);
			for (const streamId of expiredKeys) {
				const stream = this.cache.get(streamId);
				if (stream) {
					this.activeStreams.delete(stream.chatId);
					this.clearStream(streamId);
					console.log(`[StreamCache] Expired stream ${streamId} for chat ${stream.chatId}`);
				}
			}
			if (expiredKeys.length > 0) console.log(`[StreamCache] Cleaned up ${expiredKeys.length} expired streams`);
		}, 60 * 1e3);
	}
	/**
	* Store a stream
	*/
	storeStream({ streamId, chatId, stream }) {
		console.log("[StreamCache] storeStream", streamId, chatId);
		this.activeStreams.set(chatId, streamId);
		const entry = {
			chatId,
			streamId,
			cache: makeCacheableStream({
				source: stream,
				onPush: () => {
					entry.lastAccessedAt = Date.now();
				}
			}),
			createdAt: Date.now(),
			lastAccessedAt: Date.now()
		};
		this.cache.set(streamId, entry);
	}
	/**
	* Get a stream (returns a Node.js Readable stream for direct use with Express)
	*/
	getStream(streamId, { cursor } = {}) {
		const cache = this.cache.get(streamId)?.cache;
		if (!cache) return null;
		return cacheableToReadable(cache, { cursor });
	}
	/**
	* Get the active stream ID for a chat
	*/
	getActiveStreamId(chatId) {
		return this.activeStreams.get(chatId) ?? null;
	}
	/**
	* Clear the active stream for a chat (e.g., when starting a new message)
	*/
	clearActiveStream(chatId) {
		const streamId = this.activeStreams.get(chatId);
		if (streamId) {
			this.activeStreams.delete(chatId);
			console.log(`[StreamCache] Cleared active stream ${streamId} for chat ${chatId}`);
		}
	}
	clearStream(streamId) {
		const stream = this.cache.get(streamId);
		if (stream) {
			stream.cache.close();
			this.cache.delete(streamId);
		}
	}
};
/**
* Turns an arbitrary `ReadableStream<T>` into a cache‑able
* async‑iterable.  All data is stored as T[].
*
* @param source The original readable stream you want to cache.
* @param onPush A callback to be called when a chunk is pushed to the stream.
* @returns An object matching the `CacheableStream` interface.
*/
function makeCacheableStream({ source, onPush }) {
	const chunks = [];
	let done = false;
	const waiters = [];
	const notify = () => {
		const current = [...waiters];
		waiters.length = 0;
		current.forEach((resolve) => resolve());
	};
	(async () => {
		const reader = source.getReader();
		try {
			while (true) {
				const { value, done: srcDone } = await reader.read();
				if (srcDone) break;
				chunks.push(value);
				onPush?.(value);
				notify();
			}
		} catch (err) {
			console.error("CacheableStream source error:", err);
		} finally {
			done = true;
			notify();
			reader.releaseLock();
		}
	})();
	return {
		get chunks() {
			return chunks;
		},
		async *read({ cursor } = {}) {
			let idx = cursor ?? 0;
			while (true) {
				while (idx < chunks.length) yield chunks[idx++];
				if (done) return;
				await new Promise((resolve) => waiters.push(resolve));
			}
		},
		close() {
			done = true;
			notify();
		}
	};
}
/**
* Turns a `CacheableStream<T>` into a Node.js `Readable` stream
*
* The stream pulls data from the cached async generator (`cache.read()`),
* honors backpressure, and is directly compatible with Express responses.
*
* Optimized for concurrent streams by:
* - Using non-blocking iteration
* - Batching multiple chunks when available
* - Avoiding blocking async/await in read()
*/
function cacheableToReadable(cache, { cursor } = {}) {
	let iterator;
	let pendingRead = null;
	let isReading = false;
	return new Readable({
		highWaterMark: 16 * 1024,
		read() {
			if (isReading) return;
			isReading = true;
			if (!iterator) iterator = cache.read({ cursor });
			const processNext = async () => {
				try {
					while (true) {
						if (!pendingRead) pendingRead = iterator?.next() ?? null;
						if (!pendingRead) break;
						const { value, done } = await pendingRead;
						pendingRead = null;
						if (done) {
							this.push(null);
							break;
						}
						if (!this.push(value)) break;
						pendingRead = iterator?.next() ?? null;
					}
				} catch (err) {
					this.destroy(err);
				} finally {
					isReading = false;
				}
			};
			processNext();
		},
		destroy(error, callback) {
			if (error) console.log("[StreamCache] Stream destroyed with error:", error.message);
			callback(error);
		}
	});
}

//#endregion
//#region ../packages/core/src/schemas/chat.ts
const textPartSchema = z.object({
	type: z.enum(["text"]),
	text: z.string().min(1)
});
const filePartSchema = z.object({
	type: z.enum(["file"]),
	mediaType: z.enum(["image/jpeg", "image/png"]),
	name: z.string().min(1),
	url: z.string().url()
});
const partSchema = z.union([textPartSchema, filePartSchema]);
const previousMessageSchema = z.object({
	id: z.string().uuid(),
	role: z.enum([
		"user",
		"assistant",
		"system"
	]),
	parts: z.array(z.any())
});
const postRequestBodySchema = z.object({
	id: z.string().uuid(),
	message: z.object({
		id: z.string().uuid(),
		role: z.enum(["user"]),
		parts: z.array(partSchema)
	}).optional(),
	selectedChatModel: z.string().min(1),
	selectedVisibilityType: z.enum(["public", "private"]),
	previousMessages: z.array(previousMessageSchema).optional(),
	projectId: z.string().uuid().nullable().optional()
});

//#endregion
//#region ../packages/core/src/ai/providers.ts
async function getServerProvider() {
	const { getDatabricksServerProvider } = await import("./src-DjE_7B9M.mjs");
	return getDatabricksServerProvider();
}
let cachedServerProvider = null;
const myProvider = { async languageModel(id) {
	if (!cachedServerProvider) cachedServerProvider = await getServerProvider();
	return await cachedServerProvider.languageModel(id);
} };

//#endregion
export { updateChatVisiblityById as A, getProjectsByUserId as C, saveFileUpload as D, saveChat as E, ChatSDKError as F, getMessageByErrorCode as I, updateProjectContext as M, convertToUIMessages as N, saveMessages as O, generateUUID as P, getProjectFiles as S, removeFileFromProject as T, getFileUploadsByChatId as _, addChatToProject as a, getProjectById as b, createProject as c, deleteMessagesByChatIdAfterTimestamp as d, deleteProject as f, getChatsByUserId as g, getChatsByProjectId as h, checkChatAccess as i, updateProject as j, updateChatLastContextById as k, deleteChatById as l, getChatById as m, postRequestBodySchema as n, addFileToProject as o, deleteProjectContext as p, StreamCache as r, addProjectContext as s, myProvider as t, deleteFileUpload as u, getMessageById as v, removeChatFromProject as w, getProjectContexts as x, getMessagesByChatId as y };