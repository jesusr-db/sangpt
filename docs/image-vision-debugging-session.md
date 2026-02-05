# Image Vision Debugging Session

## Executive Summary

**Problem:** When users upload images to the chatbot and ask vision-capable models to analyze them, the model reports it "cannot see the image" even when base64 data is properly present in the system.

**Root Cause:** The `@databricks/ai-sdk-provider` package (originally version 0.2.0) was stripping `ImagePart` content during the conversion from Vercel AI SDK format to OpenAI API format. The image data exists correctly in the application layer but disappears when the request is actually sent to the Databricks serving endpoint.

**Status:** Upgraded to `@databricks/ai-sdk-provider@0.4.1` but still failing. Deeper investigation needed to determine if the Databricks AI SDK provider supports vision/multimodal inputs at all.

---

## Investigation Timeline

### Attempt 1: Add mediaType to ImagePart

**Status:** IMPLEMENTED - FAILED

**Hypothesis:** The Vercel AI SDK might require the `mediaType` property on `ImagePart` objects for proper conversion.

**File Modified:** `server/src/services/file-processor.ts`

**Lines:** 213-217

**Code Change:**
```typescript
// Before
return [
  {
    type: 'image',
    image: `data:${file.contentType};base64,${file.base64Content}`,
  },
];

// After
return [
  {
    type: 'image',
    image: `data:${file.contentType};base64,${file.base64Content}`,
    mediaType: file.contentType as
      | 'image/jpeg'
      | 'image/png'
      | 'image/gif'
      | 'image/webp',
  },
];
```

**Result:** No effect. The model still reported it could not see the uploaded image.

---

### Attempt 2: Add OCR-Focused System Prompt

**Status:** IMPLEMENTED - FAILED

**Hypothesis:** Perhaps the model needed explicit instructions to perform OCR/text extraction on images.

**File Modified:** `server/src/routes/chat.ts`

**Lines:** 361-368

**Code Change:**
```typescript
// Add OCR-focused system prompt when images are present
if (hasImages) {
  systemMessages.push({
    role: 'system',
    content:
      'When analyzing images containing text, carefully extract and transcribe all visible text content. Pay close attention to small text, headers, labels, and UI elements. If text is unclear, describe what you can see.',
  });
}
```

**Result:** The system prompt was successfully added to the message array, but the model still couldn't see the image. The prompt itself was working correctly, but without image visibility it was meaningless.

---

### Attempt 3: Add Diagnostic Logging

**Status:** IMPLEMENTED - REVEALED THE BUG

**Hypothesis:** Need to trace where the image data is lost between injection and API call.

**Files Modified:**

1. **`server/src/routes/chat.ts`**
   - Lines 335, 341-358: Session file lookup and image status logging
   - Lines 429-433: User message content structure after image injection

2. **`server/src/routes/files.ts`**
   - Lines 97-104: Upload logging for image files

3. **`packages/ai-sdk-providers/src/databricks-foundation-provider.ts`**
   - Lines 182-217: Detailed API request logging with message structure analysis

**Key Diagnostic Code in `databricks-foundation-provider.ts`:**
```typescript
// Detailed logging for debugging image/vision issues
const messagesSummary = requestBody.messages?.map(
  (msg: { role: string; content: unknown }) => {
    if (typeof msg.content === 'string') {
      return {
        role: msg.role,
        contentType: 'string',
        length: msg.content.length,
      };
    }
    if (Array.isArray(msg.content)) {
      return {
        role: msg.role,
        contentType: 'array',
        parts: msg.content.map(
          (part: { type: string; image_url?: unknown }) => ({
            type: part.type,
            hasImageUrl: !!part.image_url,
          }),
        ),
      };
    }
    return { role: msg.role, contentType: typeof msg.content };
  },
);
```

**Key Diagnostic Code in `chat.ts`:**
```typescript
// Debug: Log the actual message structure after injection
const injectedMsg = messagesForModel[lastUserMsgIndex];
const injectedContent = injectedMsg.content;
console.log('[Chat] User message content after injection:', {
  contentType: typeof injectedContent,
  isArray: Array.isArray(injectedContent),
  partCount: Array.isArray(injectedContent)
    ? injectedContent.length
    : 'N/A',
  partTypes: Array.isArray(injectedContent)
    ? injectedContent.map((p: { type: string }) => p.type)
    : 'N/A',
});
```

**Result:** This revealed the critical bug! The logging showed:

