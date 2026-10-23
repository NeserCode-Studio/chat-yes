export const DEFAULT_CHAT_FONT_FAMILY =
	'"Noto Sans", "Noto Sans SC", "PingFang SC", "Microsoft YaHei UI", sans-serif'

export const CHAT_FONT_FAMILY_OPTIONS = [
	"Noto Sans",
	"Noto Sans SC",
	"Source Han Sans SC",
	"PingFang SC",
	"Microsoft YaHei UI",
	"Segoe UI",
	"Bahnschrift",
	"Aptos",
	"Cascadia Code",
	"JetBrains Mono",
	"Georgia",
] as const

const GENERIC_FONT_FAMILIES = new Set([
	"serif",
	"sans-serif",
	"monospace",
	"cursive",
	"fantasy",
	"system-ui",
])

export function isGenericFontFamily(value: string): boolean {
	return GENERIC_FONT_FAMILIES.has(value.trim().toLowerCase())
}

export function normalizeFontFamilyName(value: string): string {
	return value
		.trim()
		.replace(/^\uFEFF/, "")
		.replace(/^["']|["']$/g, "")
		.replace(/[\r\n,"']/g, " ")
		.replace(/\s+/g, " ")
		.trim()
}

export function normalizeInstalledFontFamilies(
	values: readonly string[]
): string[] {
	const seen = new Set<string>()
	return values
		.map(normalizeFontFamilyName)
		.filter((font) => {
			const key = font.toLowerCase()
			if (
				!font ||
				font.startsWith("@") ||
				isGenericFontFamily(font) ||
				seen.has(key)
			) {
				return false
			}
			seen.add(key)
			return true
		})
		.sort((left, right) =>
			left.localeCompare(right, undefined, {
				numeric: true,
				sensitivity: "base",
			})
		)
}

export function parseFontFamilyStack(value: string): string[] {
	const seen = new Set<string>()
	return value
		.split(",")
		.map(normalizeFontFamilyName)
		.filter((family) => {
			const key = family.toLowerCase()
			if (!family || seen.has(key)) return false
			seen.add(key)
			return true
		})
}

export function serializeFontFamilyStack(
	families: string[],
	fallback = "sans-serif"
): string {
	const seen = new Set<string>()
	const names: string[] = []
	for (const value of families) {
		const family = normalizeFontFamilyName(value)
		const key = family.toLowerCase()
		if (!family || seen.has(key) || isGenericFontFamily(family)) continue
		seen.add(key)
		names.push(`"${family}"`)
	}
	const normalizedFallback = isGenericFontFamily(fallback)
		? fallback.trim().toLowerCase()
		: "sans-serif"
	names.push(normalizedFallback)
	return names.join(", ")
}
