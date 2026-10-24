<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { Plus, X } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useChatI18n } from "../i18n"
import type { AgentSettingsPreset } from "../types"

const NEW_PRESET = "__new_memory_preset__"

const props = defineProps<{
	open: boolean
	presets: AgentSettingsPreset[]
}>()

const emit = defineEmits<{
	"update:open": [value: boolean]
	save: [
		payload: {
			presetId?: string
			presetName: string
			content: string
		},
	]
}>()

const { t } = useChatI18n()
const targetPresetId = ref(NEW_PRESET)
const presetName = ref("")
const content = ref("")

const memoryPresets = computed(() =>
	props.presets.filter((preset) => preset.group === "memory")
)
const creatingPreset = computed(() => targetPresetId.value === NEW_PRESET)
const canSave = computed(
	() =>
		Boolean(content.value.trim()) &&
		(!creatingPreset.value || Boolean(presetName.value.trim()))
)

watch(
	() => props.open,
	(open) => {
		if (!open) return
		targetPresetId.value =
			memoryPresets.value[memoryPresets.value.length - 1]?.id ?? NEW_PRESET
		presetName.value = ""
		content.value = ""
	}
)

function save(): void {
	if (!canSave.value) return
	emit("save", {
		presetId: creatingPreset.value ? undefined : targetPresetId.value,
		presetName: presetName.value.trim(),
		content: content.value.trim(),
	})
}
</script>

<template>
	<Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
		<DialogContent
			hide-close
			data-memory-entry-dialog
			class="nextchat-preset-dialog max-w-xl gap-0 p-0"
		>
			<header class="nextchat-preset-dialog__header">
				<div>
					<DialogTitle class="text-base">
						{{ t("settings.memoryEntryCreate") }}
					</DialogTitle>
					<DialogDescription>
						{{ t("settings.memoryEntryCreateHint") }}
					</DialogDescription>
				</div>
				<Button
					variant="ghost"
					size="icon"
					class="size-8"
					:title="t('settings.cancel')"
					@click="emit('update:open', false)"
				>
					<X class="size-4" />
				</Button>
			</header>

			<div class="nextchat-preset-dialog__body">
				<div class="nextchat-preset-dialog__row">
					<div class="nextchat-preset-dialog__copy">
						<p class="nextchat-preset-dialog__label">
							{{ t("settings.memoryEntryPreset") }}
						</p>
						<p class="nextchat-preset-dialog__hint">
							{{ t("settings.memoryEntryPresetHint") }}
						</p>
					</div>
					<div class="nextchat-preset-dialog__control">
						<Select v-model="targetPresetId">
							<SelectTrigger class="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem
									v-for="preset in memoryPresets"
									:key="preset.id"
									:value="preset.id"
								>
									{{ preset.name }}
								</SelectItem>
								<SelectItem :value="NEW_PRESET">
									{{ t("settings.memoryEntryNewPreset") }}
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>

				<div v-if="creatingPreset" class="nextchat-preset-dialog__row">
					<div class="nextchat-preset-dialog__copy">
						<p class="nextchat-preset-dialog__label">
							{{ t("settings.memoryEntryPresetName") }}
						</p>
					</div>
					<div class="nextchat-preset-dialog__control">
						<Input
							v-model="presetName"
							:placeholder="t('settings.presetNamePlaceholder')"
						/>
					</div>
				</div>

				<div
					class="nextchat-preset-dialog__row nextchat-memory-entry-dialog__content"
				>
					<div class="nextchat-preset-dialog__copy">
						<p class="nextchat-preset-dialog__label">
							{{ t("settings.memoryEntryContent") }}
						</p>
						<p class="nextchat-preset-dialog__hint">
							{{ t("settings.memoryEntryContentHint") }}
						</p>
					</div>
					<div class="nextchat-preset-dialog__control">
						<Textarea
							v-model="content"
							rows="5"
							class="min-h-28 resize-y"
							:placeholder="t('settings.memoryEntryContentPlaceholder')"
						/>
					</div>
				</div>
			</div>

			<footer class="nextchat-preset-dialog__footer">
				<div class="nextchat-preset-dialog__actions">
					<Button variant="outline" @click="emit('update:open', false)">
						{{ t("settings.cancel") }}
					</Button>
					<Button :disabled="!canSave" @click="save">
						<Plus class="size-4" />
						{{ t("settings.memoryEntryCreate") }}
					</Button>
				</div>
			</footer>
		</DialogContent>
	</Dialog>
</template>
