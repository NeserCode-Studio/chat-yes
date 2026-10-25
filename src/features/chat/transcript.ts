import type { ChatMessage } from "./types"

type ScrollSignatureMessage = Pick<
	ChatMessage,
	"id" | "content" | "status"
>

export function transcriptScrollSignature(
	messages: ScrollSignatureMessage[]
): string {
	const last = messages[messages.length - 1]
	const streaming = messages
		.filter((message) => message.status === "streaming")
		.map((message) => `${message.id}:${message.content.length}`)
		.join(",")

	return `${messages.length}:${last?.id ?? ""}:${last?.content.length ?? 0}:${last?.status ?? ""}:${streaming}`
}
