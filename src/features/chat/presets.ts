import type {
	AgentProfile,
	AgentSettingsPresetGroup,
	AgentSettingsPresetValues,
	BehaviorPresetValues,
	ConnectionPresetValues,
	GenerationPresetValues,
	MemoryPresetValues,
	PermissionsPresetValues,
} from "./types"

export const PRESET_GROUPS: AgentSettingsPresetGroup[] = [
	"connection",
	"behavior",
	"generation",
	"memory",
	"permissions",
]

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

export function presetSecretKey(presetId: string): string {
	return `preset:${presetId}`
}

export function collectPresetValues(
	group: AgentSettingsPresetGroup,
	agent: AgentProfile
): AgentSettingsPresetValues {
	switch (group) {
		case "connection":
			return { endpoint: agent.endpoint } satisfies ConnectionPresetValues
		case "behavior":
			return {
				preset: agent.preset,
				temperature: agent.temperature,
				streaming: agent.streaming,
				topP: agent.topP,
				presencePenalty: agent.presencePenalty,
				frequencyPenalty: agent.frequencyPenalty,
			} satisfies BehaviorPresetValues
		case "generation":
			return {
				maxTokens: agent.maxTokens,
				contextWindow: agent.contextWindow,
				retryCount: agent.retryCount,
			} satisfies GenerationPresetValues
		case "memory":
			return clone<MemoryPresetValues>(agent.memories)
		case "permissions":
			return clone<PermissionsPresetValues>(agent.permissions)
	}
}

export function applyPresetValues(
	agent: AgentProfile,
	group: AgentSettingsPresetGroup,
	values: AgentSettingsPresetValues
): void {
	switch (group) {
		case "connection": {
			const connection = values as ConnectionPresetValues
			agent.endpoint = connection.endpoint
			break
		}
		case "behavior": {
			const behavior = values as BehaviorPresetValues
			agent.preset = behavior.preset
			agent.temperature = behavior.temperature
			agent.streaming = behavior.streaming
			agent.topP = behavior.topP
			agent.presencePenalty = behavior.presencePenalty
			agent.frequencyPenalty = behavior.frequencyPenalty
			break
		}
		case "generation": {
			const generation = values as GenerationPresetValues
			agent.maxTokens = generation.maxTokens
			agent.contextWindow = generation.contextWindow
			agent.retryCount = generation.retryCount
			break
		}
		case "memory":
			agent.memories = clone<MemoryPresetValues>(values as MemoryPresetValues)
			break
		case "permissions":
			agent.permissions = clone<PermissionsPresetValues>(
				values as PermissionsPresetValues
			)
			break
	}
	agent.updatedAt = Date.now()
}
