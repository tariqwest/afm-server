// ============================================================================
// FmSocketClient.test.ts — Basic tests for UDS HTTP transport
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FmSocketClient } from "../../src/fm/FmSocketClient.js";
import { createServer, type Server, type Socket } from "node:net";
import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("FmSocketClient", () => {
  let server: Server;
  let socketPath: string;
  let lastRequest: { method: string; path: string; body: string } | null = null;

  beforeAll(async () => {
    socketPath = join(tmpdir(), `fm-test-${Date.now()}.sock`);
    
    server = createServer((socket: Socket) => {
      let buffer = Buffer.alloc(0);
      
      socket.on("data", (data: Buffer) => {
        buffer = Buffer.concat([buffer, data]);
        
        // Check for complete HTTP request (double CRLF)
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) return;
        
        const headerText = buffer.subarray(0, headerEnd).toString("utf-8");
        const lines = headerText.split("\r\n");
        const [method, path] = lines[0].split(" ");
        
        // Parse Content-Length
        let contentLength = 0;
        for (const line of lines.slice(1)) {
          if (line.toLowerCase().startsWith("content-length:")) {
            contentLength = parseInt(line.split(":")[1].trim(), 10);
            break;
          }
        }
        
        const bodyStart = headerEnd + 4;
        if (buffer.length < bodyStart + contentLength) return;
        
        const body = buffer.subarray(bodyStart, bodyStart + contentLength).toString("utf-8");
        lastRequest = { method, path, body };
        
        // Send HTTP response
        const responseBody = JSON.stringify({ success: true });
        const response = `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${responseBody.length}\r\n\r\n${responseBody}`;
        socket.write(response);
        socket.end();
      });
    });

    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      unlinkSync(socketPath);
    } catch {
      // Ignore
    }
  });

  it("connects to Unix socket and sends HTTP request", async () => {
    const client = new FmSocketClient(socketPath);
    await client.connect();
    
    const response = await client.request("POST", "/test", { hello: "world" });
    
    expect(response.statusCode).toBe(200);
    expect(lastRequest?.method).toBe("POST");
    expect(lastRequest?.path).toBe("/test");
    expect(JSON.parse(lastRequest?.body || "")).toEqual({ hello: "world" });
    
    client.close();
  });

  it("parses JSON response body", async () => {
    const client = new FmSocketClient(socketPath);
    await client.connect();
    
    const response = await client.request("GET", "/test");
    const body = JSON.parse(response.body.toString("utf-8"));
    
    expect(body).toEqual({ success: true });
    
    client.close();
  });
});