**Log 1 - After Injection (chat.ts):**
```json
{
  "contentType": "object",
  "isArray": true,
  "partCount": 2,
  "partTypes": ["image", "text"]
}
```
This confirms the image part EXISTS correctly in the application layer.

**Log 2 - In API Request (databricks-foundation-provider.ts):**
```json
{
  "messagesSummary": [{
    "role": "user",
    "contentType": "array",
    "parts": [{"type": "text", "hasImageUrl": false}]
  }]
}
```
This shows the image part is MISSING when the request is actually sent to Databricks.

**Conclusion:** The `@databricks/ai-sdk-provider` library is converting the messages and stripping out `ImagePart` content somewhere in its conversion process.

---

### Attempt 4: Upgrade @databricks/ai-sdk-provider

**Status:** IMPLEMENTED - STILL FAILING

**Hypothesis:** The version 0.2.0 might not support image parts, but a newer version might.

**File Modified:** `packages/ai-sdk-providers/package.json`

**Change:**
```json
// Before
"@databricks/ai-sdk-provider": "^0.2.0"

// After
"@databricks/ai-sdk-provider": "^0.4.1"
```

**Installation Command:**
```bash
npm install --legacy-peer-deps
```

Note: The `--legacy-peer-deps` flag was required due to peer dependency conflicts with the `ai` package versions.

**Result:** The upgrade completed successfully, but the image vision feature still fails. The newer version (0.4.1) still appears to not support `ImagePart` conversion to OpenAI's `image_url` format.

---

## Key Diagnostic Evidence

### Evidence 1: Image Present After Injection

Location: `server/src/routes/chat.ts` (post-injection logging)

```json
{
  "contentType": "object",
  "isArray": true,
  "partCount": 2,
  "partTypes": ["image", "text"]
}
```

This proves the image data is correctly:
1. Stored in session memory
2. Retrieved as content parts
3. Injected into the user message

### Evidence 2: Image MISSING in API Request

Location: `packages/ai-sdk-providers/src/databricks-foundation-provider.ts` (request logging)

```json
{
  "messagesSummary": [{
    "role": "user",
    "contentType": "array",
    "parts": [{"type": "text", "hasImageUrl": false}]
  }]
}
```

This proves the image data is lost during the conversion from Vercel AI SDK format to OpenAI API format within the `@databricks/ai-sdk-provider` library.

### Evidence 3: Session Memory Contains Valid Image Data

Location: `server/src/routes/files.ts` and `server/src/routes/chat.ts`

```
[FileUpload] Image stored in session memory: {
  chatId: "xxx",
  fileId: "xxx",
  filename: "image.png",
  hasBase64: true,
  base64Length: 123456
}
```

This confirms the base64 image data is correctly processed and stored.

---

## Files Modified During Session

| File | Purpose | Changes |
|------|---------|---------|
| `server/src/services/file-processor.ts` | File processing | Added `mediaType` property to ImagePart (lines 213-217) |
| `server/src/routes/chat.ts` | Chat endpoint | OCR system prompt (361-368), session/injection logging (335, 341-358, 429-433) |
| `server/src/routes/files.ts` | File upload endpoint | Image upload diagnostic logging (lines 97-104) |
| `packages/ai-sdk-providers/src/databricks-foundation-provider.ts` | Databricks API calls | Detailed API request logging with message structure (lines 182-217) |
| `packages/ai-sdk-providers/package.json` | Package dependencies | Upgraded @databricks/ai-sdk-provider from 0.2.0 to 0.4.1 |

---

## Remaining Investigation Needed

### 1. Verify Provider Support for Vision

Check if `@databricks/ai-sdk-provider` supports vision/multimodal inputs at all:
- Review the library source code or documentation
- Look for `image_url` or `ImagePart` handling in the conversion logic
- Check if there's a specific configuration or model type required

### 2. Consider Alternative Providers

If the Databricks provider doesn't support vision:
- Use `@ai-sdk/openai-compatible` provider directly
- Implement a custom provider that properly converts ImagePart to OpenAI format
- Manually construct the API request with correct image_url format

### 3. Verify Endpoint Support

Confirm the Databricks serving endpoint supports vision inputs:
- Check if the deployed model (e.g., `databricks-meta-llama-3-2-90b-vision-instruct`) accepts multimodal inputs
- Verify the API format expected by Databricks serving endpoints for vision
- Test with a direct API call (curl) to isolate the issue

### 4. Expected OpenAI Vision Format

