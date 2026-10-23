import { completeChat, ChatApiError } from "./api"
import {
	buildAgentContext,
	CONVERSATION_CONTINUE_TAG,
	estimateApiContentTokens,
	estimateTokens,
	stripTurnControlSignal,
	TURN_CONTROL_TAGS,
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

function streamingDisplayContent(content: string): string {
	const lower = content.toLowerCase()
	for (
		let index = lower.lastIndexOf("<");
		index >= 0;
		index = lower.lastIndexOf("<", index - 1)
	) {
		const suffix = lower.slice(index)
		for (const tag of TURN_CONTROL_TAGS) {
			if (tag.startsWith(suffix)) return content.slice(0, index)
		}
	}
	return content
}

async function raceAbort<T>(
	promise: Promise<T>,
	signal: AbortSignal
): Promise<T | null> {
	if (signal.aborted) return null

	let settled = false
	let resolveRace: (value: T | null) => void
	let rejectRace: (error: unknown) => void
	const race = new Promise<T | null>((resolve, reject) => {
		resolveRace = resolve
		rejectRace = reject
	})
	const onAbort = () => {
		if (settled) return
		settled = true
		resolveRace(null)
	}

	promise.then(
		(value) => {
			if (settled) return
			settled = true
			signal.removeEventListener("abort", onAbort)
			resolveRace(value)
		},
		(error) => {
			if (settled) return
			settled = true
			signal.removeEventListener("abort", onAbort)
			rejectRace(error)
		}
	)

	if (signal.aborted) onAbort()
	else signal.addEventListener("abort", onAbort, { once: true })

	return race
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

	const turnAgentIds =
		options.targetAgentIds?.filter(Boolean).length
			? options.targetAgentIds.filter(Boolean)
			: conversation.participantIds
	const participants = turnAgentIds
		.map((id) => store.getAgent(id))
		.filter((agent): agent is AgentProfile => Boolean(agent))
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
			let continueRequested = false
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
					turnAgentIds.includes(agent.id),
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
					const requestPromise = completeChat({
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
							if (options.signal.aborted) return
							const current =
								store
									.getMessages(conversationId)
									.find((item) => item.id === message.id)?.content ?? ""
							store.patchMessage(conversationId, message.id, {
								content: streamingDisplayContent(current + delta),
							})
							const now = Date.now()
							if (now - lastPersist > 600) {
								store.persistMessages(conversationId)
								lastPersist = now
							}
						},
						onReasoningDelta: (delta) => {
							if (options.signal.aborted) return
							const current =
								store
									.getMessages(conversationId)
									.find((item) => item.id === message.id)?.reasoning ?? ""
							store.patchMessage(conversationId, message.id, {
								reasoning: current + delta,
							})
							const now = Date.now()
							if (now - lastPersist > 600) {
								store.persistMessages(conversationId)
								lastPersist = now
							}
						},
					})

					const result = await raceAbort(requestPromise, options.signal)
					if (!result) {
						store.setMessageStatus(conversationId, message.id, "stopped")
						store.setConversationStatus(conversationId, "stopped")
						return { status: "stopped", requests }
					}

					const hasUsage =
						result.usage.totalTokens > 0 ||
						result.usage.promptTokens > 0 ||
						result.usage.completionTokens > 0
					const usage = hasUsage
						? usageFromCompletion(result.usage, result.latencyMs)
						: fallbackUsage(
								context,
								result.content + (result.reasoning ?? ""),
								result.latencyMs
							)
					const requestsContinuation = result.content
						.toLowerCase()
						.includes(CONVERSATION_CONTINUE_TAG)
					const visibleContent = stripTurnControlSignal(result.content)

					if (!visibleContent) {
						store.removeMessage(conversationId, message.id)
						store.addConversationUsage(conversationId, usage)
						requests += 1
						continueRequested ||= requestsContinuation
						continue
					}

					store.patchMessage(conversationId, message.id, {
						content: visibleContent,
						reasoning: result.reasoning ?? "",
						status: "complete",
						usage,
					})
					store.addConversationUsage(conversationId, usage)
					store.persistMessages(conversationId)
					requests += 1
					continueRequested ||= requestsContinuation
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

			if (!continueRequested) break
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
