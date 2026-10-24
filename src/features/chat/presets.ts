import type {
	AgentPresetGroup,
	AgentProfile,
	AgentSettingsPresetGroup,
	AgentSettingsPresetValues,
	BehaviorPresetValues,
	ConnectionPresetValues,
	Conversation,
	GenerationPresetValues,
	LimitsPresetValues,
	MemoryPresetValues,
	PermissionsPresetValues,
} from "./types"

export const AGENT_PRESET_GROUPS: AgentPresetGroup[] = [
	"connection",
	"behavior",
	"generation",
	"memory",
	"permissions",
]

export const CONVERSATION_PRESET_GROUPS: AgentSettingsPresetGroup[] = ["limits"]

export const PRESET_GROUPS: AgentSettingsPresetGroup[] = [
	...AGENT_PRESET_GROUPS,
	...CONVERSATION_PRESET_GROUPS,
]

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

export function presetSecretKey(presetId: string): string {
	return `preset:${presetId}`
}

export function collectPresetValues(
	group: AgentPresetGroup,
	agent: AgentProfile
): AgentSettingsPresetValues {
	switch (group) {
		case "connection":
			return {
				endpoint: agent.endpoint,
				timeoutMs: agent.timeoutMs,
			} satisfies ConnectionPresetValues
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
	group: AgentPresetGroup,
	values: AgentSettingsPresetValues
): void {
	switch (group) {
		case "connection": {
			const connection = values as ConnectionPresetValues
			agent.endpoint = connection.endpoint
			if (
				typeof connection.timeoutMs === "number" &&
				Number.isFinite(connection.timeoutMs)
			) {
				agent.timeoutMs = connection.timeoutMs
			}
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

export function addMemoryPresetValues(
	agent: AgentProfile,
	values: AgentSettingsPresetValues
): number {
	const incoming = clone<MemoryPresetValues>(values as MemoryPresetValues)
	const existingIds = new Set(agent.memories.map((memory) => memory.id))
	const additions = incoming.filter((memory) => !existingIds.has(memory.id))
	if (!additions.length) return 0
	agent.memories = [...additions, ...agent.memories]
	agent.updatedAt = Date.now()
	return additions.length
}

export function collectConversationPresetValues(
	conversation: Conversation
): LimitsPresetValues {
	return {
		mode: conversation.mode,
		roundLimit: conversation.roundLimit,
		requestLimit: conversation.requestLimit,
		tokenBudget: conversation.tokenBudget,
	}
}

export function applyConversationPresetValues(
	conversation: Conversation,
	values: AgentSettingsPresetValues
): void {
	const limits = values as LimitsPresetValues
	conversation.mode = limits.mode === "relay" ? "relay" : "roundtable"
	conversation.roundLimit = limits.roundLimit
	conversation.requestLimit = limits.requestLimit
	conversation.tokenBudget = limits.tokenBudget
	conversation.updatedAt = Date.now()
}
