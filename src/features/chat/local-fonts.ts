import { invoke } from "@tauri-apps/api/core"

export type LocalFontSource = "desktop" | "browser" | "unavailable"

export interface LocalFontReadResult {
	fonts: string[]
	source: LocalFontSource
}

interface BrowserFontData {
	family: string
}

type LocalFontAccessWindow = Window & {
	queryLocalFonts?: () => Promise<BrowserFontData[]>
}

function isTauriRuntime(): boolean {
	return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export async function readLocalFontFamilies(): Promise<LocalFontReadResult> {
	if (isTauriRuntime()) {
		const fonts = await invoke<string[]>("list_local_fonts")
		return { fonts, source: "desktop" }
	}

	const queryLocalFonts = (window as LocalFontAccessWindow).queryLocalFonts
	if (typeof queryLocalFonts === "function") {
		const fonts = await queryLocalFonts.call(window)
		return {
			fonts: fonts.map((font) => font.family),
			source: "browser",
		}
	}

	return { fonts: [], source: "unavailable" }
}
