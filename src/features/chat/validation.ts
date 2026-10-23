import type { AgentProfile } from "./types"

export interface AgentValidation {
	valid: boolean
	reasons: string[]
}

export function validateAgent(agent: AgentProfile): AgentValidation {
	const reasons: string[] = []
	if (!agent.name.trim()) reasons.push("Agent name is required")
	if (!agent.model.trim()) reasons.push("Model is required")
	if (!agent.endpoint.trim()) reasons.push("Endpoint is required")

	try {
		const url = new URL(agent.endpoint)
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			reasons.push("Endpoint must use HTTP or HTTPS")
		}
	} catch {
		reasons.push("Endpoint is not a valid URL")
	}

	if (agent.contextWindow < 1024) reasons.push("Context window is too small")
	if (agent.maxTokens < 1) reasons.push("Max tokens must be positive")

	return {
		valid: reasons.length === 0,
		reasons,
	}
}

export function resolveCompletionUrl(endpoint: string): string {
	const normalized = endpoint.trim().replace(/\/+$/, "")
	if (normalized.endsWith("/chat/completions")) return normalized
	if (/\/v\d+$/i.test(normalized)) return `${normalized}/chat/completions`
	return `${normalized}/v1/chat/completions`
}
