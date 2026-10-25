import { describe, expect, it } from "vitest"
import { EMOJI_CATEGORIES, EMOJI_DATA_SOURCE } from "../src/features/chat/emoji"

describe("emoji catalog", () => {
	it("provides the complete category set without empty groups", () => {
		expect(EMOJI_CATEGORIES.map((category) => category.id)).toEqual([
			"frequent",
			"smileys",
			"people",
			"nature",
			"food",
			"travel",
			"activities",
			"objects",
			"symbols",
			"flags",
		])

		for (const category of EMOJI_CATEGORIES) {
			expect(category.emojis.length, category.id).toBeGreaterThan(20)
			expect(category.emojis.every((emoji) => emoji.trim() === emoji)).toBe(true)
		}
	})

	it("contains a broad deduplicated catalog", () => {
		const unique = new Set(
			EMOJI_CATEGORIES.flatMap((category) => [...category.emojis])
		)

		expect(unique.size).toBeGreaterThanOrEqual(450)
	})

	it("keeps frequent and category entries individually unique", () => {
		for (const category of EMOJI_CATEGORIES) {
			expect(new Set(category.emojis).size, category.id).toBe(
				category.emojis.length
			)
		}
	})

	it("records the upstream data source and license", () => {
		expect(EMOJI_DATA_SOURCE).toEqual({
			project: "iamcal/emoji-data",
			url: "https://github.com/iamcal/emoji-data",
			license: "MIT",
		})
	})
})
