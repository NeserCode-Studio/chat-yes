<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { useLocalStorage } from "@vueuse/core"
import {
	CircleAlert,
	Clock3,
	List,
	LoaderCircle,
	Plus,
	RefreshCw,
	RotateCcw,
	Search,
	SearchX,
	Trash2,
	Type,
	X,
} from "@lucide/vue"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea, ScrollAreaInner } from "@/components/ui/scroll-area"
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

watch(open, (value) => {
	if (value) searchQuery.value = ""
})
</script>

<template>
	<div class="nextchat-font-picker">
		<Dialog v-model:open="open">
			<DialogTrigger as-child>
				<button
					type="button"
					class="nextchat-font-picker__trigger"
					:class="{ 'is-open': open }"
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
					<List class="nextchat-font-picker__trigger-icon" />
				</button>
			</DialogTrigger>

			<DialogContent
				:hide-close="true"
				class="nextchat-font-dialog"
			>
				<header class="nextchat-font-dialog__header">
					<div class="nextchat-font-dialog__title">
						<DialogTitle>{{ t("settings.fontFamilyDialogTitle") }}</DialogTitle>
						<DialogDescription>
							{{ t("settings.fontFamilyHint") }}
						</DialogDescription>
					</div>
					<div class="nextchat-font-dialog__actions">
						<Button
							variant="ghost"
							size="icon"
							:title="t('settings.fontFamilyRefresh')"
							:disabled="isLoadingFonts"
							@click="loadFonts(true)"
						>
							<RefreshCw
								class="size-4"
								:class="{ 'is-spinning': isLoadingFonts }"
							/>
						</Button>
						<Button
							variant="ghost"
							size="sm"
							class="px-2.5 text-xs"
							@click="resetFonts"
						>
							<RotateCcw class="size-3.5" />
							{{ t("settings.fontFamilyReset") }}
						</Button>
						<Button
							variant="ghost"
							size="icon"
							:title="t('settings.cancel')"
							@click="open = false"
						>
							<X class="size-4" />
						</Button>
					</div>
				</header>

				<div class="nextchat-font-dialog__toolbar">
					<label class="nextchat-font-dialog__search">
						<Search class="size-4" />
						<Input
							v-model="searchQuery"
							:aria-label="t('settings.fontFamilySearch')"
							:placeholder="t('settings.fontFamilySearch')"
							class="h-9 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
						/>
					</label>
					<span class="nextchat-font-dialog__result-count">
						{{
							isLoadingFonts
								? t("settings.fontFamilyLoading")
								: t("settings.fontFamilyCount", {
										count: installedFonts.length,
									})
						}}
					</span>
				</div>

				<div class="nextchat-font-dialog__body">
					<aside class="nextchat-font-dialog__selected">
						<header class="nextchat-font-dialog__section-header">
							<p>{{ t("settings.fontFamilySelected") }}</p>
							<span>{{ selectedFonts.length }}</span>
						</header>
						<ScrollArea class="nextchat-font-dialog__selected-scroll">
							<ScrollAreaInner>
								<div
									v-if="selectedFonts.length"
									class="nextchat-font-dialog__selected-list"
								>
									<div
										v-for="font in selectedFonts"
										:key="font"
										class="nextchat-font-dialog__selected-item"
									>
										<span class="nextchat-font-picker__position">
											{{ selectedIndex(font) + 1 }}
										</span>
										<span
											class="nextchat-font-dialog__selected-name"
											:style="previewStyle(font)"
										>
											{{ font }}
										</span>
										<button
											type="button"
											class="nextchat-font-dialog__selected-remove"
											:title="t('settings.fontFamilyRemove')"
											@click="toggleFont(font)"
										>
											<X class="size-3.5" />
										</button>
									</div>
								</div>
								<div
									v-else
									class="nextchat-font-dialog__selected-empty"
								>
									<Type class="size-5" />
									<p>{{ t("settings.fontFamilySelectedEmpty") }}</p>
								</div>
							</ScrollAreaInner>
						</ScrollArea>
					</aside>

					<section class="nextchat-font-dialog__available">
						<header class="nextchat-font-dialog__section-header">
							<p>{{ t("settings.fontFamilyAvailable") }}</p>
							<span>{{ filteredFontOptions.length }}</span>
						</header>
						<ScrollArea class="nextchat-font-dialog__available-scroll">
							<ScrollAreaInner>
								<div class="nextchat-font-dialog__available-content">
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
									<div v-else class="nextchat-font-dialog__grid">
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
									</div>
								</div>
							</ScrollAreaInner>
						</ScrollArea>
					</section>
				</div>

				<form
					class="nextchat-font-dialog__custom"
					@submit.prevent="addCustomFont"
				>
					<Input
						v-model="customDraft"
						:placeholder="t('settings.fontFamilyCustomPlaceholder')"
						class="h-9 min-w-0 flex-1 text-xs"
					/>
					<Button
						type="submit"
						class="h-9 shrink-0"
						:disabled="!customDraft.trim()"
					>
						<Plus class="size-4" />
						{{ t("settings.fontFamilyAdd") }}
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	</div>
</template>
