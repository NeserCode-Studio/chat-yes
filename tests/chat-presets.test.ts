import { describe, expect, it } from "vitest"
import {
	createAgentProfile,
	createMemoryEntry,
} from "../src/features/chat/domain"
import {
	applyConversationPresetValues,
	applyPresetValues,
	collectConversationPresetValues,
	collectPresetValues,
	presetSecretKey,
} from "../src/features/chat/presets"
import type { Conversation } from "../src/features/chat/types"

describe("agent settings presets", () => {
	it("namespaces connection secrets separately from agents", () => {
		expect(presetSecretKey("preset_abc")).toBe("preset:preset_abc")
	})

	it("round-trips connection endpoint and timeout", () => {
		const agent = createAgentProfile()
		agent.endpoint = "https://api.example.com/v1"
		agent.timeoutMs = 45000

		const values = collectPresetValues("connection", agent)
		agent.endpoint = "http://localhost:1234/v1"
		agent.timeoutMs = 90000
		applyPresetValues(agent, "connection", values)

		expect(agent.endpoint).toBe("https://api.example.com/v1")
		expect(agent.timeoutMs).toBe(45000)
	})

	it("preserves the current timeout when applying a legacy connection preset", () => {
		const agent = createAgentProfile()
		agent.endpoint = "http://localhost:1234/v1"
		agent.timeoutMs = 30000

		applyPresetValues(agent, "connection", {
			endpoint: "https://legacy.example.com/v1",
		})

		expect(agent.endpoint).toBe("https://legacy.example.com/v1")
		expect(agent.timeoutMs).toBe(30000)
	})

	it("round-trips behavior values without sharing references", () => {
		const agent = createAgentProfile()
		agent.preset = "concise"
		agent.temperature = 0.3
		agent.streaming = false
		agent.topP = 0.8
		agent.presencePenalty = 0.4
		agent.frequencyPenalty = -0.2

		const values = collectPresetValues("behavior", agent)
		agent.temperature = 1.9
		applyPresetValues(agent, "behavior", values)

		expect(agent.temperature).toBe(0.3)
		expect(agent.topP).toBe(0.8)
		expect(agent.presencePenalty).toBe(0.4)
		expect(agent.frequencyPenalty).toBe(-0.2)
		expect(agent.streaming).toBe(false)
		expect(agent.preset).toBe("concise")
	})

	it("clones memory and permission values on collect and apply", () => {
		const agent = createAgentProfile()
		agent.memories = [createMemoryEntry("Prefer short plans.")]
		agent.permissions.writeMemory = true

		const memories = collectPresetValues("memory", agent)
		const permissions = collectPresetValues("permissions", agent)

		agent.memories[0].content = "Mutated"
		agent.permissions.writeMemory = false

		applyPresetValues(agent, "memory", memories)
		applyPresetValues(agent, "permissions", permissions)

		expect(agent.memories[0].content).toBe("Prefer short plans.")
		expect(agent.permissions.writeMemory).toBe(true)
	})

	it("round-trips conversation run limits", () => {
		const conversation = {
			mode: "relay",
			roundLimit: 3,
			requestLimit: 8,
			tokenBudget: 24000,
		} as Conversation
		const values = collectConversationPresetValues(conversation)

		conversation.mode = "roundtable"
		conversation.roundLimit = 1
		conversation.requestLimit = 1
		conversation.tokenBudget = 1000
		applyConversationPresetValues(conversation, values)

		expect(conversation.mode).toBe("relay")
		expect(conversation.roundLimit).toBe(3)
		expect(conversation.requestLimit).toBe(8)
		expect(conversation.tokenBudget).toBe(24000)
	})
})
