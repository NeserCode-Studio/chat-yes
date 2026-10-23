import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { completeChat } from "../src/features/chat/api"
import { createId } from "../src/features/chat/ids"
import { runConversation } from "../src/features/chat/orchestrator"
import { useChatStore } from "../src/features/chat/store"
import type { CompletionResult } from "../src/features/chat/types"

vi.mock("../src/features/chat/api", () => {
	class ChatApiError extends Error {
		status?: number
		retryable: boolean

		constructor(message: string, status?: number, retryable = false) {
			super(message)
			this.status = status
			this.retryable = retryable
		}
	}

	return {
		ChatApiError,
		completeChat: vi.fn(),
	}
})

class MemoryStorage implements Storage {
	private values = new Map<string, string>()

	get length(): number {
		return this.values.size
	}

	clear(): void {
		this.values.clear()
	}

	getItem(key: string): string | null {
		return this.values.get(key) ?? null
	}

	key(index: number): string | null {
		return [...this.values.keys()][index] ?? null
	}

	removeItem(key: string): void {
		this.values.delete(key)
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value)
	}
}

const completeChatMock = vi.mocked(completeChat)

function prepareConversation() {
	setActivePinia(createPinia())
	vi.stubGlobal("localStorage", new MemoryStorage())
	const store = useChatStore()
	store.initialize()
	const agent = store.addAgent()
	agent.endpoint = "http://localhost:1234/v1"
	agent.model = "test-model"
	agent.maxTokens = 100
	const conversation = store.conversations[0]
	conversation.roundLimit = 1
	conversation.requestLimit = 1
	conversation.tokenBudget = 50000
	store.addMessage(conversation.id, {
		id: createId("message"),
		role: "user",
		content: "Solve the task",
		status: "complete",
		createdAt: Date.now(),
	})
	return { store, agent, conversation }
}

