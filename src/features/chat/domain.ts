import type {
	AgentMemoryEntry,
	AgentPermissions,
	AgentPreset,
	AgentProfile,
	AgentRole,
	ChatApiContentPart,
	ChatApiMessage,
	ChatMessage,
	CompletionUsage,
	ConversationMode,
	TokenUsage,
} from "./types"
import { AGENT_ACCENTS, EMPTY_USAGE } from "./types"
import { createId } from "./ids"

export const CONVERSATION_CONTINUE_TAG = "<conversation_continue>"

const LEGACY_CONVERSATION_COMPLETE_TAG = "<conversation_complete>"
export const TURN_CONTROL_TAGS = [
	CONVERSATION_CONTINUE_TAG,
	LEGACY_CONVERSATION_COMPLETE_TAG,
]

export const DEFAULT_PERMISSIONS: AgentPermissions = {
	shareConversation: true,
	autoReply: true,
	readMemory: true,
	writeMemory: false,
}

const PRESET_PROMPTS: Record<AgentPreset, string> = {
	balanced:
		"Respond with clear reasoning, state assumptions, and distinguish facts from guesses.",
	concise:
		"Be concise. Lead with the answer, then include only the evidence needed to support it.",
	analytical:
		"Analyze the problem systematically. Surface constraints, tradeoffs, risks, and verification steps.",
	creative:
		"Explore non-obvious alternatives while keeping every proposal concrete and testable.",
}

const TURN_CONTROL_PROMPT = [
	"Conversation continuation rules:",
	`- If another participant or a follow-up turn is required, end your reply with ${CONVERSATION_CONTINUE_TAG}.`,
	"- If your reply completes the requested work, do not add the marker; the run will end after the current round.",
	"- Do not use the marker merely to acknowledge, thank, or close the task.",
	"- Never explain the marker; the application removes it from the visible reply.",
].join("\n")

const GROUP_MODE_PROMPTS: Record<ConversationMode, string> = {
	roundtable:
		"Group mode: roundtable. Each participant may speak once per round. Mention another participant with @Name to bring them in next; otherwise keep the configured order.",
	relay:
		"Group mode: relay. Hand off the conversation by mentioning one or more participants with @Name. If no handoff is needed, finish without mentioning another participant.",
}

export function createAgentProfile(index = 0): AgentProfile {
	const now = Date.now()
	return {
		id: createId("agent"),
		enabled: true,
		name: `Agent ${String(index + 1).padStart(2, "0")}`,
		role: "custom",
		accent: AGENT_ACCENTS[index % AGENT_ACCENTS.length],
		endpoint: "http://localhost:1234/v1",
		model: "",
		systemPrompt: PRESET_PROMPTS.balanced,
		preset: "balanced",
		temperature: 0.7,
		maxTokens: 1200,
		contextWindow: 16000,
		timeoutMs: 90000,
		retryCount: 1,
		streaming: true,
		permissions: { ...DEFAULT_PERMISSIONS },
		memories: [],
		createdAt: now,
		updatedAt: now,
	}
}

export function createMemoryEntry(content: string): AgentMemoryEntry {
	const now = Date.now()
	return {
		id: createId("memory"),
		content: content.trim(),
		enabled: true,
		createdAt: now,
		updatedAt: now,
	}
}

export function applyAgentPreset(agent: AgentProfile): void {
	agent.systemPrompt = PRESET_PROMPTS[agent.preset]
	agent.updatedAt = Date.now()
}

export function estimateTokens(text: string): number {
	if (!text) return 0
	const cjk = (text.match(/[\u3400-\u9fff]/g) ?? []).length
	const remaining = Math.max(0, text.length - cjk)
	return Math.ceil(cjk * 1.15 + remaining / 4)
}

export function estimateApiContentTokens(
	content: ChatApiMessage["content"]
): number {
	if (typeof content === "string") return estimateTokens(content)
	return content.reduce((total, part) => {
		if (part.type === "text") return total + estimateTokens(part.text)
		return total + 800
	}, 0)
}

export function normalizeUsage(usage?: Partial<CompletionUsage>): CompletionUsage {
	const promptTokens = Math.max(0, Math.round(usage?.promptTokens ?? 0))
	const completionTokens = Math.max(0, Math.round(usage?.completionTokens ?? 0))
	return {
		promptTokens,
		completionTokens,
		totalTokens: Math.max(
			0,
			Math.round(usage?.totalTokens ?? promptTokens + completionTokens)
		),
	}
}

export function addUsage(base: TokenUsage, next: TokenUsage): TokenUsage {
	return {
		promptTokens: base.promptTokens + next.promptTokens,
		completionTokens: base.completionTokens + next.completionTokens,
		totalTokens: base.totalTokens + next.totalTokens,
		requestCount: base.requestCount + next.requestCount,
		latencyMs: base.latencyMs + next.latencyMs,
	}
}

