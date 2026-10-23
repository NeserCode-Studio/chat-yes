import type {
	AgentProfile,
	AgentSettingsPreset,
	ChatMessage,
	Conversation,
} from "./types"
import { createLogger } from "@/lib/logger"

const log = createLogger("ChatStorage")

const AGENTS_KEY = "chat-yes.agents.v1"
const CONVERSATIONS_KEY = "chat-yes.conversations.v1"
const ACTIVE_CONVERSATION_KEY = "chat-yes.active-conversation.v1"
const MESSAGES_PREFIX = "chat-yes.messages.v1."
const PRESETS_KEY = "chat-yes.presets.v1"

function readJson<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key)
		return raw ? (JSON.parse(raw) as T) : fallback
	} catch (error) {
		log.warn("failed to read persisted state", { key, error })
		return fallback
	}
}

function writeJson(key: string, value: unknown): void {
	try {
		localStorage.setItem(key, JSON.stringify(value))
	} catch (error) {
		log.error("failed to persist state", { key, error })
	}
}

export function loadAgents(): AgentProfile[] {
	return readJson<AgentProfile[]>(AGENTS_KEY, [])
}

export function saveAgents(agents: AgentProfile[]): void {
	writeJson(AGENTS_KEY, agents)
}

export function loadPresets(): AgentSettingsPreset[] {
	return readJson<AgentSettingsPreset[]>(PRESETS_KEY, [])
}

export function savePresets(presets: AgentSettingsPreset[]): void {
	writeJson(PRESETS_KEY, presets)
}

export function loadConversations(): Conversation[] {
	return readJson<Conversation[]>(CONVERSATIONS_KEY, [])
}

export function saveConversations(conversations: Conversation[]): void {
	writeJson(CONVERSATIONS_KEY, conversations)
}

export function loadActiveConversationId(): string | null {
	return readJson<string | null>(ACTIVE_CONVERSATION_KEY, null)
}

export function saveActiveConversationId(id: string | null): void {
	writeJson(ACTIVE_CONVERSATION_KEY, id)
}

export function loadMessages(conversationId: string): ChatMessage[] {
	return readJson<ChatMessage[]>(`${MESSAGES_PREFIX}${conversationId}`, [])
}

export function saveMessages(
	conversationId: string,
	messages: ChatMessage[]
): void {
	writeJson(`${MESSAGES_PREFIX}${conversationId}`, messages)
}

export function removeMessages(conversationId: string): void {
	try {
		localStorage.removeItem(`${MESSAGES_PREFIX}${conversationId}`)
	} catch (error) {
		log.warn("failed to remove persisted messages", { conversationId, error })
	}
}
