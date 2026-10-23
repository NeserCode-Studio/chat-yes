import { describe, expect, it } from "vitest"
import {
	aggregateMessageUsage,
	buildAgentContext,
	createAgentProfile,
	createMemoryEntry,
	estimateApiContentTokens,
	estimateTokens,
	parseAgentMentionIds,
	parseUniqueAgentMentionIds,
	usageFromCompletion,
} from "../src/features/chat/domain"
import type { ChatMessage } from "../src/features/chat/types"
import {
	resolveCompletionUrl,
	validateAgent,
} from "../src/features/chat/validation"

describe("completion endpoint normalization", () => {
	it("accepts a server root", () => {
		expect(resolveCompletionUrl("http://localhost:1234")).toBe(
			"http://localhost:1234/v1/chat/completions"
		)
	})

	it("accepts a versioned base URL", () => {
		expect(resolveCompletionUrl("https://example.com/v1/")).toBe(
			"https://example.com/v1/chat/completions"
		)
	})

	it("does not duplicate a full endpoint", () => {
		expect(
			resolveCompletionUrl("https://example.com/v1/chat/completions")
		).toBe("https://example.com/v1/chat/completions")
	})
})

describe("agent validation", () => {
	it("rejects incomplete or insecure configurations", () => {
		const agent = createAgentProfile()
		agent.endpoint = "file:///tmp/model"
		agent.model = ""

		const validation = validateAgent(agent)

		expect(validation.valid).toBe(false)
		expect(validation.reasons).toContain("Model is required")
		expect(validation.reasons).toContain("Endpoint must use HTTP or HTTPS")
	})
})

describe("agent context construction", () => {
	it("does not force a persona when the agent role is custom", () => {
		const agent = createAgentProfile()
		agent.systemPrompt = "Respond as a friendly research assistant."

		const context = buildAgentContext(agent, [agent], [])

		expect(agent.role).toBe("custom")
		expect(context[0].content).toContain("You are Agent 01.")
		expect(context[0].content).toContain(
			"Respond as a friendly research assistant."
		)
		expect(context[0].content).not.toContain("acting as")
	})

	it("includes memory only when read permission is enabled", () => {
		const agent = createAgentProfile()
		agent.memories = [createMemoryEntry("Prefer short implementation plans.")]
		const messages: ChatMessage[] = [
			{
				id: "m1",
				conversationId: "c1",
				role: "user",
				content: "Plan the migration.",
				status: "complete",
				createdAt: Date.now(),
			},
		]

		const withMemory = buildAgentContext(agent, [agent], messages)
		expect(withMemory[0].content).toContain("Prefer short implementation plans.")

		agent.permissions.readMemory = false
		const withoutMemory = buildAgentContext(agent, [agent], messages)
		expect(withoutMemory[0].content).not.toContain(
			"Prefer short implementation plans."
		)
	})

	it("labels messages from other agents as shared discussion", () => {
		const agent = createAgentProfile(0)
		agent.name = "Reviewer"
		const other = createAgentProfile(1)
		other.name = "Builder"
		const messages: ChatMessage[] = [
			{
				id: "m1",
				conversationId: "c1",
				role: "assistant",
				agentId: other.id,
				content: "I will implement the parser.",
				status: "complete",
				createdAt: Date.now(),
			},
		]

		const context = buildAgentContext(agent, [agent, other], messages)
		expect(context[1]).toEqual({
			role: "user",
			content: "[Builder]\nI will implement the parser.",
		})
	})

	it("includes the active group mode in the system context", () => {
		const agent = createAgentProfile()

		const relayContext = buildAgentContext(agent, [agent], [], "relay")
		const roundtableContext = buildAgentContext(
			agent,
			[agent],
			[],
			"roundtable"
		)

		expect(relayContext[0].content).toContain("Group mode: relay")
		expect(roundtableContext[0].content).toContain("Group mode: roundtable")
	})

	it("keeps the newest messages inside the context budget", () => {
		const agent = createAgentProfile()
		agent.contextWindow = 1100
		agent.maxTokens = 600
		const messages = Array.from({ length: 40 }, (_, index) => ({
			id: `m${index}`,
			conversationId: "c1",
			role: "user" as const,
			content: `Message ${index}: ${"context ".repeat(12)}`,
			status: "complete" as const,
			createdAt: index,
		}))

		const context = buildAgentContext(agent, [agent], messages)
		const joined = context.map((message) => message.content).join("\n")

		expect(context.length).toBeLessThan(messages.length + 1)
		expect(joined).toContain("Message 39")
		expect(joined).not.toContain("Message 0:")
	})

	it("sends image attachments as multimodal user content", () => {
		const agent = createAgentProfile()
		const messages: ChatMessage[] = [
			{
				id: "m1",
				conversationId: "c1",
				role: "user",
				content: "Describe this image",
				status: "complete",
				createdAt: Date.now(),
				attachments: [
					{
						id: "image-1",
						kind: "image",
						name: "sample.png",
						mimeType: "image/png",
						dataUrl: "data:image/png;base64,AAAA",
						width: 640,
						height: 480,
						size: 4,
					},
				],
			},
		]

		const context = buildAgentContext(agent, [agent], messages)

		expect(Array.isArray(context[1].content)).toBe(true)
		expect(context[1].content).toEqual([
			{ type: "text", text: "Describe this image" },
			{
				type: "image_url",
				image_url: { url: "data:image/png;base64,AAAA" },
			},
		])
		expect(estimateApiContentTokens(context[1].content)).toBeGreaterThan(
			estimateTokens("Describe this image")
		)
	})
})

describe("agent mention parsing", () => {
	it("preserves occurrence order and supports CJK punctuation", () => {
		const first = createAgentProfile(0)
		first.name = "Builder"
		const second = createAgentProfile(1)
		second.name = "Reviewer"
		const text = "@Builder，请先实现；然后 @Reviewer: 复核，最后 @Builder。"

		expect(parseAgentMentionIds(text, [first, second])).toEqual([
			first.id,
			second.id,
			first.id,
		])
		expect(parseUniqueAgentMentionIds(text, [first, second])).toEqual([
			first.id,
			second.id,
		])
	})
})

describe("usage accounting", () => {
	it("sums per-message usage and reports latency", () => {
		const first = usageFromCompletion(
			{ promptTokens: 10, completionTokens: 20, totalTokens: 30 },
			500
		)
		const second = usageFromCompletion(
			{ promptTokens: 5, completionTokens: 8, totalTokens: 13 },
			300
		)
		const messages: ChatMessage[] = [
			{
				id: "m1",
				conversationId: "c1",
				role: "assistant",
				content: "one",
				status: "complete",
				createdAt: 1,
				usage: first,
			},
			{
				id: "m2",
				conversationId: "c1",
				role: "assistant",
				content: "two",
				status: "complete",
				createdAt: 2,
				usage: second,
			},
		]

		expect(aggregateMessageUsage(messages)).toEqual({
			promptTokens: 15,
			completionTokens: 28,
			totalTokens: 43,
			requestCount: 2,
			latencyMs: 800,
		})
	})

	it("estimates CJK text more conservatively than Latin text", () => {
		expect(estimateTokens("这是一段中文上下文")).toBeGreaterThan(
			estimateTokens("plain english text")
		)
	})
})
