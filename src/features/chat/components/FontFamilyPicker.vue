<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useLocalStorage } from "@vueuse/core"
import {
	ChevronDown,
	CircleAlert,
	Clock3,
	LoaderCircle,
	Plus,
	RefreshCw,
	RotateCcw,
	Search,
	SearchX,
	Trash2,
} from "@lucide/vue"
import {
	PopoverContent,
	PopoverPortal,
	PopoverRoot,
	PopoverTrigger,
} from "reka-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createLogger } from "@/lib/logger"
import { useChatI18n } from "../i18n"
import {
	CHAT_FONT_FAMILY_OPTIONS,
	DEFAULT_CHAT_FONT_FAMILY,
	isGenericFontFamily,
	normalizeFontFamilyName,
	normalizeInstalledFontFamilies,
	parseFontFamilyStack,
	serializeFontFamilyStack,
} from "../font-family"
import {
	readLocalFontFamilies,
	type LocalFontSource,
} from "../local-fonts"

const props = defineProps<{
	modelValue: string
}>()

const emit = defineEmits<{
	"update:modelValue": [value: string]
}>()

const log = createLogger("FontFamilyPicker")
const { t } = useChatI18n()
const rememberedFonts = useLocalStorage<string[]>(
	"chat-yes.font-family-memory.v1",
	[]
)
const open = ref(false)
const customDraft = ref("")
const searchQuery = ref("")
const installedFonts = ref<string[]>([])
const fontSource = ref<LocalFontSource>("unavailable")
const isLoadingFonts = ref(false)
const hasLoadedFonts = ref(false)
const fontLoadFailed = ref(false)
const collator = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: "base",
})

if (!Array.isArray(rememberedFonts.value)) rememberedFonts.value = []

const selectedFonts = computed(() =>
	parseFontFamilyStack(props.modelValue).filter(
		(font) => !isGenericFontFamily(font)
	)
)
const genericFallback = computed(
	() =>
		parseFontFamilyStack(props.modelValue).find((font) =>
			isGenericFontFamily(font)
		) ?? "sans-serif"
)
const fallbackFonts = computed(() =>
	fontSource.value === "unavailable" && !fontLoadFailed.value
		? [...CHAT_FONT_FAMILY_OPTIONS]
		: []
)
const knownFonts = computed(() => {
	const seen = new Set<string>()
	const values = [
		...selectedFonts.value,
		...rememberedFonts.value,
		...(installedFonts.value.length ? installedFonts.value : fallbackFonts.value),
	]
	return values
		.map(normalizeFontFamilyName)
		.filter((font) => {
			const key = font.toLowerCase()
			if (!font || isGenericFontFamily(font) || seen.has(key)) return false
			seen.add(key)
			return true
		})
})
const filteredFontOptions = computed(() => {
	const query = searchQuery.value.trim().toLocaleLowerCase()
	const matches = (font: string) =>
		!query || font.toLocaleLowerCase().includes(query)
	const selected = selectedFonts.value
		.map((selectedFont) =>
			knownFonts.value.find(
				(font) => font.toLowerCase() === selectedFont.toLowerCase()
			)
		)
		.filter(
			(font): font is string => font !== undefined && matches(font)
		)
	const selectedKeys = new Set(selected.map((font) => font.toLowerCase()))
	const remembered = knownFonts.value
		.filter(
			(font) =>
				!selectedKeys.has(font.toLowerCase()) &&
				isRemembered(font) &&
				matches(font)
		)
		.sort(collator.compare)
	const rememberedKeys = new Set(remembered.map((font) => font.toLowerCase()))
	const remaining = knownFonts.value
		.filter(
			(font) =>
				!selectedKeys.has(font.toLowerCase()) &&
				!rememberedKeys.has(font.toLowerCase()) &&
				matches(font)
		)
		.sort(collator.compare)
	return [...selected, ...remembered, ...remaining]
})
const triggerSummary = computed(() => {
	if (!selectedFonts.value.length) return t.value("settings.fontFamilyDefault")
	const visible = selectedFonts.value.slice(0, 2).join(" · ")
	const remaining = selectedFonts.value.length - 2
	return remaining > 0
		? `${visible} +${remaining}`
		: visible
})