export function emptyUsage(): TokenUsage {
	return { ...EMPTY_USAGE }
}

export function usageFromCompletion(
	usage: CompletionUsage,
	latencyMs: number
): TokenUsage {
	const normalized = normalizeUsage(usage)
	return {
		...normalized,
		requestCount: 1,
		latencyMs: Math.max(0, latencyMs),
	}
}

export function aggregateMessageUsage(messages: ChatMessage[]): TokenUsage {
	return messages.reduce(
		(total, message) => (message.usage ? addUsage(total, message.usage) : total),
		emptyUsage()
	)
}

export function stripTurnControlSignal(content: string): string {
	return TURN_CONTROL_TAGS.reduce(
		(result, tag) => result.split(tag).join(""),
		content
	).trim()
}

export function parseAgentMentionIds(
	content: string,
	agents: AgentProfile[]
): string[] {
	const agentsByName = new Map(
		agents
			.filter((agent) => agent.name.trim())
			.map((agent) => [agent.name, agent])
	)
	if (!agentsByName.size) return []

	const escapedNames = [...agentsByName.keys()]
		.sort((left, right) => right.length - left.length)
		.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
	const pattern = new RegExp(
		`@(${escapedNames.join("|")})(?=\\s|$|[，。,.!?、：:；;])`,
		"g"
	)

	return [...content.matchAll(pattern)]
		.map((match) => agentsByName.get(match[1])?.id ?? "")
		.filter(Boolean)
}

export function parseUniqueAgentMentionIds(
	content: string,
	agents: AgentProfile[]
): string[] {
	return [...new Set(parseAgentMentionIds(content, agents))]
}

export function buildAgentContext(
	agent: AgentProfile,
	participants: AgentProfile[],
	messages: ChatMessage[],
	mode: ConversationMode = "roundtable"
): ChatApiMessage[] {
	const memory = agent.permissions.readMemory
		? agent.memories
				.filter((item) => item.enabled && item.content.trim())
				.map((item) => `- ${item.content.trim()}`)
				.join("\n")
		: ""

	const roster = participants
		.filter((participant) => participant.id !== agent.id)
		.map((participant) =>
			participant.role === "custom"
				? participant.name
				: `${participant.name} (${participant.role})`
		)
		.join(", ")

	const systemSections = [
		agent.role === "custom"
			? `You are ${agent.name}.`
			: `You are ${agent.name}, acting as ${agent.role} in a multi-agent conversation.`,
		agent.systemPrompt.trim(),
		roster ? `Other participants: ${roster}.` : "",
		memory ? `Your durable memory:\n${memory}` : "",
		"Treat other participants' messages as discussion input. Do not claim actions you cannot perform.",
		GROUP_MODE_PROMPTS[mode],
		TURN_CONTROL_PROMPT,
	]
		.filter(Boolean)
		.join("\n\n")

	const conversation = messages
		.filter(
			(message) =>
				message.role === "user" || message.role === "assistant"
		)
		.filter((message) => message.status !== "error")
		.map<ChatApiMessage>((message) => {
			const speaker = participants.find((item) => item.id === message.agentId)
			if (message.role === "assistant") {
				return {
					role: message.agentId === agent.id ? "assistant" : "user",
					content:
						message.agentId === agent.id
							? message.content
							: `[${speaker?.name ?? "Agent"}]\n${message.content}`,
				}
			}
			const imageParts =
				message.attachments
					?.filter((attachment) => attachment.kind === "image")
					.map<ChatApiContentPart>((attachment) => ({
						type: "image_url",
						image_url: { url: attachment.dataUrl },
					})) ?? []
			if (imageParts.length) {
				const parts: ChatApiContentPart[] = []
				if (message.content.trim()) {
					parts.push({ type: "text", text: message.content })
				}
				return {
					role: "user",
					content: [...parts, ...imageParts],
				}
			}
			return {
				role: "user",
				content: message.content,
			}
		})

	const fixedTokens =
		estimateTokens(systemSections) + Math.max(0, agent.maxTokens)
	const available = Math.max(256, agent.contextWindow - fixedTokens)
	const selected: ChatApiMessage[] = []
	let used = 0

	for (let index = conversation.length - 1; index >= 0; index -= 1) {
		const message = conversation[index]
		const tokens = estimateApiContentTokens(message.content) + 4
		if (selected.length > 0 && used + tokens > available) break
		selected.unshift(message)
		used += tokens
	}

	return [{ role: "system", content: systemSections }, ...selected]
}

export function sanitizePreview(content: string): string {
	return content.replace(/\s+/g, " ").trim().slice(0, 120)
}

export function roleLabel(role: AgentRole): string {
	const labels: Record<AgentRole, string> = {
		moderator: "Moderator",
		analyst: "Analyst",
		builder: "Builder",
		reviewer: "Reviewer",
		researcher: "Researcher",
		custom: "Custom",
	}
	return labels[role]
}
