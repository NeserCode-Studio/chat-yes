import { computed, ref, watch } from "vue"
import { defineStore } from "pinia"
import {
	createAgentProfile,
	createMemoryEntry,
	emptyUsage,
	estimateTokens,
	sanitizePreview,
} from "./domain"
import { createId } from "./ids"
import {
	loadActiveConversationId,
	loadAgents,
	loadConversations,
	loadMessages,
	removeMessages,
	saveActiveConversationId,
	saveAgents,
	saveConversations,
	saveMessages,
} from "./persistence"
import {
	readStoredSecret,
	removeStoredSecret,
	writeStoredSecret,
} from "./secret-storage"
import type {
	AgentProfile,
	ChatMessage,
	Conversation,
	ConversationStatus,
	MessageStatus,
	TokenUsage,
} from "./types"

const runtimeSecrets = new Map<string, string>()

function normalizeAgent(agent: AgentProfile): AgentProfile {
	const permissions = agent.permissions
	return {
		...agent,
		enabled: agent.enabled ?? true,
		permissions: {
			shareConversation: permissions?.shareConversation ?? true,
			autoReply: permissions?.autoReply ?? true,
			readMemory: permissions?.readMemory ?? true,
			writeMemory: permissions?.writeMemory ?? false,
		},
	}
}

function normalizeAgents(agents: AgentProfile[]): AgentProfile[] {
	return agents.map(normalizeAgent)
}

function normalizeConversation(conversation: Conversation): Conversation {
	const roundLimit = Math.max(1, conversation.roundLimit)
	const minimumRequestLimit = Math.max(
		1,
		conversation.participantIds.length * roundLimit
	)
	return {
		...conversation,
		roundLimit,
		requestLimit: Math.max(
			conversation.requestLimit ?? 0,
			minimumRequestLimit
		),
	}
}

function createConversation(
	index: number,
	participantIds: string[]
): Conversation {
	const now = Date.now()
	return {
		id: createId("conversation"),
		title: `Session ${String(index + 1).padStart(2, "0")}`,
		participantIds,
		mode: "roundtable",
		roundLimit: 2,
		requestLimit: Math.max(2, participantIds.length * 2),
		tokenBudget: 50000,
		status: "idle",
		usage: emptyUsage(),
		lastMessagePreview: "",
		createdAt: now,
		updatedAt: now,
	}
}

