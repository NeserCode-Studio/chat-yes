import { createPinia, setActivePinia } from "pinia"
import { nextTick } from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createAgentProfile, createMemoryEntry } from "../src/features/chat/domain"
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

function createPersistedConversation(): Conversation {
	return {
		id: "conversation-1",
		title: "Interrupted session",
		context: "",
		participantIds: [],
		mode: "roundtable",
		roundLimit: 1,
		requestLimit: 1,
		tokenBudget: 1000,
		status: "idle",
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
}

describe("chat store recovery", () => {
	beforeEach(() => {
		vi.stubGlobal("localStorage", new MemoryStorage())
	})

	it("recovers streaming messages left by an interrupted run", async () => {
		const conversation = createPersistedConversation()
		const conversationId = conversation.id
		conversation.status = "running"
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

	it("migrates legacy conversations without context and persists edits", async () => {
		const { context: _legacyContext, ...legacyConversation } =
			createPersistedConversation()
		localStorage.setItem(
			"chat-yes.conversations.v1",
			JSON.stringify([legacyConversation])
		)

		setActivePinia(createPinia())
		const store = useChatStore()
		await store.initialize()

		expect(store.getConversation(legacyConversation.id)?.context).toBe("")

		store.updateConversationSettings(legacyConversation.id, {
			context: "  Shared context survives reloads.  ",
		})
		await nextTick()

		const persisted = JSON.parse(
			localStorage.getItem("chat-yes.conversations.v1") ?? "[]"
		) as Conversation[]
		expect(persisted[0].context).toBe("  Shared context survives reloads.  ")
	})

	it("normalizes conversation settings before they reach the orchestrator", async () => {
		setActivePinia(createPinia())
		const store = useChatStore()
		await store.initialize()
		const agent = store.addAgent()
		const conversation = store.addConversation([agent.id])

		store.updateConversationSettings(conversation.id, {
			title: "  Normalized session  ",
			context: "  Shared project constraints.  ",
			mode: "relay",
			roundLimit: 0,
			requestLimit: 0,
			tokenBudget: 0,
		})

		const updated = store.getConversation(conversation.id)
		expect(updated?.title).toBe("Normalized session")
		expect(updated?.context).toBe("  Shared project constraints.  ")
		expect(updated?.mode).toBe("relay")
		expect(updated?.roundLimit).toBe(1)
		expect(updated?.requestLimit).toBe(1)
		expect(updated?.tokenBudget).toBe(1000)

		store.updateConversationSettings(conversation.id, { mode: "parallel" })
		expect(store.getConversation(conversation.id)?.mode).toBe("parallel")

		store.updateConversationSettings(conversation.id, { requestLimit: 6 })
		store.updateConversationSettings(conversation.id, { tokenBudget: 2000 })
		expect(store.getConversation(conversation.id)?.requestLimit).toBe(6)
	})

	it("migrates legacy memory preset bindings while preserving local entries", async () => {
		const agent = createAgentProfile()
		agent.memories = [createMemoryEntry("Keep this entry after migration.")]
		agent.presetBindings = {
			behavior: "preset-behavior",
			memory: "preset-memory",
		}
		localStorage.setItem("chat-yes.agents.v1", JSON.stringify([agent]))

		setActivePinia(createPinia())
		const store = useChatStore()
		await store.initialize()

		const migrated = store.getAgent(agent.id)
		expect(migrated?.presetBindings?.memory).toBeUndefined()
		expect(migrated?.presetBindings?.behavior).toBe("preset-behavior")
		expect(migrated?.memories[0]?.content).toBe("Keep this entry after migration.")
	})

	it("persists reusable settings presets in memory", async () => {
		setActivePinia(createPinia())
		const store = useChatStore()
		await store.initialize()

		const saved = store.savePreset("generation", "Long output", {
			maxTokens: 2400,
			contextWindow: 32000,
			retryCount: 2,
		})

		expect(store.presets.some((preset) => preset.id === saved.id)).toBe(true)
		expect(saved.group).toBe("generation")
		expect(saved.name).toBe("Long output")

		store.deletePreset(saved.id)
		expect(store.presets.some((preset) => preset.id === saved.id)).toBe(false)
	})
})