The API request should look like this for vision models:
```json
{
  "messages": [{
    "role": "user",
    "content": [
      {
        "type": "image_url",
        "image_url": {
          "url": "data:image/png;base64,..."
        }
      },
      {
        "type": "text",
        "text": "What's in this image?"
      }
    ]
  }]
}
```

Currently, the `image` part is being dropped entirely, suggesting the provider either:
1. Doesn't recognize the Vercel AI SDK `ImagePart` type
2. Intentionally filters it out
3. Has a bug in the conversion logic

---

## Recommendations

1. **Short-term Fix:** Manually construct the API request with proper `image_url` format, bypassing the SDK's conversion logic

2. **Medium-term:** Fork or patch `@databricks/ai-sdk-provider` to support ImagePart conversion

3. **Long-term:** File an issue with Databricks to add vision support to their AI SDK provider, or use `@ai-sdk/openai-compatible` with a custom fetch handler

---

---

## Additional Fix Attempts (2026-02-05)

### Attempt 5: Use FilePart Instead of ImagePart

**Status:** IMPLEMENTED - FAILED

**Hypothesis:** The Databricks FMAPI provider's `convertUserMessage` function only handles `type: 'file'` parts, not `type: 'image'` parts.

**File Modified:** `server/src/services/file-processor.ts`

**Code Change:**
```typescript
// Before (ImagePart format)
return [
  {
    type: 'image',
    image: `data:${file.contentType};base64,${file.base64Content}`,
    mediaType: file.contentType,
  },
];

// After (FilePart format)
return [
  {
    type: 'file',
    data: `data:${file.contentType};base64,${file.base64Content}`,
    mediaType: file.contentType,
  },
];
```

**Result:** Failed. The Vercel AI SDK accepted the FilePart format, but the provider's `toHttpUrlString` function only accepts HTTP/HTTPS URLs, returning `null` for data URLs and silently dropping the image.

---

### Attempt 6: Patch @databricks/ai-sdk-provider with patch-package

**Status:** IMPLEMENTED - FAILED (patch not applied on Databricks Apps)

**Hypothesis:** Patch the provider's `toHttpUrlString` function to accept data URLs, and fix the output format to match OpenAI's vision API.

**Changes Made:**
1. Installed `patch-package` as dev dependency
2. Added `postinstall` script to package.json
3. Created patch file at `patches/@databricks+ai-sdk-provider+0.2.1.patch`

**Patch Contents:**
```diff
@@ -1640,8 +1640,8 @@ const convertUserMessage = (message) => {
 			if (part.mediaType.startsWith("image/")) {
 				const url = toHttpUrlString(part.data);
 				if (url) content.push({
-					type: "image",
-					image_url: url
+					type: "image_url",
+					image_url: {url: url}
 				});
 			}
@@ -1714,6 +1714,7 @@ const toHttpUrlString = (data) => {
 	if (data instanceof URL) return data.toString();
 	if (typeof data === "string") {
 		if (data.startsWith("http://") || data.startsWith("https://")) return data;
+		if (data.startsWith("data:")) return data;
 	}
 	return null;
```

**Result:** Patch works locally but fails on Databricks Apps deployment. The `postinstall` script doesn't run correctly during the app's `npm install` phase, so the provider remains unpatched.

**Additional Config:** Added `sync.include: patches/**` to `databricks.yml` to ensure patches folder is uploaded.

---

### Attempt 7: Custom image_url Type (Bypass SDK Validation)

**Status:** IMPLEMENTED - FAILED

**Hypothesis:** Create a custom type that matches the exact Databricks FMAPI format and inject it directly.

**File Modified:** `server/src/services/file-processor.ts`

**Code Change:**
```typescript
// Custom type for Databricks FMAPI image format
export interface DatabricksImagePart {
  type: 'image_url';
  image_url: { url: string };
}

static toContentParts(file: ProcessedFile): FileContentPart[] {
  if (FileProcessor.isImageFile(file.filename) && file.base64Content) {
    return [
      {
        type: 'image_url',
        image_url: {
          url: `data:${file.contentType};base64,${file.base64Content}`,
        },
      },
    ];
  }
  // ...
}
```

**Result:** Failed with AI SDK validation error:
```
AI_TypeValidationError: Invalid input: expected "text" | "image" | "file"
```

The Vercel AI SDK validates message content types and rejects unknown types like `image_url`. The SDK only accepts `text`, `image`, or `file` types.

---

### Attempt 8: Transform Images in Custom Fetch Wrapper

**Status:** IMPLEMENTED - FAILED

**Hypothesis:** Intercept the fetch request and transform the image format after the SDK processes it but before it's sent to Databricks.