function selectedIndex(font: string): number {
	return selectedFonts.value.findIndex(
		(value) => value.toLowerCase() === font.toLowerCase()
	)
}

function isSelected(font: string): boolean {
	return selectedIndex(font) >= 0
}

function isRemembered(font: string): boolean {
	return rememberedFonts.value.some(
		(value) => value.toLowerCase() === font.toLowerCase()
	)
}

function previewStyle(font: string): Record<string, string> {
	return {
		fontFamily: serializeFontFamilyStack([font], genericFallback.value),
	}
}

function rememberFont(font: string): void {
	const normalized = normalizeFontFamilyName(font)
	if (!normalized || isGenericFontFamily(normalized)) return
	rememberedFonts.value = [
		normalized,
		...rememberedFonts.value.filter(
			(value) => value.toLowerCase() !== normalized.toLowerCase()
		),
	].slice(0, 8)
}

function updateStack(fonts: string[]): void {
	emit(
		"update:modelValue",
		serializeFontFamilyStack(fonts, genericFallback.value)
	)
}

function toggleFont(font: string): void {
	const current = selectedFonts.value
	if (isSelected(font)) {
		updateStack(
			current.filter(
				(value) => value.toLowerCase() !== font.toLowerCase()
			)
		)
		return
	}

	rememberFont(font)
	updateStack([...current, font])
}

function addCustomFont(): void {
	const font = normalizeFontFamilyName(customDraft.value)
	if (!font) return
	if (isGenericFontFamily(font)) {
		emit("update:modelValue", serializeFontFamilyStack(selectedFonts.value, font))
		customDraft.value = ""
		return
	}
	rememberFont(font)
	if (!isSelected(font)) updateStack([...selectedFonts.value, font])
	customDraft.value = ""
}

function forgetFont(font: string): void {
	const key = font.toLowerCase()
	rememberedFonts.value = rememberedFonts.value.filter(
		(value) => value.toLowerCase() !== key
	)
}

function resetFonts(): void {
	emit("update:modelValue", DEFAULT_CHAT_FONT_FAMILY)
	customDraft.value = ""
	searchQuery.value = ""
}

async function loadFonts(force = false): Promise<void> {
	if (isLoadingFonts.value || (hasLoadedFonts.value && !force)) return

	isLoadingFonts.value = true
	fontLoadFailed.value = false
	try {
		const result = await readLocalFontFamilies()
		installedFonts.value = normalizeInstalledFontFamilies(result.fonts)
		fontSource.value = result.source
	} catch (error) {
		log.warn("failed to read installed font families", { error })
		fontLoadFailed.value = true
		fontSource.value = "unavailable"
	} finally {
		hasLoadedFonts.value = true
		isLoadingFonts.value = false
	}
}

onMounted(() => {
	void loadFonts()
})
</script>

