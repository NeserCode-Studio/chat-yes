import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useChatStore } from "../src/features/chat/store"
import type { ChatMessage, Conversation } from "../src/features/chat/types"

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

describe("chat store recovery", () => {
	beforeEach(() => {
		vi.stubGlobal("localStorage", new MemoryStorage())
	})

	it("recovers streaming messages left by an interrupted run", async () => {
		const conversationId = "conversation-1"
		const conversation: Conversation = {
			id: conversationId,
			title: "Interrupted session",
			participantIds: [],
			mode: "roundtable",
			roundLimit: 1,
			requestLimit: 1,
			tokenBudget: 1000,
			status: "running",
			usage: {
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
				requestCount: 0,
				latencyMs: 0,
			},
			lastMessagePreview: "",
			createdAt: 1,
			updatedAt: 1,
		}
		const message: ChatMessage = {
			id: "message-1",
			conversationId,
			role: "assistant",
			content: "",
			status: "streaming",
			createdAt: 1,
		}

		localStorage.setItem(
			"chat-yes.conversations.v1",
			JSON.stringify([conversation])
		)
		localStorage.setItem(
			`chat-yes.messages.v1.${conversationId}`,
			JSON.stringify([message])
		)

		setActivePinia(createPinia())
		const store = useChatStore()
		await store.initialize()

		expect(store.getConversation(conversationId)?.status).toBe("stopped")
		expect(
			store.getMessages(conversationId).find((item) => item.id === message.id)
				?.status
		).toBe("stopped")
		expect(
			JSON.parse(
				localStorage.getItem(`chat-yes.messages.v1.${conversationId}`) ?? "[]"
			)
		).toEqual([{ ...message, status: "stopped" }])
	})

	it("normalizes conversation settings before they reach the orchestrator", async () => {
		setActivePinia(createPinia())
		const store = useChatStore()
		await store.initialize()
		const agent = store.addAgent()
		const conversation = store.addConversation([agent.id])

		store.updateConversationSettings(conversation.id, {
			title: "  Normalized session  ",
			mode: "relay",
			roundLimit: 0,
			requestLimit: 0,
			tokenBudget: 0,
		})

		const updated = store.getConversation(conversation.id)
		expect(updated?.title).toBe("Normalized session")
		expect(updated?.mode).toBe("relay")
		expect(updated?.roundLimit).toBe(1)
		expect(updated?.requestLimit).toBe(1)
		expect(updated?.tokenBudget).toBe(1000)

		store.updateConversationSettings(conversation.id, { requestLimit: 6 })
		store.updateConversationSettings(conversation.id, { tokenBudget: 2000 })
		expect(store.getConversation(conversation.id)?.requestLimit).toBe(6)
	})
})
