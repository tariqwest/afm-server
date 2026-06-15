// ============================================================================
// UDSHTTPParser.ts — Minimal HTTP/1.1 response parser for Unix Domain Socket
// transport. Handles chunked transfer encoding and Content-Length responses.
// ============================================================================

export interface HTTPResponse {
  statusCode: number;
  headers: Map<string, string>;
  body: Buffer;
}

export class HTTPParser {
  private buffer = Buffer.alloc(0);
  private state: "headers" | "body" = "headers";
  private contentLength = 0;
  private chunked = false;
  private headers = new Map<string, string>();
  private statusCode = 0;
  private bodyChunks: Buffer[] = [];
  private chunkSize = 0;
  private chunkState: "size" | "data" | "trailers" = "size";
  private finished = false;

  feed(data: Buffer): HTTPResponse | null {
    this.buffer = Buffer.concat([this.buffer, data]);

    while (!this.finished && this.buffer.length > 0) {
      if (this.state === "headers") {
        const headerEnd = this.buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) return null;

        const headerText = this.buffer.subarray(0, headerEnd).toString("utf-8");
        this.buffer = this.buffer.subarray(headerEnd + 4);

        const lines = headerText.split("\r\n");
        const statusLine = lines[0];
        if (!statusLine) return null;
        const statusMatch = statusLine.match(/HTTP\/1\.\d (\d+)/);
        this.statusCode = statusMatch?.[1] ? parseInt(statusMatch[1], 10) : 0;

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line) continue;
          const colonIdx = line.indexOf(":");
          if (colonIdx !== -1) {
            const key = line.slice(0, colonIdx).trim().toLowerCase();
            const value = line.slice(colonIdx + 1).trim();
            this.headers.set(key, value);
          }
        }

        const cl = this.headers.get("content-length");
        if (cl) {
          this.contentLength = parseInt(cl, 10);
          this.state = "body";
        } else if (this.headers.get("transfer-encoding") === "chunked") {
          this.chunked = true;
          this.state = "body";
        } else {
          // No body
          this.finished = true;
          return {
            statusCode: this.statusCode,
            headers: this.headers,
            body: Buffer.alloc(0),
          };
        }
      }

      if (this.state === "body") {
        if (!this.chunked) {
          if (this.buffer.length >= this.contentLength) {
            const body = this.buffer.subarray(0, this.contentLength);
            this.finished = true;
            return {
              statusCode: this.statusCode,
              headers: this.headers,
              body,
            };
          }
          return null;
        }

        // Chunked encoding
        while (this.buffer.length > 0) {
          if (this.chunkState === "size") {
            const lineEnd = this.buffer.indexOf("\r\n");
            if (lineEnd === -1) return null;

            const sizeLine = this.buffer.subarray(0, lineEnd).toString("utf-8");
            this.buffer = this.buffer.subarray(lineEnd + 2);

            const sizeHex = sizeLine.split(";")[0]?.trim();
            this.chunkSize = sizeHex ? parseInt(sizeHex, 16) : 0;

            if (this.chunkSize === 0) {
              this.chunkState = "trailers";
            } else {
              this.chunkState = "data";
            }
          }

          if (this.chunkState === "data") {
            if (this.buffer.length < this.chunkSize + 2) return null;

            const chunk = this.buffer.subarray(0, this.chunkSize);
            this.bodyChunks.push(chunk);
            this.buffer = this.buffer.subarray(this.chunkSize + 2); // +2 for \r\n
            this.chunkState = "size";
          }

          if (this.chunkState === "trailers") {
            // Consume final \r\n
            if (this.buffer.length < 2) return null;
            this.buffer = this.buffer.subarray(2);

            this.finished = true;
            return {
              statusCode: this.statusCode,
              headers: this.headers,
              body: Buffer.concat(this.bodyChunks),
            };
          }
        }
        return null;
      }
    }

    return null;
  }
}

export function serializeRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: Buffer | string,
): Buffer {
  const headerLines = [`${method} ${path} HTTP/1.1`];
  for (const [key, value] of Object.entries(headers)) {
    headerLines.push(`${key}: ${value}`);
  }
  if (body) {
    const len = typeof body === "string" ? Buffer.byteLength(body) : body.length;
    headerLines.push(`Content-Length: ${len}`);
  }
  headerLines.push("", "");

  const headerBuf = Buffer.from(headerLines.join("\r\n"), "utf-8");
  if (body) {
    const bodyBuf = typeof body === "string" ? Buffer.from(body, "utf-8") : body;
    return Buffer.concat([headerBuf, bodyBuf]);
  }
  return headerBuf;
}
