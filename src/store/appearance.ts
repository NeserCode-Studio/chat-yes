import { defineStore } from "pinia"
import { useLocalStorage } from "@vueuse/core"
import { watch } from "vue"

export type SubmitKey = "enter" | "ctrl-enter"

const FONT_SIZE_KEY = "chat-yes.font-size.v1"
const FONT_FAMILY_KEY = "chat-yes.font-family.v1"
const SUBMIT_KEY = "chat-yes.submit-key.v1"

const DEFAULT_FONT_SIZE = 14
const DEFAULT_FONT_FAMILY =
	'"Noto Sans", "Noto Sans SC", "PingFang SC", "Microsoft YaHei UI", sans-serif'

function clampFontSize(value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_FONT_SIZE
	return Math.min(24, Math.max(12, Math.round(value)))
}

export const useAppearanceStore = defineStore("app-appearance", () => {
	const fontSize = useLocalStorage<number>(FONT_SIZE_KEY, DEFAULT_FONT_SIZE)
	const fontFamily = useLocalStorage<string>(FONT_FAMILY_KEY, DEFAULT_FONT_FAMILY)
	const submitKey = useLocalStorage<SubmitKey>(SUBMIT_KEY, "enter")

	fontSize.value = clampFontSize(fontSize.value)
	if (!fontFamily.value.trim()) fontFamily.value = DEFAULT_FONT_FAMILY
	if (submitKey.value !== "enter" && submitKey.value !== "ctrl-enter") {
		submitKey.value = "enter"
	}

	watch(
		[fontSize, fontFamily],
		() => {
			document.documentElement.style.setProperty(
				"--chat-font-size",
				`${clampFontSize(fontSize.value)}px`
			)
			document.documentElement.style.setProperty(
				"--chat-font-family",
				fontFamily.value.trim() || DEFAULT_FONT_FAMILY
			)
		},
		{ immediate: true }
	)

	function setFontSize(value: number): void {
		fontSize.value = clampFontSize(value)
	}

	function reset(): void {
		fontSize.value = DEFAULT_FONT_SIZE
		fontFamily.value = DEFAULT_FONT_FAMILY
		submitKey.value = "enter"
	}

	return {
		fontSize,
		fontFamily,
		submitKey,
		setFontSize,
		reset,
	}
})
