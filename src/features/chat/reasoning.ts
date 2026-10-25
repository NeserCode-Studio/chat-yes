export function visibleReasoning(value: string): string {
	return value
		.replace(/^(?:[ \t]*\r?\n)+/, "")
		.replace(/(?:\r?\n[ \t]*)+$/, "")
}

export function latestReasoningLines(value: string, count = 4): string {
	const lines = visibleReasoning(value).split(/\r\n?|\n/)
	const visibleCount = Math.max(1, Math.floor(count))
	return lines.slice(-visibleCount).join("\n")
}
