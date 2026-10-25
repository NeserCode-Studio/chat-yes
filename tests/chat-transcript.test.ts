import { describe, expect, it } from "vitest"
import { transcriptScrollSignature } from "../src/features/chat/transcript"
import type { ChatMessage } from "../src/features/chat/types"

function message(
	overrides: Partial<ChatMessage> & Pick<ChatMessage, "id" | "content">
): ChatMessage {
	return {
		conversationId: "conversation-1",
		role: "assistant",
		status: "streaming",
		createdAt: 1,
		...overrides,
	}
}

describe("transcript auto-scroll signature", () => {
	it("ignores reasoning-only updates", () => {
		const before = message({
			id: "assistant-1",
			content: "",
			reasoning: "First thought",
		})
		const after = {
			...before,
			reasoning: "First thought\nSecond thought",
		}

		expect(transcriptScrollSignature([before])).toBe(
			transcriptScrollSignature([after])
		)
	})

	it("still responds to new messages, status and visible content", () => {
		const initial = message({ id: "assistant-1", content: "" })
		const withContent = { ...initial, content: "Visible reply" }
		const completed = { ...withContent, status: "complete" as const }
		const second = message({ id: "assistant-2", content: "" })

		expect(transcriptScrollSignature([initial])).not.toBe(
			transcriptScrollSignature([withContent])
		)
		expect(transcriptScrollSignature([withContent])).not.toBe(
			transcriptScrollSignature([completed])
		)
		expect(transcriptScrollSignature([completed])).not.toBe(
			transcriptScrollSignature([completed, second])
		)
	})
})
