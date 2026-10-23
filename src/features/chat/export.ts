import packageInfo from "../../../package.json"
import { buildAgentContext } from "./domain"
import type {
	AgentMemoryEntry,
	AgentPermissions,
	AgentProfile,
	ChatApiMessage,
	ChatAttachment,
	ChatMessage,
	Conversation,
	TokenUsage,
} from "./types"

export const CONVERSATION_EXPORT_VERSION = 1

export type ConversationExportSaveResult = "saved" | "downloaded" | "cancelled"

export interface ConversationExport {
	schema: "chat-yes.conversation-export"
	version: number
	exportedAt: string
	application: {
		name: string
		version: string
	}
	security: {
		apiKeysIncluded: false
	}
	conversation: Conversation
	participants: AgentProfile[]
	messages: ChatMessage[]
	requestContexts: Array<{
		agentId: string
		agentName: string
		mode: Conversation["mode"]
		messages: ChatApiMessage[]
	}>
}

function copyUsage(usage: TokenUsage): TokenUsage {
	return {
		promptTokens: usage.promptTokens,
		completionTokens: usage.completionTokens,
		totalTokens: usage.totalTokens,
		requestCount: usage.requestCount,
		latencyMs: usage.latencyMs,
	}
}

function copyPermissions(permissions: AgentPermissions): AgentPermissions {
	return {
		shareConversation: permissions.shareConversation,
		autoReply: permissions.autoReply,
		readMemory: permissions.readMemory,
		writeMemory: permissions.writeMemory,
	}
}

function copyMemory(memory: AgentMemoryEntry): AgentMemoryEntry {
	return {
		id: memory.id,
		content: memory.content,
		enabled: memory.enabled,
		createdAt: memory.createdAt,
		updatedAt: memory.updatedAt,
	}
}

function copyAgent(agent: AgentProfile): AgentProfile {
	return {
		id: agent.id,
		enabled: agent.enabled,
		name: agent.name,
		role: agent.role,
		accent: agent.accent,
		endpoint: agent.endpoint,
		model: agent.model,
		systemPrompt: agent.systemPrompt,
		preset: agent.preset,
		temperature: agent.temperature,
		topP: agent.topP,
		presencePenalty: agent.presencePenalty,
		frequencyPenalty: agent.frequencyPenalty,
		maxTokens: agent.maxTokens,
		contextWindow: agent.contextWindow,
		timeoutMs: agent.timeoutMs,
		retryCount: agent.retryCount,
		streaming: agent.streaming,
		permissions: copyPermissions(agent.permissions),
		memories: agent.memories.map(copyMemory),
		presetBindings: agent.presetBindings ? { ...agent.presetBindings } : undefined,
		createdAt: agent.createdAt,
		updatedAt: agent.updatedAt,
	}
}

function copyAttachment(attachment: ChatAttachment): ChatAttachment {
	return {
		id: attachment.id,
		kind: attachment.kind,
		name: attachment.name,
		mimeType: attachment.mimeType,
		dataUrl: attachment.dataUrl,
		width: attachment.width,
		height: attachment.height,
		size: attachment.size,
	}
}

function copyMessage(message: ChatMessage): ChatMessage {
	return {
		id: message.id,
		conversationId: message.conversationId,
		role: message.role,
		agentId: message.agentId,
		content: message.content,
		reasoning: message.reasoning,
		mentions: message.mentions ? [...message.mentions] : undefined,
		attachments: message.attachments?.map(copyAttachment),
		status: message.status,
		createdAt: message.createdAt,
		usage: message.usage ? copyUsage(message.usage) : undefined,
		error: message.error,
	}
}

function copyConversation(conversation: Conversation): Conversation {
	return {
		id: conversation.id,
		title: conversation.title,
		participantIds: [...conversation.participantIds],
		mode: conversation.mode,
		roundLimit: conversation.roundLimit,
		requestLimit: conversation.requestLimit,
		tokenBudget: conversation.tokenBudget,
		status: conversation.status,
		activeAgentId: conversation.activeAgentId,
		usage: copyUsage(conversation.usage),
		lastMessagePreview: conversation.lastMessagePreview,
		presetBindings: conversation.presetBindings
			? { ...conversation.presetBindings }
			: undefined,
		createdAt: conversation.createdAt,
		updatedAt: conversation.updatedAt,
	}
}

export function createConversationExport(input: {
	conversation: Conversation
	agents: AgentProfile[]
	messages: ChatMessage[]
	exportedAt?: Date
}): ConversationExport {
	const participantIds = new Set(input.conversation.participantIds)
	const participants = input.agents
		.filter((agent) => participantIds.has(agent.id))
		.map(copyAgent)
	const participantModels = participants.map((agent) =>
		input.agents.find((candidate) => candidate.id === agent.id)
	)
	const exportedMessages = input.messages.map(copyMessage)
	const requestContexts = participants.map((agent, index) => {
		const source = participantModels[index]
		return {
			agentId: agent.id,
			agentName: agent.name,
			mode: input.conversation.mode,
			messages: source
				? buildAgentContext(
						source,
						participantModels.filter(
							(candidate): candidate is AgentProfile => Boolean(candidate)
						),
						input.messages,
						input.conversation.mode
					)
				: [],
		}
	})

	return {
		schema: "chat-yes.conversation-export",
		version: CONVERSATION_EXPORT_VERSION,
		exportedAt: (input.exportedAt ?? new Date()).toISOString(),
		application: {
			name: packageInfo.name,
			version: packageInfo.version,
		},
		security: {
			apiKeysIncluded: false,
		},
		conversation: copyConversation(input.conversation),
		participants,
		messages: exportedMessages,
		requestContexts,
	}
}

export function conversationExportFilename(
	conversation: Conversation,
	exportedAt = new Date()
): string {
	const title =
		conversation.title
			.trim()
			.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 60) || "conversation"
	const timestamp = exportedAt.toISOString().replace(/[:.]/g, "-")
	return `chat-yes-${title}-${timestamp}.json`
}

function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob)
	const link = document.createElement("a")
	link.href = url
	link.style.display = "none"
	link.download = filename
	document.body.appendChild(link)
	link.click()
	link.remove()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type SaveFilePickerWindow = Window & {
	showSaveFilePicker?: (options: {
		suggestedName: string
		types: Array<{
			description: string
			accept: Record<string, string[]>
		}>
	}) => Promise<FileSystemFileHandle>
}

export async function saveConversationExport(
	conversation: Conversation,
	exportData: ConversationExport
): Promise<ConversationExportSaveResult> {
	const blob = new Blob([JSON.stringify(exportData, null, 2)], {
		type: "application/json;charset=utf-8",
	})
	const filename = conversationExportFilename(
		conversation,
		new Date(exportData.exportedAt)
	)
	const pickerWindow = window as SaveFilePickerWindow

	if (pickerWindow.showSaveFilePicker) {
		try {
			const handle = await pickerWindow.showSaveFilePicker({
				suggestedName: filename,
				types: [
					{
						description: "JSON",
						accept: { "application/json": [".json"] },
					},
				],
			})
			const writable = await handle.createWritable()
			try {
				await writable.write(blob)
				await writable.close()
			} catch (error) {
				await writable.abort().catch(() => undefined)
				throw error
			}
			return "saved"
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") {
				return "cancelled"
			}
			throw error
		}
	}

	downloadBlob(blob, filename)
	return "downloaded"
}
