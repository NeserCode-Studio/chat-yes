import { completeChat, ChatApiError } from "./api"
import {
	buildAgentContext,
	estimateApiContentTokens,
	estimateTokens,
	usageFromCompletion,
} from "./domain"
import { createId } from "./ids"
import type { ChatStore } from "./store-types"
import type {
	AgentProfile,
	ChatMessage,
	Conversation,
	RunOptions,
} from "./types"
import { validateAgent } from "./validation"

export interface RunResult {
	status: "completed" | "stopped" | "error"
	requests: number
	message?: string
}

function addEvent(
	store: ChatStore,
	conversationId: string,
	content: string
): ChatMessage {
	return store.addMessage(conversationId, {
		id: createId("message"),
		role: "event",
		content,
		status: "complete",
		createdAt: Date.now(),
	})
}

function canRunAgent(
	agent: AgentProfile,
	conversation: Conversation,
	round: number,
	participantIndex: number,
	explicitlyMentioned: boolean,
	runRequests: number
): string | null {
	if (!agent.enabled) {
		return `${agent.name} is disabled`
	}

	const validation = validateAgent(agent)
	if (!validation.valid) return validation.reasons.join("; ")

	const isExplicitTurn =
		round === 1 && (participantIndex === 0 || explicitlyMentioned)
	if (!isExplicitTurn && !agent.permissions.autoReply) {
		return `${agent.name} does not have automatic reply permission`
	}
	if (!isExplicitTurn && !agent.permissions.shareConversation) {
		return `${agent.name} cannot read the shared conversation`
	}
	if (runRequests >= conversation.requestLimit) {
		return "Run request limit reached"
	}
	if (conversation.usage.totalTokens >= conversation.tokenBudget) {
		return "Conversation token budget reached"
	}
	return null
}

function fallbackUsage(
	context: ReturnType<typeof buildAgentContext>,
	content: string,
	latencyMs: number
) {
	const prompt = context.reduce(
		(total, message) =>
			total + estimateApiContentTokens(message.content) + 4,
		0
	)
	const completion = estimateTokens(content)
	return usageFromCompletion(
		{
			promptTokens: prompt,
			completionTokens: completion,
			totalTokens: prompt + completion,
		},
		latencyMs
	)
}

export async function runConversation(
	store: ChatStore,
	conversationId: string,
	options: RunOptions
): Promise<RunResult> {
	const conversation = store.getConversation(conversationId)
	if (!conversation) {
		return { status: "error", requests: 0, message: "Conversation not found" }
	}
	if (conversation.status === "running") {
		return {
			status: "error",
			requests: 0,
			message: "Conversation is already running",
		}
	}

	const participantIds = new Set(options.targetAgentIds ?? [])
	const participants = conversation.participantIds
		.map((id) => store.getAgent(id))
		.filter((agent): agent is AgentProfile => Boolean(agent))
		.filter(
			(agent) =>
				!participantIds.size || participantIds.has(agent.id)
		)
	if (!participants.length) {
		return { status: "error", requests: 0, message: "No participants selected" }
	}

	const invalid = participants
		.map((agent) => ({ agent, validation: validateAgent(agent) }))
		.find((item) => !item.validation.valid)
	if (invalid) {
		return {
			status: "error",
			requests: 0,
			message: `${invalid.agent.name}: ${invalid.validation.reasons.join("; ")}`,
		}
	}

	let requests = 0
	store.setConversationStatus(conversationId, "running")

	try {
		for (let round = 1; round <= conversation.roundLimit; round += 1) {
			for (
				let participantIndex = 0;
				participantIndex < participants.length;
				participantIndex += 1
			) {
				if (options.signal.aborted) {
					store.setConversationStatus(conversationId, "stopped")
					return { status: "stopped", requests }
				}

				const agent = participants[participantIndex]
				const blocked = canRunAgent(
					agent,
					conversation,
					round,
					participantIndex,
					participantIds.has(agent.id),
					requests
				)
				if (blocked) {
					if (round === 1 && participantIndex === 0) {
						addEvent(store, conversationId, blocked)
						store.setConversationStatus(conversationId, "error")
						return { status: "error", requests, message: blocked }
					}
					continue
				}

				store.setActiveAgent(conversationId, agent.id)
				options.onProgress?.(`${agent.name} is responding`)

				const context = buildAgentContext(
					agent,
					participants,
					store.getMessages(conversationId)
				)
				const estimatedInputTokens = context.reduce(
					(total, item) =>
						total + estimateApiContentTokens(item.content) + 4,
					0
				)
				if (
					conversation.usage.totalTokens +
						estimatedInputTokens +
						agent.maxTokens >
					conversation.tokenBudget
				) {
					const detail = "Conversation token budget would be exceeded"
					addEvent(store, conversationId, detail)
					store.setConversationStatus(conversationId, "stopped")
					return { status: "stopped", requests, message: detail }
				}
				const message = store.addMessage(conversationId, {
					id: createId("message"),
					role: "assistant",
					agentId: agent.id,
					content: "",
					status: "streaming",
					createdAt: Date.now(),
				})

				let lastPersist = 0
				try {
					const result = await completeChat({
						endpoint: agent.endpoint,
						apiKey: store.getAgentSecret(agent.id),
						model: agent.model,
						messages: context,
						temperature: agent.temperature,
						maxTokens: agent.maxTokens,
						timeoutMs: agent.timeoutMs,
						retryCount: agent.retryCount,
						streaming: agent.streaming,
						signal: options.signal,
						onDelta: (delta) => {
							const current =
								store
									.getMessages(conversationId)
									.find((item) => item.id === message.id)?.content ?? ""
							store.patchMessage(conversationId, message.id, {
								content: current + delta,
							})
							const now = Date.now()
							if (now - lastPersist > 600) {
								store.persistMessages(conversationId)
								lastPersist = now
							}
						},
					})

					const hasUsage =
						result.usage.totalTokens > 0 ||
						result.usage.promptTokens > 0 ||
						result.usage.completionTokens > 0
					const usage = hasUsage
						? usageFromCompletion(result.usage, result.latencyMs)
						: fallbackUsage(
								context,
								result.content,
								result.latencyMs
							)

					store.patchMessage(conversationId, message.id, {
						content: result.content,
						status: "complete",
						usage,
					})
					store.addConversationUsage(conversationId, usage)
					store.persistMessages(conversationId)
					requests += 1
				} catch (error) {
					if (options.signal.aborted) {
						store.setMessageStatus(conversationId, message.id, "stopped")
						store.setConversationStatus(conversationId, "stopped")
						return { status: "stopped", requests }
					}

					const detail =
						error instanceof ChatApiError
							? `${error.status ? `HTTP ${error.status}: ` : ""}${error.message}`
							: error instanceof Error
								? error.message
								: "Unknown chat error"
					store.patchMessage(conversationId, message.id, {
						status: "error",
						error: detail,
					})
					store.persistMessages(conversationId)
					store.setConversationStatus(conversationId, "error")
					return { status: "error", requests, message: detail }
				}
			}
		}

		store.setConversationStatus(conversationId, "idle")
		return { status: "completed", requests }
	} catch (error) {
		const detail =
			error instanceof Error ? error.message : "Conversation run failed"
		addEvent(store, conversationId, detail)
		store.persistMessages(conversationId)
		store.setConversationStatus(conversationId, "error")
		return { status: "error", requests, message: detail }
	} finally {
		store.setActiveAgent(conversationId)
	}
}
