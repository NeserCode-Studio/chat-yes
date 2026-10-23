import { describe, expect, it } from "vitest"
import {
	DEFAULT_CHAT_FONT_FAMILY,
	normalizeInstalledFontFamilies,
	parseFontFamilyStack,
	serializeFontFamilyStack,
} from "../src/features/chat/font-family"

describe("chat font family stacks", () => {
	it("parses quoted local font names and the generic fallback", () => {
		expect(parseFontFamilyStack(DEFAULT_CHAT_FONT_FAMILY)).toEqual([
			"Noto Sans",
			"Noto Sans SC",
			"PingFang SC",
			"Microsoft YaHei UI",
			"sans-serif",
		])
	})

	it("preserves selection order while removing duplicates", () => {
		expect(
			serializeFontFamilyStack([
				"Noto Sans SC",
				"Noto Sans",
				"Noto Sans SC",
				"sans-serif",
			])
		).toBe('"Noto Sans SC", "Noto Sans", sans-serif')
	})

	it("normalizes custom names and keeps one generic fallback", () => {
		expect(
			serializeFontFamilyStack(
				['  "LXGW WenKai"  ', "Segoe UI", "serif"],
				"serif"
			)
		).toBe('"LXGW WenKai", "Segoe UI", serif')
	})

	it("normalizes, deduplicates and sorts installed font families", () => {
		expect(
			normalizeInstalledFontFamilies([
				" Segoe UI ",
				"@Microsoft YaHei",
				"\uFEFFAptos",
				"segoe ui",
				"sans-serif",
				"LXGW WenKai",
			])
		).toEqual(["Aptos", "LXGW WenKai", "Segoe UI"])
	})
})
