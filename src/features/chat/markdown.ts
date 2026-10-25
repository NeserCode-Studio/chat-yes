export interface MarkdownRenderOptions {
	mentionNames?: string[]
}

const ESCAPABLE = new Set([
	"\\",
	"`",
	"*",
	"_",
	"{",
	"}",
	"[",
	"]",
	"(",
	")",
	"#",
	"+",
	"-",
	".",
	"!",
	"|",
	">",
	"~",
])

export function renderMarkdown(
	source: string,
	options: MarkdownRenderOptions = {}
): string {
	if (!source.trim()) return ""

	return renderBlocks(
		source.replace(/\r\n?/g, "\n").split("\n"),
		options
	)
}

function renderBlocks(
	lines: string[],
	options: MarkdownRenderOptions
): string {
	const output: string[] = []
	let index = 0

	while (index < lines.length) {
		const line = lines[index]
		if (!line.trim()) {
			index += 1
			continue
		}

		const fence = line.match(
			/^ {0,3}(`{3,}|~{3,})\s*([A-Za-z0-9_+.-]*)\s*$/
		)
		if (fence) {
			const marker = fence[1]
			const language = fence[2]
			const fenceCharacter = marker[0]
			const code: string[] = []
			index += 1

			while (index < lines.length) {
				const candidate = lines[index].trim()
				index += 1
				if (
					candidate.length >= marker.length &&
					[...candidate].every(
						(character) => character === fenceCharacter
					)
				) {
					break
				}
				code.push(lines[index - 1])
			}

			const languageClass = language
				? ` class="language-${escapeHtml(language)}"`
				: ""
			output.push(
				`<pre><code${languageClass}>${escapeHtml(code.join("\n"))}</code></pre>`
			)
			continue
		}

		const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
		if (heading) {
			const level = heading[1].length
			output.push(
				`<h${level}>${renderInline(heading[2], options)}</h${level}>`
			)
			index += 1
			continue
		}

		if (/^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line)) {
			output.push("<hr>")
			index += 1
			continue
		}

		if (/^ {0,3}>\s?/.test(line)) {
			const quote: string[] = []
			while (
				index < lines.length &&
				/^ {0,3}>\s?/.test(lines[index])
			) {
				quote.push(lines[index].replace(/^ {0,3}>\s?/, ""))
				index += 1
			}
			output.push(`<blockquote>${renderBlocks(quote, options)}</blockquote>`)
			continue
		}

		if (isTableStart(line)) {
			const rows: string[][] = []
			const alignments: Array<"left" | "center" | "right" | null> = []
			const separator = tableSeparator(lines[index + 1])

			if (separator) {
				alignments.push(...separator)
				rows.push(tableCells(line))
				index += 2

				while (index < lines.length && isTableStart(lines[index])) {
					rows.push(tableCells(lines[index]))
					index += 1
				}

				const body = rows
					.map((row) => {
						const cells = row
							.map((cell, cellIndex) => {
								const alignment = alignments[cellIndex]
								const alignmentClass = alignment
									? ` class="is-${alignment}"`
									: ""
								return `<td${alignmentClass}>${renderInline(cell, options)}</td>`
							})
							.join("")
						return `<tr>${cells}</tr>`
					})
					.join("")

				output.push(`<table><tbody>${body}</tbody></table>`)
				continue
			}
		}

		const listItem = listMarker(line)
		if (listItem) {
			const ordered = listItem.ordered
			const items: string[] = []

			while (index < lines.length) {
				const item = listMarker(lines[index])
				if (!item || item.ordered !== ordered) break

				const content = [item.content]
				index += 1
				while (index < lines.length) {
					const continuation = lines[index]
					if (
						!continuation.trim() ||
						listMarker(continuation) ||
						isBlockStart(continuation)
					) {
						break
					}
					content.push(continuation.trim())
					index += 1
				}
				items.push(`<li>${renderInline(content.join("\n"), options)}</li>`)

				if (index < lines.length && !lines[index].trim()) {
					let next = index + 1
					while (next < lines.length && !lines[next].trim()) next += 1
					const nextItem =
						next < lines.length ? listMarker(lines[next]) : null
					if (!nextItem || nextItem.ordered !== ordered) break
					index = next
				}
			}

			const tag = ordered ? "ol" : "ul"
			output.push(`<${tag}>${items.join("")}</${tag}>`)
			continue
		}

		const paragraph: string[] = [line]
		index += 1
		while (
			index < lines.length &&
			lines[index].trim() &&
			!isBlockStart(lines[index])
		) {
			paragraph.push(lines[index])
			index += 1
		}
		output.push(`<p>${renderInline(paragraph.join("\n"), options)}</p>`)
	}

	return output.join("\n")
}

function listMarker(
	line: string
): { ordered: boolean; content: string } | null {
	const match = line.match(/^ {0,3}([-+*]|\d+[.)])\s+(.*)$/)
	if (!match) return null
	return {
		ordered: /^\d/.test(match[1]),
		content: match[2],
	}
}

function isTableStart(line: string): boolean {
	return line.trim().startsWith("|") && line.trim().endsWith("|")
}

function tableSeparator(line: string | undefined): Array<"left" | "center" | "right" | null> | null {
	if (!line || !isTableStart(line)) return null
	const cells = tableCells(line)
	if (!cells.length) return null

	return cells.map((cell) => {
		const value = cell.replace(/[-:]/g, "")
		if (value.trim()) return null
		const left = cell.trimStart().startsWith(":")
		const right = cell.trimEnd().endsWith(":")
		if (left && right) return "center"
		if (right) return "right"
		if (left) return "left"
		return null
	})
}

function tableCells(line: string): string[] {
	return line
		.trim()
		.replace(/^\|/, "")
		.replace(/\|$/, "")
		.split(/(?<!\\)\|/)
		.map((cell) => cell.trim().replace(/\\\|/g, "|"))
}

function isBlockStart(line: string): boolean {
	return (
		/^ {0,3}(`{3,}|~{3,})/.test(line) ||
		/^ {0,3}#{1,6}\s+/.test(line) ||
		/^ {0,3}>\s?/.test(line) ||
		isTableStart(line) ||
		/^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(
			line
		) ||
		listMarker(line) !== null
	)
}

function renderInline(
	value: string,
	options: MarkdownRenderOptions
): string {
	let output = ""
	let index = 0
	let plainStart = 0

	const flushPlain = (end: number): void => {
		if (end <= plainStart) return
		output += renderPlainText(value.slice(plainStart, end), options)
	}

	while (index < value.length) {
		const character = value[index]
		const next = value[index + 1]

		if (character === "\\" && next && ESCAPABLE.has(next)) {
			flushPlain(index)
			output += escapeHtml(next)
			index += 2
			plainStart = index
			continue
		}

		if (character === "`") {
			const ticks = value.slice(index).match(/^`+/)?.[0] ?? "`"
			const end = value.indexOf(ticks, index + ticks.length)
			if (end !== -1) {
				flushPlain(index)
				output += `<code>${escapeHtml(
					value
						.slice(index + ticks.length, end)
						.replace(/\s*\n\s*/g, " ")
				)}</code>`
				index = end + ticks.length
				plainStart = index
				continue
			}
		}

		if (character === "!" && next === "[") {
			const image = parseLink(value, index + 1)
			if (image) {
				const source = safeUrl(image.destination)
				if (source) {
					flushPlain(index)
					output += `<img src="${escapeHtml(source)}" alt="${escapeHtml(
						image.label
					)}" loading="lazy">`
				}
				index = image.end
				if (source) plainStart = index
				continue
			}
		}

		if (character === "[") {
			const link = parseLink(value, index)
			if (link) {
				const destination = safeUrl(link.destination)
				if (destination) {
					flushPlain(index)
					output += `<a href="${escapeHtml(
						destination
					)}" target="_blank" rel="noopener noreferrer nofollow">${renderInline(
						link.label,
						options
					)}</a>`
				}
				index = link.end
				if (destination) plainStart = index
				continue
			}
		}

		const strongMarker =
			value.startsWith("**", index) || value.startsWith("__", index)
				? value.slice(index, index + 2)
				: ""
		if (strongMarker) {
			const end = value.indexOf(strongMarker, index + 2)
			if (end > index + 2) {
				flushPlain(index)
				output += `<strong>${renderInline(
					value.slice(index + 2, end),
					options
				)}</strong>`
				index = end + 2
				plainStart = index
				continue
			}
		}

		if (value.startsWith("~~", index)) {
			const end = value.indexOf("~~", index + 2)
			if (end > index + 2) {
				flushPlain(index)
				output += `<del>${renderInline(
					value.slice(index + 2, end),
					options
				)}</del>`
				index = end + 2
				plainStart = index
				continue
			}
		}

		if (character === "*" || character === "_") {
			const previous = value[index - 1] ?? ""
			const end = value.indexOf(character, index + 1)
			if (
				!(character === "_" && /[A-Za-z0-9]/.test(previous)) &&
				end > index + 1
			) {
				flushPlain(index)
				output += `<em>${renderInline(
					value.slice(index + 1, end),
					options
				)}</em>`
				index = end + 1
				plainStart = index
				continue
			}
		}

		index += 1
	}

	flushPlain(value.length)
	return output
}

function parseLink(
	value: string,
	start: number
): { label: string; destination: string; end: number } | null {
	if (value[start] !== "[") return null
	const labelEnd = value.indexOf("](", start + 1)
	if (labelEnd === -1) return null
	const destinationEnd = value.indexOf(")", labelEnd + 2)
	if (destinationEnd === -1) return null

	const destination = value
		.slice(labelEnd + 2, destinationEnd)
		.trim()
		.split(/\s+/, 1)[0]
	if (!destination) return null

	return {
		label: value.slice(start + 1, labelEnd),
		destination,
		end: destinationEnd + 1,
	}
}

function safeUrl(value: string): string | null {
	const url = value.trim()
	return /^(?:https?:\/\/|mailto:)/i.test(url) ? url : null
}

function renderPlainText(
	value: string,
	options: MarkdownRenderOptions
): string {
	const names = [
		...new Set(
			(options.mentionNames ?? [])
				.map((name) => name.trim())
				.filter(Boolean)
		),
	].sort((left, right) => right.length - left.length)

	if (!names.length) return escapeHtml(value).replace(/\n/g, "<br>")

	const escapedNames = names.map((name) =>
		name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	)
	const pattern = new RegExp(`(@(?:${escapedNames.join("|")}))`, "g")
	const mentions = new Set(names.map((name) => `@${name}`))

	return value
		.split(pattern)
		.filter(Boolean)
		.map((part) =>
			mentions.has(part)
				? `<span class="nextchat-mention">${escapeHtml(part)}</span>`
				: escapeHtml(part).replace(/\n/g, "<br>")
		)
		.join("")
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;")
}
