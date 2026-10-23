import { createServer, type Server } from "node:http"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { ChatApiError, completeChat } from "../src/features/chat/api"
import type { CompletionOptions } from "../src/features/chat/types"

let server: Server
let baseUrl = ""

function requestOptions(
	path: string,
	overrides: Partial<CompletionOptions> = {}
): CompletionOptions {
	return {
		endpoint: `${baseUrl}${path}`,
		model: "test-model",
		messages: [{ role: "user", content: "Hello" }],
		temperature: 0.2,
		maxTokens: 100,
		timeoutMs: 3000,
		retryCount: 0,
		streaming: true,
		...overrides,
	}
}

beforeAll(async () => {
	vi.stubGlobal("window", {
		setTimeout: globalThis.setTimeout,
		clearTimeout: globalThis.clearTimeout,
	})

	server = createServer((request, response) => {
		const url = request.url ?? ""
		if (url.startsWith("/auth/v1/chat/completions")) {
			response.writeHead(401, { "Content-Type": "application/json" })
			response.end(JSON.stringify({ error: { message: "Invalid key" } }))
			return
		}

		if (url.startsWith("/broken/v1/chat/completions")) {
			response.writeHead(200, { "Content-Type": "text/event-stream" })
			response.write(
				'data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n'
			)
			globalThis.setTimeout(() => response.destroy(), 10)
			return
		}

		response.writeHead(200, { "Content-Type": "text/event-stream" })
		response.write(
			'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'
		)
		response.write(
			'data: {"choices":[{"delta":{"content":" world"}}]}\n\n'
		)
		response.write(
			'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n'
		)
		response.end("data: [DONE]\n\n")
	})

	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", () => resolve())
	})
	const address = server.address()
	if (!address || typeof address === "string") {
		throw new Error("Test server did not expose a TCP port")
	}
	baseUrl = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()))
	})
	vi.unstubAllGlobals()
})

describe("OpenAI-compatible streaming", () => {
	it("collects deltas and final usage", async () => {
		const deltas: string[] = []
		const result = await completeChat(
			requestOptions("/stream", {
				onDelta: (delta) => deltas.push(delta),
			})
		)

		expect(deltas).toEqual(["Hello", " world"])
		expect(result.content).toBe("Hello world")
		expect(result.usage).toEqual({
			promptTokens: 3,
			completionTokens: 2,
			totalTokens: 5,
		})
	})

	it("surfaces authentication failures without retrying", async () => {
		await expect(
			completeChat(requestOptions("/auth", { retryCount: 2 }))
		).rejects.toMatchObject<Partial<ChatApiError>>({
			status: 401,
			retryable: false,
			message: "Invalid key",
		})
	})

	it("does not retry after a partial stream was emitted", async () => {
		const deltas: string[] = []
		await expect(
			completeChat(
				requestOptions("/broken", {
					retryCount: 2,
					onDelta: (delta) => deltas.push(delta),
				})
			)
		).rejects.toBeInstanceOf(Error)

		expect(deltas).toEqual(["Partial"])
	})
})