**File Modified:** `packages/ai-sdk-providers/src/providers-server.ts`

**Code Added:**
```typescript
// Transform image content parts from SDK format to Databricks FMAPI format
function transformImageContent(body: any): any {
  if (!body?.messages) return body;

  const transformedMessages = body.messages.map((msg: any) => {
    if (!msg.content || !Array.isArray(msg.content)) return msg;

    const transformedContent = msg.content.map((part: any) => {
      // Transform SDK image format to Databricks FMAPI format
      if (part.type === 'image' && typeof part.image_url === 'string') {
        return {
          type: 'image_url',
          image_url: { url: part.image_url },
        };
      }
      return part;
    });

    return { ...msg, content: transformedContent };
  });

  return { ...body, messages: transformedMessages };
}
```

**Result:** Failed. The transformation function was added to `databricksFetch`, but the image parts are stripped BEFORE the fetch is called. The provider's internal `doStream`/`doGenerate` methods convert messages using their own functions, which drop file/image parts before invoking fetch.

---

### Attempt 9: Add Transform to Foundation Provider Fetch

**Status:** IMPLEMENTED - FAILED

**Hypothesis:** The Foundation Model provider has its own fetch function separate from `databricksFetch`. Add the transform there.

**File Modified:** `packages/ai-sdk-providers/src/databricks-foundation-provider.ts`

**Code Added:** Same `transformImageContent` function, applied in the Foundation provider's custom fetch.

**Result:** Failed. Same issue - the provider converts messages internally before calling fetch. By the time our custom fetch receives the request body, the image parts have already been stripped out.

**Evidence from logs:**
```
[Chat] Messages for model (before streamText):
  user: 2 parts - types: file, text
    file part: mediaType=image/jpeg, dataLength=184703

[Foundation] Request: {
  "messagesSummary": [{
    "role": "user",
    "parts": [{"type": "text", "hasImageUrl": false}]
  }]
}
```

The image IS present before `streamText` is called (184KB of data), but the Foundation request shows only text with no image.

---

## Additional Issue Discovered: Volume Upload Failing

**Status:** BROKEN

The Unity Catalog Volume upload is failing with:
```
Invalid input: RPC GetVolume Field managedcatalog.volume.GetVolume.full_name_arg:
name is not a valid name. Valid names must contain only alphanumeric characters
and underscores...
```

**Root Cause:** The `VOLUME_NAME` environment variable is set to `${resources.volumes.chatbot_files.name}` in `databricks.yml`, but this DAB variable is not being resolved when passed to the app. The literal string `${resources.volumes.chatbot_files.name}` is being used in the path.

**Evidence:**
```
[VolumeStorage] Uploading file to: /Volumes/jmr_demo/default/${resources.volumes.chatbot_files.name}/chats/.../test_image.jpg
```

---

## Current Understanding

### Why Images Don't Work

1. **SDK Type Validation:** Vercel AI SDK only accepts `text`, `image`, or `file` types - not custom formats
2. **Provider Conversion:** The `@databricks/ai-sdk-provider` converts messages INSIDE its `doStream`/`doGenerate` methods before calling fetch
3. **toHttpUrlString Filter:** The provider's `toHttpUrlString` function only accepts HTTP/HTTPS URLs, returning `null` for data URLs
4. **Timing Issue:** Our fetch wrapper can't transform images because they're already stripped before fetch is called

### The Provider's Internal Flow

```
streamText(messages)
  → provider.doStream(messages)
    → convertMessages(messages)     ← Images stripped here!
      → toHttpUrlString(data)       ← Returns null for data URLs
    → fetch(transformedRequest)     ← Our wrapper sees no images
```

---

## Potential Solutions Not Yet Tried

### 1. Fork @databricks/ai-sdk-provider
Clone the package into the repo and fix `toHttpUrlString` directly.

### 2. Use @ai-sdk/openai-compatible
Bypass the Databricks provider entirely and use the generic OpenAI-compatible provider with proper configuration.

### 3. Direct API Call
For vision requests, skip the AI SDK entirely and make a direct `fetch` call to the Databricks endpoint with the correct format.

### 4. Custom Language Model
Implement a custom `LanguageModelV2` that handles image conversion correctly before delegating to the underlying provider.

---

## Session Metadata

- **Date:** 2026-02-04, 2026-02-05
- **Provider Version Tested:** 0.2.0 → 0.4.1
- **AI SDK Version:** 5.0.76
- **Models Tested:** databricks-gpt-5-2, Vision-capable Llama 3.2 models
