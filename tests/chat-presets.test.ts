import { describe, expect, it } from "vitest"
import { createAgentProfile, createMemoryEntry } from "../src/features/chat/domain"
import {
	applyPresetValues,
	collectPresetValues,
	presetSecretKey,
} from "../src/features/chat/presets"

describe("agent settings presets", () => {
	it("namespaces connection secrets separately from agents", () => {
		expect(presetSecretKey("preset_abc")).toBe("preset:preset_abc")
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
})
