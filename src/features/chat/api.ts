import { fetch as tauriFetch } from "@tauri-apps/plugin-http"
import { normalizeUsage } from "./domain"
import type {
	ChatApiMessage,
	CompletionOptions,
	CompletionResult,
	CompletionUsage,
} from "./types"
import { resolveCompletionUrl } from "./validation"

interface CompletionPayload {
	model?: string
	choices?: Array<{
		message?: { content?: string | null }
		delta?: { content?: string | null }
		finish_reason?: string | null
	}>
	usage?: {
		prompt_tokens?: number
		completion_tokens?: number
		total_tokens?: number
	}
	error?: {
		message?: string
		type?: string
	}
}

export class ChatApiError extends Error {
	status?: number
	retryable: boolean

	constructor(message: string, status?: number, retryable = false) {
		super(message)
		this.name = "ChatApiError"
		this.status = status
		this.retryable = retryable
	}
}

function isTauriRuntime(): boolean {
	return "__TAURI_INTERNALS__" in window
}

async function request(
	url: string,
	init: RequestInit
): Promise<Response> {
	return isTauriRuntime() ? tauriFetch(url, init) : fetch(url, init)
}

function createTimeoutSignal(
	timeoutMs: number,
	external?: AbortSignal
): { signal: AbortSignal; cleanup: () => void } {
	const controller = new AbortController()
	const timeout = window.setTimeout(() => {
		controller.abort(new DOMException("Request timed out", "TimeoutError"))
	}, Math.max(1000, timeoutMs))

	const abortFromExternal = () => controller.abort(external?.reason)
	if (external) {
		if (external.aborted) abortFromExternal()
		else external.addEventListener("abort", abortFromExternal, { once: true })
	}

	return {
		signal: controller.signal,
		cleanup: () => {
			window.clearTimeout(timeout)
			external?.removeEventListener("abort", abortFromExternal)
		},
	}
}

function parseUsage(payload: CompletionPayload): CompletionUsage {
	return normalizeUsage({
		promptTokens: payload.usage?.prompt_tokens,
		completionTokens: payload.usage?.completion_tokens,
		totalTokens: payload.usage?.total_tokens,
	})
}

function errorFromResponse(status: number, body: string): ChatApiError {
	let message = body.trim()
	try {
		const parsed = JSON.parse(body) as CompletionPayload
		message = parsed.error?.message || message
	} catch {
		// Keep the raw response when the server does not return JSON.
	}
	return new ChatApiError(
		message || `Chat request failed with status ${status}`,
		status,
		status === 408 || status === 429 || status >= 500
	)
}

function errorFromTransport(error: unknown, url: string): ChatApiError {
	const detail =
		error instanceof Error
			? error.message
			: typeof error === "string" && error.trim()
				? error
				: "Network request failed"
	return new ChatApiError(
		`${detail} (${new URL(url).origin}${new URL(url).pathname})`,
		undefined,
		true
	)
}

function readSseEvents(buffer: string): {
	events: string[]
	remaining: string
} {
	const normalized = buffer.replace(/\r\n/g, "\n")
	const parts = normalized.split("\n\n")
	const remaining = parts.pop() ?? ""
	return { events: parts, remaining }
}

function dataFromEvent(event: string): string | null {
	const lines = event
		.split("\n")
		.filter((line) => line.startsWith("data:"))
		.map((line) => line.slice(5).trimStart())
	if (!lines.length) return null
	return lines.join("\n")
}

async function readStream(
	response: Response,
	onDelta?: (delta: string) => void
): Promise<{ content: string; usage: CompletionUsage }> {
	if (!response.body) {
		throw new ChatApiError("Streaming response has no body")
	}

	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let buffer = ""
	let content = ""
	let usage: CompletionUsage = normalizeUsage()

	while (true) {
		const { done, value } = await reader.read()
		buffer += decoder.decode(value, { stream: !done })
		const parsed = readSseEvents(buffer)
		buffer = parsed.remaining

		for (const event of parsed.events) {
			const data = dataFromEvent(event)
			if (!data || data === "[DONE]") continue

			let payload: CompletionPayload
			try {
				payload = JSON.parse(data) as CompletionPayload
			} catch {
				continue
			}

			const delta = payload.choices?.[0]?.delta?.content ?? ""
			if (delta) {
				content += delta
				onDelta?.(delta)
			}
			if (payload.usage) usage = parseUsage(payload)
			if (payload.error?.message) {
				throw new ChatApiError(payload.error.message)
			}
		}

		if (done) break
	}

	return { content, usage }
}

async function executeOnce(
	options: CompletionOptions,
	includeUsageOption: boolean
): Promise<CompletionResult> {
	const startedAt = performance.now()
	const timeout = createTimeoutSignal(options.timeoutMs, options.signal)
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	}
	if (options.apiKey?.trim()) {
		headers.Authorization = `Bearer ${options.apiKey.trim()}`
	}

	const url = resolveCompletionUrl(options.endpoint)
	try {
		const response = await request(url, {
			method: "POST",
			headers,
			signal: timeout.signal,
			body: JSON.stringify({
				model: options.model,
				messages: options.messages satisfies ChatApiMessage[],
				temperature: options.temperature,
				max_tokens: options.maxTokens,
				stream: options.streaming,
				...(options.streaming && includeUsageOption
					? { stream_options: { include_usage: true } }
					: {}),
			}),
		})

		if (!response.ok) {
			throw errorFromResponse(response.status, await response.text())
		}

		if (options.streaming) {
			const result = await readStream(response, options.onDelta)
			return {
				...result,
				latencyMs: Math.round(performance.now() - startedAt),
			}
		}

		const payload = (await response.json()) as CompletionPayload
		const content = payload.choices?.[0]?.message?.content ?? ""
		options.onDelta?.(content)
		return {
			content,
			usage: parseUsage(payload),
			latencyMs: Math.round(performance.now() - startedAt),
		}
	} finally {
		timeout.cleanup()
	}
}

async function executeRequest(
	options: CompletionOptions,
	includeUsageOption: boolean
): Promise<CompletionResult> {
	try {
		return await executeOnce(options, includeUsageOption)
	} catch (error) {
		if (options.signal?.aborted) throw error
		if (error instanceof ChatApiError) throw error
		throw errorFromTransport(error, resolveCompletionUrl(options.endpoint))
	}
}

export async function completeChat(
	options: CompletionOptions
): Promise<CompletionResult> {
	let attempt = 0
	let includeUsageOption = options.streaming
	let emittedDelta = false
	const guardedOptions: CompletionOptions = {
		...options,
		onDelta: (delta) => {
			emittedDelta = true
			options.onDelta?.(delta)
		},
	}

	while (true) {
		try {
			return await executeRequest(guardedOptions, includeUsageOption)
		} catch (error) {
			if (options.signal?.aborted) throw error
			const apiError =
				error instanceof ChatApiError
					? error
					: new ChatApiError(
							error instanceof Error ? error.message : "Network request failed",
							undefined,
							true
						)

			if (
				apiError.status === 400 &&
				includeUsageOption &&
				/stream_options|include_usage/i.test(apiError.message)
			) {
				includeUsageOption = false
				continue
			}

			if (
				emittedDelta ||
				!apiError.retryable ||
				attempt >= options.retryCount
			) {
				throw apiError
			}

			attempt += 1
			await new Promise((resolve) => window.setTimeout(resolve, 450 * attempt))
		}
	}
}
