import { afterEach, describe, expect, it, vi } from "vitest"
import { createAgentProfile, createMemoryEntry } from "../src/features/chat/domain"
import {
	CONVERSATION_EXPORT_VERSION,
	conversationExportFilename,
	createConversationExport,
	saveConversationExport,
} from "../src/features/chat/export"
import type {
	AgentProfile,
	ChatMessage,
	Conversation,
} from "../src/features/chat/types"

function prepareExport() {
	const agent = createAgentProfile()
	agent.name = "Researcher"
	agent.model = "test-model"
	agent.systemPrompt = "Investigate the question carefully."
	agent.memories = [createMemoryEntry("Prefer evidence over guesses.")]
	const unsafeAgent = agent as AgentProfile & { apiKey?: string }
	unsafeAgent.apiKey = "must-not-be-exported"
	const conversation: Conversation = {
		id: "conversation-1",
		title: "Reasoning diagnosis",
		context: "Use the compatibility table in the migration notes.",
		participantIds: [agent.id],
		mode: "relay",
		roundLimit: 2,
		requestLimit: 4,
		tokenBudget: 50000,
		status: "idle",
		usage: {
			promptTokens: 30,
			completionTokens: 20,
			totalTokens: 50,
			requestCount: 1,
			latencyMs: 120,
		},
		lastMessagePreview: "Answer",
		createdAt: 1,
		updatedAt: 2,
	}
	const messages: ChatMessage[] = [
		{
			id: "user-1",
			conversationId: conversation.id,
			role: "user",
			content: "Why is the reasoning longer?",
			status: "complete",
			createdAt: 3,
		},
		{
			id: "event-1",
			conversationId: conversation.id,
			role: "event",
			content: "Run started",
			status: "complete",
			createdAt: 4,
		},
		{
			id: "assistant-1",
			conversationId: conversation.id,
			role: "assistant",
			agentId: agent.id,
			content: "Answer",
			reasoning: "Detailed internal reasoning",
			status: "complete",
			createdAt: 5,
			usage: {
				promptTokens: 30,
				completionTokens: 20,
				totalTokens: 50,
				requestCount: 1,
				latencyMs: 120,
			},
		},
	]

	return { agent, conversation, messages }
}

describe("conversation export", () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it("includes configuration, messages, events and reasoning without secrets", () => {
		const { agent, conversation, messages } = prepareExport()
		const exportedAt = new Date("2026-10-24T04:30:00.000Z")

		const data = createConversationExport({
			conversation,
			agents: [agent],
			messages,
			exportedAt,
		})
		const serialized = JSON.stringify(data)

		expect(data.schema).toBe("chat-yes.conversation-export")
		expect(data.version).toBe(CONVERSATION_EXPORT_VERSION)
		expect(data.exportedAt).toBe(exportedAt.toISOString())
		expect(data.security.apiKeysIncluded).toBe(false)
		expect(data.conversation.mode).toBe("relay")
		expect(data.conversation.context).toBe(
			"Use the compatibility table in the migration notes."
		)
		expect(data.participants[0].systemPrompt).toBe(
			"Investigate the question carefully."
		)
		expect(data.participants[0].memories[0].content).toBe(
			"Prefer evidence over guesses."
		)
		expect(data.messages.map((message) => message.role)).toEqual([
			"user",
			"event",
			"assistant",
		])
		expect(data.messages[2].reasoning).toBe("Detailed internal reasoning")
		expect(data.requestContexts[0].messages[0].content).toContain(
			"Group mode: relay"
		)
		expect(data.requestContexts[0].messages[0].content).toContain(
			"Investigate the question carefully."
		)
		expect(data.requestContexts[0].messages[0].content).toContain(
			"Conversation context:\nUse the compatibility table in the migration notes."
		)
		expect(serialized).not.toContain("must-not-be-exported")
		expect(serialized).not.toContain('"apiKey"')
	})

	it("creates a filesystem-safe filename", () => {
		const { conversation } = prepareExport()
		conversation.title = 'Reasoning:/\\?* "audit"'
		const exportedAt = new Date("2026-10-24T04:30:00.000Z")

		const filename = conversationExportFilename(conversation, exportedAt)

		expect(filename).toBe(
			"chat-yes-Reasoning-audit-2026-10-24T04-30-00-000Z.json"
		)
		for (const character of '<>:"/\\|?*') {
			expect(filename).not.toContain(character)
		}
	})

	it("writes the export through the system save picker", async () => {
		const { agent, conversation, messages } = prepareExport()
		const write = vi.fn().mockResolvedValue(undefined)
		const close = vi.fn().mockResolvedValue(undefined)
		const abort = vi.fn().mockResolvedValue(undefined)
		const showSaveFilePicker = vi.fn().mockResolvedValue({
			createWritable: async () => ({ write, close, abort }),
		})
		vi.stubGlobal("window", { showSaveFilePicker })
		const data = createConversationExport({
			conversation,
			agents: [agent],
			messages,
		})

		const result = await saveConversationExport(conversation, data)

		expect(result).toBe("saved")
		expect(showSaveFilePicker).toHaveBeenCalledOnce()
		expect(write).toHaveBeenCalledWith(expect.any(Blob))
		expect(close).toHaveBeenCalledOnce()
		expect(abort).not.toHaveBeenCalled()
	})

	it("does not report an error when the save picker is cancelled", async () => {
		const { agent, conversation, messages } = prepareExport()
		const showSaveFilePicker = vi
			.fn()
			.mockRejectedValue(new DOMException("Cancelled", "AbortError"))
		vi.stubGlobal("window", { showSaveFilePicker })
		const data = createConversationExport({
			conversation,
			agents: [agent],
			messages,
		})

		const result = await saveConversationExport(conversation, data)

		expect(result).toBe("cancelled")
	})
})
