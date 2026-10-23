export type AgentRole =
	| "moderator"
	| "analyst"
	| "builder"
	| "reviewer"
	| "researcher"
	| "custom"

export type AgentPreset =
	| "balanced"
	| "concise"
	| "analytical"
	| "creative"

export type ConversationMode = "roundtable" | "relay"

export type ConversationStatus = "idle" | "running" | "stopped" | "error"

export type MessageStatus = "complete" | "streaming" | "error" | "stopped"

export type MessageRole = "user" | "assistant" | "system" | "event"

export interface AgentPermissions {
	shareConversation: boolean
	autoReply: boolean
	readMemory: boolean
	writeMemory: boolean
}

export interface AgentMemoryEntry {
	id: string
	content: string
	enabled: boolean
	createdAt: number
	updatedAt: number
}

export interface AgentProfile {
	id: string
	enabled: boolean
	name: string
	role: AgentRole
	accent: string
	endpoint: string
	model: string
	systemPrompt: string
	preset: AgentPreset
	temperature: number
	maxTokens: number
	contextWindow: number
	timeoutMs: number
	retryCount: number
	streaming: boolean
	permissions: AgentPermissions
	memories: AgentMemoryEntry[]
	createdAt: number
	updatedAt: number
}

export interface TokenUsage {
	promptTokens: number
	completionTokens: number
	totalTokens: number
	requestCount: number
	latencyMs: number
}

export interface ChatMessage {
	id: string
	conversationId: string
	role: MessageRole
	agentId?: string
	content: string
	mentions?: string[]
	attachments?: ChatAttachment[]
	status: MessageStatus
	createdAt: number
	usage?: TokenUsage
	error?: string
}

export interface ChatAttachment {
	id: string
	kind: "image"
	name: string
	mimeType: string
	dataUrl: string
	width: number
	height: number
	size: number
}

export interface Conversation {
	id: string
	title: string
	participantIds: string[]
	mode: ConversationMode
	roundLimit: number
	requestLimit: number
	tokenBudget: number
	status: ConversationStatus
	activeAgentId?: string
	usage: TokenUsage
	lastMessagePreview: string
	createdAt: number
	updatedAt: number
}

export interface ChatApiMessage {
	role: "system" | "user" | "assistant"
	content: string | ChatApiContentPart[]
}

export type ChatApiContentPart =
	| { type: "text"; text: string }
	| { type: "image_url"; image_url: { url: string } }

export interface ComposerSendPayload {
	content: string
	mentions: string[]
	attachments: ChatAttachment[]
}

export interface CompletionUsage {
	promptTokens: number
	completionTokens: number
	totalTokens: number
}

export interface CompletionResult {
	content: string
	usage: CompletionUsage
	latencyMs: number
}

export interface CompletionOptions {
	endpoint: string
	apiKey?: string
	model: string
	messages: ChatApiMessage[]
	temperature: number
	maxTokens: number
	timeoutMs: number
	retryCount: number
	streaming: boolean
	signal?: AbortSignal
	onDelta?: (delta: string) => void
}

export interface RunOptions {
	signal: AbortSignal
	targetAgentIds?: string[]
	onProgress?: (message: string) => void
}

export const EMPTY_USAGE: TokenUsage = {
	promptTokens: 0,
	completionTokens: 0,
	totalTokens: 0,
	requestCount: 0,
	latencyMs: 0,
}

export const AGENT_ACCENTS = [
	"#0f766e",
	"#c2410c",
	"#1d4ed8",
	"#7e22ce",
	"#4d7c0f",
	"#b91c1c",
]
