# Fix Straico API Integration (v2)

## Problem
The Straico API returns `Unprocessable Entity: The daily API limit for spending coins has been reached` despite the user having 500,000 tokens. The actual issue is the code uses the wrong API endpoint (`v1/chat/completions`) and likely incorrect request/response format.

## File to Modify
- `src/lib/straico.ts`

## Changes

### 1. Update API Endpoint (line 13)
```typescript
// Before
const STRAICO_ENDPOINT = 'https://api.straico.com/v1/chat/completions';
// After
const STRAICO_ENDPOINT = 'https://api.straico.com/v2/chat';
```

### 2. Update Request Body (lines 46-49)
```typescript
// Before
body: JSON.stringify({
  models: [model],
  messages: [{ role: 'user', content: prompt }],
}),

// After
body: JSON.stringify({
  model: model,
  messages: [{ role: 'user', content: prompt }],
  temperature: 0.7,
}),
```

### 3. Update Response Parsing (lines 62-69)
```typescript
// Before
const chatCompletion = json?.data?.completions?.[model]?.completion;
const text = chatCompletion?.choices?.[0]?.message?.content;

// After
const text = json?.data?.completion;
```

### 4. Add Comprehensive Logging
Add `console.log` for:
- Request being sent (model, prompt length)
- Response status code
- Full error response body on failure
- Full response body on success

### 5. Improve Error Handling
- Parse error response to distinguish quota errors from format errors
- Provide more specific error messages

## Verification
1. Run `npm run dev` or `next dev`
2. Test the `/api/straico-code` endpoint with a simple prompt
3. Check server logs for request/response details
4. Verify the response is correctly parsed