export const useChatStore = defineStore("chat-workspace", () => {
	const agents = ref<AgentProfile[]>(normalizeAgents(loadAgents()))
	const conversations = ref<Conversation[]>(
		loadConversations().map(normalizeConversation)
	)
	const messagesByConversation = ref<Record<string, ChatMessage[]>>({})
	const activeConversationId = ref<string | null>(
		loadActiveConversationId()
	)
	const selectedAgentId = ref<string | null>(agents.value[0]?.id ?? null)
	const initialized = ref(false)
	const secretVersion = ref(0)

	const activeConversation = computed(
		() =>
			conversations.value.find(
				(conversation) => conversation.id === activeConversationId.value
			) ?? null
	)
	const activeMessages = computed(() =>
		activeConversationId.value
			? (messagesByConversation.value[activeConversationId.value] ?? [])
			: []
	)
	const activeAgents = computed(() => {
		const ids = activeConversation.value?.participantIds ?? []
		return ids
			.map((id) => agents.value.find((agent) => agent.id === id))
			.filter((agent): agent is AgentProfile => Boolean(agent))
	})
	const selectedAgent = computed(
		() =>
			agents.value.find((agent) => agent.id === selectedAgentId.value) ??
			agents.value[0] ??
			null
	)
	const totalUsage = computed(() =>
		conversations.value.reduce<TokenUsage>(
			(total, conversation) => ({
				promptTokens: total.promptTokens + conversation.usage.promptTokens,
				completionTokens:
					total.completionTokens + conversation.usage.completionTokens,
				totalTokens: total.totalTokens + conversation.usage.totalTokens,
				requestCount: total.requestCount + conversation.usage.requestCount,
				latencyMs: total.latencyMs + conversation.usage.latencyMs,
			}),
			emptyUsage()
		)
	)
	const isRunning = computed(
		() => activeConversation.value?.status === "running"
	)

	async function initialize(): Promise<void> {
		if (initialized.value) return
		initialized.value = true

		for (const conversation of conversations.value) {
			messagesByConversation.value[conversation.id] = loadMessages(
				conversation.id
			)
		}

		if (
			!activeConversationId.value ||
			!conversations.value.some(
				(conversation) => conversation.id === activeConversationId.value
			)
		) {
			activeConversationId.value = conversations.value[0]?.id ?? null
		}

		watch(agents, saveAgents, { deep: true })
		watch(conversations, saveConversations, { deep: true })
		watch(activeConversationId, saveActiveConversationId)

		await Promise.all(
			agents.value.map(async (agent) => {
				const secret = await readStoredSecret(agent.id)
				if (secret) runtimeSecrets.set(agent.id, secret)
			})
		)
		secretVersion.value += 1
	}

	function getAgent(agentId?: string): AgentProfile | undefined {
		return agents.value.find((agent) => agent.id === agentId)
	}

	function getConversation(
		conversationId: string
	): Conversation | undefined {
		return conversations.value.find(
			(conversation) => conversation.id === conversationId
		)
	}

	function getMessages(conversationId: string): ChatMessage[] {
		if (!messagesByConversation.value[conversationId]) {
			messagesByConversation.value[conversationId] =
				loadMessages(conversationId)
		}
		return messagesByConversation.value[conversationId]
	}

	function persistMessages(conversationId: string): void {
		saveMessages(conversationId, getMessages(conversationId))
	}

	function addAgent(): AgentProfile {
		const agent = createAgentProfile(agents.value.length)
		agents.value.push(agent)
		selectedAgentId.value = agent.id

		if (!conversations.value.length) {
			const conversation = createConversation(0, [agent.id])
			conversations.value.push(conversation)
			activeConversationId.value = conversation.id
			messagesByConversation.value[conversation.id] = []
			persistMessages(conversation.id)
		}

		return agent
	}

	async function removeAgent(agentId: string): Promise<void> {
		agents.value = agents.value.filter((agent) => agent.id !== agentId)
		runtimeSecrets.delete(agentId)
		secretVersion.value += 1
		await removeStoredSecret(agentId)
		for (const conversation of conversations.value) {
			conversation.participantIds = conversation.participantIds.filter(
				(id) => id !== agentId
			)
		}
		selectedAgentId.value = agents.value[0]?.id ?? null
	}

	function addConversation(participantIds = agents.value.map((agent) => agent.id)) {
		const conversation = createConversation(
			conversations.value.length,
			participantIds
		)
		conversations.value.unshift(conversation)
		activeConversationId.value = conversation.id
		messagesByConversation.value[conversation.id] = []
		persistMessages(conversation.id)
		return conversation
	}

	function selectConversation(conversationId: string): void {
		if (!getConversation(conversationId)) return
		getMessages(conversationId)
		activeConversationId.value = conversationId
	}

	function renameConversation(conversationId: string, title: string): void {
		const conversation = getConversation(conversationId)
		const next = title.trim()
		if (!conversation || !next) return
		conversation.title = next
		conversation.updatedAt = Date.now()
	}

	function deleteConversation(conversationId: string): void {
		const index = conversations.value.findIndex(
			(conversation) => conversation.id === conversationId
		)
		if (index < 0) return
		conversations.value.splice(index, 1)
		delete messagesByConversation.value[conversationId]
		removeMessages(conversationId)
		if (activeConversationId.value === conversationId) {
			activeConversationId.value = conversations.value[0]?.id ?? null
		}
	}

	function toggleParticipant(conversationId: string, agentId: string): void {
		const conversation = getConversation(conversationId)
		if (!conversation) return
		conversation.participantIds = conversation.participantIds.includes(agentId)
			? conversation.participantIds.filter((id) => id !== agentId)
			: [...conversation.participantIds, agentId]
		conversation.requestLimit = Math.max(
			conversation.requestLimit,
			conversation.participantIds.length * conversation.roundLimit
		)
		conversation.updatedAt = Date.now()
	}

	function addMemory(agentId: string, content: string): void {
		const agent = getAgent(agentId)
		const value = content.trim()
		if (!agent || !value) return
		agent.memories.unshift(createMemoryEntry(value))
		agent.updatedAt = Date.now()
	}

	function removeMemory(agentId: string, memoryId: string): void {
		const agent = getAgent(agentId)
		if (!agent) return
		agent.memories = agent.memories.filter((item) => item.id !== memoryId)
		agent.updatedAt = Date.now()
	}

	async function setAgentSecret(agentId: string, secret: string): Promise<void> {
		const value = secret.trim()
		if (value) {
			await writeStoredSecret(agentId, value)
			runtimeSecrets.set(agentId, value)
		} else {
			await removeStoredSecret(agentId)
			runtimeSecrets.delete(agentId)
		}
		secretVersion.value += 1
	}

	function getAgentSecret(agentId: string): string {
		void secretVersion.value
		return runtimeSecrets.get(agentId) ?? ""
	}

	function addMessage(
		conversationId: string,
		message: Omit<ChatMessage, "conversationId">
	): ChatMessage {
		const next: ChatMessage = { ...message, conversationId }
		const messages = getMessages(conversationId)
		messages.push(next)
		const conversation = getConversation(conversationId)
		if (conversation) {
			conversation.lastMessagePreview = sanitizePreview(next.content)
			conversation.updatedAt = Date.now()
		}
		persistMessages(conversationId)
		return next
	}

	function patchMessage(
		conversationId: string,
		messageId: string,
		patch: Partial<Pick<ChatMessage, "content" | "status" | "usage" | "error">>
	): void {
		const message = getMessages(conversationId).find(
			(item) => item.id === messageId
		)
		if (!message) return
		Object.assign(message, patch)
		const conversation = getConversation(conversationId)
		if (conversation) {
			conversation.lastMessagePreview = sanitizePreview(message.content)
			conversation.updatedAt = Date.now()
		}
	}

	function setMessageStatus(
		conversationId: string,
		messageId: string,
		status: MessageStatus
	): void {
		patchMessage(conversationId, messageId, { status })
		persistMessages(conversationId)
	}

	function setConversationStatus(
		conversationId: string,
		status: ConversationStatus
	): void {
		const conversation = getConversation(conversationId)
		if (!conversation) return
		conversation.status = status
		conversation.updatedAt = Date.now()
		if (status !== "running") conversation.activeAgentId = undefined
	}

	function setActiveAgent(
		conversationId: string,
		agentId?: string
	): void {
		const conversation = getConversation(conversationId)
		if (!conversation) return
		conversation.activeAgentId = agentId
	}

	function addConversationUsage(
		conversationId: string,
		usage: TokenUsage
	): void {
		const conversation = getConversation(conversationId)
		if (!conversation) return
		conversation.usage = {
			promptTokens: conversation.usage.promptTokens + usage.promptTokens,
			completionTokens:
				conversation.usage.completionTokens + usage.completionTokens,
			totalTokens: conversation.usage.totalTokens + usage.totalTokens,
			requestCount: conversation.usage.requestCount + usage.requestCount,
			latencyMs: conversation.usage.latencyMs + usage.latencyMs,
		}
	}

	function estimateContextTokens(
		messages: ChatMessage[],
		extra = ""
	): number {
		return messages.reduce(
			(total, message) => total + estimateTokens(message.content) + 4,
			estimateTokens(extra)
		)
	}

	return {
		agents,
		conversations,
		messagesByConversation,
		activeConversationId,
		selectedAgentId,
		initialized,
		secretVersion,
		activeConversation,
		activeMessages,
		activeAgents,
		selectedAgent,
		totalUsage,
		isRunning,
		initialize,
		getAgent,
		getConversation,
		getMessages,
		persistMessages,
		addAgent,
		removeAgent,
		addConversation,
		selectConversation,
		renameConversation,
		deleteConversation,
		toggleParticipant,
		addMemory,
		removeMemory,
		setAgentSecret,
		getAgentSecret,
		addMessage,
		patchMessage,
		setMessageStatus,
		setConversationStatus,
		setActiveAgent,
		addConversationUsage,
		estimateContextTokens,
	}
})