describe("conversation orchestration", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("runs an explicit first turn and records usage", async () => {
		completeChatMock.mockImplementation(async (options) => {
			options.onReasoningDelta?.("Reasoning")
			options.onDelta?.("Working on it")
			return {
				content: "Working on it",
				reasoning: "Reasoning",
				usage: {
					promptTokens: 10,
					completionTokens: 3,
					totalTokens: 13,
				},
				latencyMs: 120,
			}
		})
		const { store, conversation } = prepareConversation()

		const result = await runConversation(store, conversation.id, {
			signal: new AbortController().signal,
		})

		expect(result.status).toBe("completed")
		expect(completeChatMock).toHaveBeenCalledTimes(1)
		expect(conversation.status).toBe("idle")
		expect(conversation.usage).toEqual({
			promptTokens: 10,
			completionTokens: 3,
			totalTokens: 13,
			requestCount: 1,
			latencyMs: 120,
		})
		expect(
			store.messagesByConversation[conversation.id].find(
				(message) => message.role === "assistant"
			)?.content
		).toBe("Working on it")
		expect(
			store.messagesByConversation[conversation.id].find(
				(message) => message.role === "assistant"
			)?.reasoning
		).toBe("Reasoning")
	})

	it("stops after one round when the model does not request continuation", async () => {
		completeChatMock.mockResolvedValue({
			content: "Hello!",
			usage: {
				promptTokens: 10,
				completionTokens: 3,
				totalTokens: 13,
			},
			latencyMs: 120,
		})
		const { store, conversation } = prepareConversation()
		conversation.roundLimit = 3
		conversation.requestLimit = 3

		const result = await runConversation(store, conversation.id, {
			signal: new AbortController().signal,
		})

		expect(result.status).toBe("completed")
		expect(completeChatMock).toHaveBeenCalledTimes(1)
		expect(conversation.status).toBe("idle")
		expect(
			store.messagesByConversation[conversation.id].find(
				(message) => message.role === "assistant"
			)?.content
		).toBe("Hello!")
	})

	it("continues only when the model explicitly requests another round", async () => {
		completeChatMock
			.mockResolvedValueOnce({
				content: "I need one more review.<conversation_continue>",
				usage: {
					promptTokens: 10,
					completionTokens: 5,
					totalTokens: 15,
				},
				latencyMs: 100,
			})
			.mockResolvedValueOnce({
				content: "Review complete.",
				usage: {
					promptTokens: 12,
					completionTokens: 3,
					totalTokens: 15,
				},
				latencyMs: 90,
			})
		const { store, conversation } = prepareConversation()
		conversation.roundLimit = 3
		conversation.requestLimit = 3

		const result = await runConversation(store, conversation.id, {
			signal: new AbortController().signal,
		})

		expect(result.status).toBe("completed")
		expect(completeChatMock).toHaveBeenCalledTimes(2)
		expect(
			store.messagesByConversation[conversation.id]
				.filter((message) => message.role === "assistant")
				.map((message) => message.content)
		).toEqual(["I need one more review.", "Review complete."])
	})

	it("discards a signal-only turn and keeps its usage", async () => {
		completeChatMock.mockResolvedValue({
			content: "<conversation_continue>",
			usage: {
				promptTokens: 8,
				completionTokens: 2,
				totalTokens: 10,
			},
			latencyMs: 80,
		})
		const { store, conversation } = prepareConversation()
		conversation.roundLimit = 1
		conversation.requestLimit = 1

		const result = await runConversation(store, conversation.id, {
			signal: new AbortController().signal,
		})

		expect(result.status).toBe("completed")
		expect(completeChatMock).toHaveBeenCalledTimes(1)
		expect(conversation.status).toBe("idle")
		expect(
			store.messagesByConversation[conversation.id].filter(
				(message) => message.role === "assistant"
			)
		).toHaveLength(0)
		expect(conversation.usage.totalTokens).toBe(10)
	})

	it("stops a pending request immediately", async () => {
		completeChatMock.mockReturnValue(
			new Promise<CompletionResult>(() => {})
		)
		const { store, conversation } = prepareConversation()
		const controller = new AbortController()
		const runPromise = runConversation(store, conversation.id, {
			signal: controller.signal,
		})

		controller.abort()
		const result = await runPromise

		expect(result.status).toBe("stopped")
		expect(conversation.status).toBe("stopped")
		expect(
			store.messagesByConversation[conversation.id].find(
				(message) => message.role === "assistant"
			)?.status
		).toBe("stopped")
	})

	it("does not block later runs by cumulative request count", async () => {
		completeChatMock.mockResolvedValue({
			content: "Still available",
			usage: {
				promptTokens: 5,
				completionTokens: 2,
				totalTokens: 7,
			},
			latencyMs: 60,
		})
		const { store, conversation } = prepareConversation()
		conversation.usage.requestCount = 99

		const result = await runConversation(store, conversation.id, {
			signal: new AbortController().signal,
		})

		expect(result.status).toBe("completed")
		expect(completeChatMock).toHaveBeenCalledTimes(1)
	})

	it("refuses to send when the agent is disabled", async () => {
		const { store, agent, conversation } = prepareConversation()
		agent.enabled = false

		const result = await runConversation(store, conversation.id, {
			signal: new AbortController().signal,
		})

		expect(result.status).toBe("error")
		expect(completeChatMock).not.toHaveBeenCalled()
		expect(conversation.status).toBe("error")
	})

	it("stops before a request would exceed the token budget", async () => {
		const { store, conversation } = prepareConversation()
		conversation.tokenBudget = 100

		const result = await runConversation(store, conversation.id, {
			signal: new AbortController().signal,
		})

		expect(result.status).toBe("stopped")
		expect(completeChatMock).not.toHaveBeenCalled()
		expect(conversation.status).toBe("stopped")
	})

	it("runs only agents explicitly mentioned by the user", async () => {
		const { store, conversation } = prepareConversation()
		const mentioned = store.addAgent()
		mentioned.endpoint = "http://localhost:1234/v1"
		mentioned.model = "mentioned-model"
		mentioned.maxTokens = 100
		conversation.participantIds.push(mentioned.id)
		conversation.requestLimit = 2
		completeChatMock.mockResolvedValue({
			content: "Mentioned agent response",
			usage: {
				promptTokens: 8,
				completionTokens: 3,
				totalTokens: 11,
			},
			latencyMs: 80,
		})

		const result = await runConversation(store, conversation.id, {
			signal: new AbortController().signal,
			targetAgentIds: [mentioned.id],
		})

		expect(result.status).toBe("completed")
		expect(completeChatMock).toHaveBeenCalledTimes(1)
		expect(completeChatMock.mock.calls[0][0].model).toBe("mentioned-model")
		expect(
			store.messagesByConversation[conversation.id].find(
				(message) => message.role === "assistant"
			)?.agentId
		).toBe(mentioned.id)
	})
})
