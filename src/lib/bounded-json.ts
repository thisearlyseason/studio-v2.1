export class RequestBodyError extends Error {
  readonly status: number;

  constructor(
    message: string,
    status = 400
  ) {
    super(message);
    this.status = status;
  }
}

export async function readJsonBodyWithLimit<T>(
  request: Request,
  maxBytes: number
): Promise<T> {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyError('Request body too large.', 413);
  }
  if (!request.body) {
    throw new RequestBodyError('Request body is required.', 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new RequestBodyError('Request body too large.', 413);
    }
    chunks.push(value);
  }

  const body = Buffer.concat(chunks, totalBytes).toString('utf8');
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new RequestBodyError('Request body must be valid JSON.', 400);
  }
}
