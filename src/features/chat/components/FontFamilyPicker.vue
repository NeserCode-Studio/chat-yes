<script setup lang="ts">
import { computed, ref } from "vue"
import { useLocalStorage } from "@vueuse/core"
import {
	ChevronDown,
	Clock3,
	Plus,
	RotateCcw,
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
import { useChatI18n } from "../i18n"
import {
	CHAT_FONT_FAMILY_OPTIONS,
	DEFAULT_CHAT_FONT_FAMILY,
	isGenericFontFamily,
	normalizeFontFamilyName,
	parseFontFamilyStack,
	serializeFontFamilyStack,
} from "../font-family"

const props = defineProps<{
	modelValue: string
}>()

const emit = defineEmits<{
	"update:modelValue": [value: string]
}>()

const { t } = useChatI18n()
const rememberedFonts = useLocalStorage<string[]>(
	"chat-yes.font-family-memory.v1",
	[]
)
const open = ref(false)
const customDraft = ref("")

if (!Array.isArray(rememberedFonts.value)) rememberedFonts.value = []

const builtInFontKeys = new Set<string>(
	CHAT_FONT_FAMILY_OPTIONS.map((font) => font.toLowerCase())
)
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
const customFonts = computed(() => {
	const values = [...rememberedFonts.value, ...selectedFonts.value]
	const seen = new Set<string>()
	return values
		.map(normalizeFontFamilyName)
		.filter((font) => {
			const key = font.toLowerCase()
			if (!font || builtInFontKeys.has(key) || seen.has(key)) return false
			seen.add(key)
			return true
		})
})
const fontOptions = computed(() => [
	...CHAT_FONT_FAMILY_OPTIONS,
	...customFonts.value,
])
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

function updateStack(fonts: string[]): void {
	emit(
		"update:modelValue",
		serializeFontFamilyStack(fonts, genericFallback.value)
	)
}

function toggleFont(font: string): void {
	const current = selectedFonts.value
	const selected = isSelected(font)
	updateStack(
		selected
			? current.filter(
					(value) => value.toLowerCase() !== font.toLowerCase()
				)
			: [...current, font]
	)
}

function addCustomFont(): void {
	const font = normalizeFontFamilyName(customDraft.value)
	if (!font) return
	if (isGenericFontFamily(font)) {
		emit("update:modelValue", serializeFontFamilyStack(selectedFonts.value, font))
		customDraft.value = ""
		return
	}
	if (!builtInFontKeys.has(font.toLowerCase()) && !isRemembered(font)) {
		rememberedFonts.value = [font, ...rememberedFonts.value].slice(0, 8)
	}
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
}
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
						<p>{{ t("settings.fontFamilyChoose") }}</p>
						<Button
							variant="ghost"
							size="sm"
							class="h-7 px-2 text-xs"
							@click="resetFonts"
						>
							<RotateCcw class="size-3.5" />
							{{ t("settings.fontFamilyReset") }}
						</Button>
					</header>

					<div class="nextchat-font-picker__list">
						<div
							v-for="font in fontOptions"
							:key="font"
							class="nextchat-font-picker__option-row"
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
