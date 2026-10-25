import { describe, expect, it } from "vitest"
import { renderMarkdown } from "../src/features/chat/markdown"
import { latestReasoningLines } from "../src/features/chat/reasoning"

describe("chat markdown rendering", () => {
	it("renders common block and inline markdown", () => {
		const html = renderMarkdown(
			[
				"# Plan",
				"",
				"Use **bold**, *italic* and `inline code`.",
				"",
				"- First",
				"- Second",
				"",
				"```ts",
				"const ready = true",
				"```",
				"",
				"[Documentation](https://example.com/docs)",
			].join("\n")
		)

		expect(html).toContain("<h1>Plan</h1>")
		expect(html).toContain("<strong>bold</strong>")
		expect(html).toContain("<em>italic</em>")
		expect(html).toContain("<code>inline code</code>")
		expect(html).toContain("<ul><li>First</li><li>Second</li></ul>")
		expect(html).toContain(
			'<pre><code class="language-ts">const ready = true</code></pre>'
		)
		expect(html).toContain(
			'href="https://example.com/docs" target="_blank" rel="noopener noreferrer nofollow"'
		)
	})

	it("escapes raw HTML and rejects unsafe link destinations", () => {
		const html = renderMarkdown(
			'<script>alert("x")</script>\n\n[Unsafe](javascript:alert(1))'
		)

		expect(html).not.toContain("<script>")
		expect(html).toContain("&lt;script&gt;")
		expect(html).not.toContain('href="javascript:')
	})

	it("highlights mentions in prose but not in code", () => {
		const html = renderMarkdown("@Builder check `@Reviewer` next.", {
			mentionNames: ["Builder", "Reviewer"],
		})

		expect(html).toContain(
			'<span class="nextchat-mention">@Builder</span>'
		)
		expect(html).toContain("<code>@Reviewer</code>")
		expect(html).not.toContain(
			'<span class="nextchat-mention">@Reviewer</span>'
		)
	})

	it("renders GFM tables with alignment and escaped pipes", () => {
		const html = renderMarkdown(
			[
				"| Character | Detail | Score |",
				"| :--- | ---: | :---: |",
				"| A | Left `\\|` text | 40 |",
			].join("\n")
		)

		expect(html).toContain("<table><tbody>")
		expect(html).toContain('<td class="is-left">Character</td>')
		expect(html).toContain('<td class="is-right">Detail</td>')
		expect(html).toContain('<td class="is-center">Score</td>')
		expect(html).toContain("<code>|</code>")
		expect(html).toContain('<td class="is-left">A</td>')
	})
})

describe("reasoning preview", () => {
	it("keeps the newest four lines while streaming", () => {
		const reasoning = "line 1\nline 2\nline 3\nline 4\nline 5\nline 6"

		expect(latestReasoningLines(reasoning)).toBe(
			"line 3\nline 4\nline 5\nline 6"
		)
	})

	it("ignores surrounding blank lines and normalizes line endings", () => {
		expect(latestReasoningLines("\r\none\r\ntwo\r\nthree\r\n\r\n")).toBe(
			"one\ntwo\nthree"
		)
	})
})