<template>
	<div class="nextchat-font-picker">
		<PopoverRoot v-model:open="open">
			<PopoverTrigger as-child>
				<button
					type="button"
					class="nextchat-font-picker__trigger"
					:aria-expanded="open"
				>
					<span
						class="nextchat-font-picker__trigger-sample"
						:style="{ fontFamily: modelValue }"
					>
						Aa
					</span>
					<span class="nextchat-font-picker__trigger-copy">
						<span
							class="nextchat-font-picker__trigger-label"
							:style="{ fontFamily: modelValue }"
						>
							{{ triggerSummary }}
						</span>
						<span class="nextchat-font-picker__trigger-meta">
							{{ selectedFonts.length }} · {{ genericFallback }}
						</span>
					</span>
					<ChevronDown
						class="nextchat-font-picker__chevron"
						:class="{ 'is-open': open }"
					/>
				</button>
			</PopoverTrigger>

			<PopoverPortal>
				<PopoverContent
					side="bottom"
					align="end"
					:side-offset="6"
					class="nextchat-font-picker__popover"
				>
					<header class="nextchat-font-picker__header">
						<div class="nextchat-font-picker__heading">
							<p>{{ t("settings.fontFamilyChoose") }}</p>
							<span>
								{{
									isLoadingFonts
										? t("settings.fontFamilyLoading")
										: t("settings.fontFamilyCount", {
												count: installedFonts.length,
											})
								}}
							</span>
						</div>
						<div class="nextchat-font-picker__header-actions">
							<Button
								variant="ghost"
								size="icon"
								class="size-7"
								:disabled="isLoadingFonts"
								:title="t('settings.fontFamilyRefresh')"
								@click="loadFonts(true)"
							>
								<RefreshCw
									class="size-3.5"
									:class="{ 'is-spinning': isLoadingFonts }"
								/>
							</Button>
							<Button
								variant="ghost"
								size="sm"
								class="h-7 px-2 text-xs"
								@click="resetFonts"
							>
								<RotateCcw class="size-3.5" />
								{{ t("settings.fontFamilyReset") }}
							</Button>
						</div>
					</header>

					<label class="nextchat-font-picker__search">
						<Search class="size-3.5" />
						<Input
							v-model="searchQuery"
							:aria-label="t('settings.fontFamilySearch')"
							:placeholder="t('settings.fontFamilySearch')"
							class="h-8 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
						/>
					</label>

					<div class="nextchat-font-picker__list">
						<div
							v-if="fontLoadFailed"
							class="nextchat-font-picker__notice is-error"
							role="alert"
						>
							<CircleAlert class="size-3.5" />
							<span>{{ t("settings.fontFamilyLoadFailed") }}</span>
							<button type="button" @click="loadFonts(true)">
								{{ t("settings.fontFamilyRetry") }}
							</button>
						</div>
						<div
							v-else-if="
								hasLoadedFonts &&
								fontSource === 'unavailable' &&
								!installedFonts.length
							"
							class="nextchat-font-picker__notice"
						>
							<CircleAlert class="size-3.5" />
							<span>{{ t("settings.fontFamilyNoAccess") }}</span>
						</div>

						<div
							v-if="isLoadingFonts && !knownFonts.length"
							class="nextchat-font-picker__state"
						>
							<LoaderCircle class="size-5 is-spinning" />
							<p>{{ t("settings.fontFamilyLoading") }}</p>
						</div>
						<div
							v-else-if="!filteredFontOptions.length"
							class="nextchat-font-picker__state"
						>
							<SearchX class="size-5" />
							<p>
								{{
									searchQuery.trim()
										? t("settings.fontFamilyNoResults")
										: t("settings.fontFamilyNoLocal")
								}}
							</p>
							<span>{{ t("settings.fontFamilyNoResultsHint") }}</span>
						</div>
						<template v-else>
							<div
								v-for="font in filteredFontOptions"
								:key="font"
								class="nextchat-font-picker__option-row"
								:data-font-name="font"
							>
								<button
									type="button"
									class="nextchat-font-picker__option"
									:class="{ 'is-selected': isSelected(font) }"
									:aria-pressed="isSelected(font)"
									@click="toggleFont(font)"
								>
									<span
										class="nextchat-font-picker__option-sample"
										:style="previewStyle(font)"
									>
										Aa
									</span>
									<span
										class="nextchat-font-picker__option-label"
										:style="previewStyle(font)"
									>
										{{ font }}
									</span>
									<Clock3
										v-if="isRemembered(font)"
										class="nextchat-font-picker__memory"
										:title="t('settings.fontFamilyRecent')"
									/>
									<span
										v-if="isSelected(font)"
										class="nextchat-font-picker__position"
									>
										{{ selectedIndex(font) + 1 }}
									</span>
									<span v-else class="nextchat-font-picker__check" />
								</button>
								<button
									v-if="isRemembered(font)"
									type="button"
									class="nextchat-font-picker__forget"
									:title="t('settings.fontFamilyForget')"
									@click="forgetFont(font)"
								>
									<Trash2 class="size-3.5" />
								</button>
							</div>
						</template>
					</div>

					<form
						class="nextchat-font-picker__custom"
						@submit.prevent="addCustomFont"
					>
						<Input
							v-model="customDraft"
							:placeholder="t('settings.fontFamilyCustomPlaceholder')"
							class="h-9 min-w-0 flex-1 text-xs"
						/>
						<Button
							type="submit"
							size="icon"
							class="size-9 shrink-0"
							:disabled="!customDraft.trim()"
							:title="t('settings.fontFamilyAdd')"
						>
							<Plus class="size-4" />
						</Button>
					</form>
				</PopoverContent>
			</PopoverPortal>
		</PopoverRoot>
	</div>
</template>
