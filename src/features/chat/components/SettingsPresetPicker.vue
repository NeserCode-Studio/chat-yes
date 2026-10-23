<script setup lang="ts">
import { computed, nextTick, ref } from "vue"
import { Check, Layers, Pencil, Plus, Unlink, X } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { useChatI18n } from "../i18n"
import type {
	AgentSettingsPreset,
	AgentSettingsPresetGroup,
} from "../types"

const props = defineProps<{
	group: AgentSettingsPresetGroup
	items: AgentSettingsPreset[]
	modelValue?: string
	placeholder: string
}>()

const emit = defineEmits<{
	"update:modelValue": [value: string]
	save: [name: string]
	unbind: []
	edit: [id: string]
}>()

const { t } = useChatI18n()
const naming = ref(false)
const draftName = ref("")
const inputRef = ref<HTMLInputElement | null>(null)
const bound = computed(() => Boolean(props.modelValue))

function startNaming(): void {
	naming.value = true
	draftName.value = ""
	nextTick(() => inputRef.value?.focus())
}

function cancelNaming(): void {
	naming.value = false
	draftName.value = ""
}

function confirmSave(): void {
	const name = draftName.value.trim()
	if (!name) return
	emit("save", name)
	cancelNaming()
}
</script>

<template>
	<div class="nextchat-preset-picker" :data-preset-group="group">
		<Select
			:model-value="modelValue"
			@update:model-value="(value: unknown) => emit('update:modelValue', String(value))"
		>
			<SelectTrigger class="nextchat-preset-picker__trigger">
				<SelectValue :placeholder="placeholder" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem
					v-if="!items.length"
					value="__empty-preset__"
					disabled
					class="nextchat-preset-picker__empty-option"
				>
					<div class="nextchat-preset-picker__empty">
						<span class="nextchat-preset-picker__empty-icon">
							<Layers class="size-4" />
						</span>
						<span class="nextchat-preset-picker__empty-copy">
							<strong>{{ t("settings.presetEmpty") }}</strong>
							<small>{{ t("settings.presetEmptyHint") }}</small>
						</span>
					</div>
				</SelectItem>
				<SelectItem
					v-for="item in items"
					:key="item.id"
					:value="item.id"
				>
					{{ item.name }}
				</SelectItem>
			</SelectContent>
		</Select>

		<template v-if="bound">
			<Button
				variant="ghost"
				size="icon"
				class="size-8"
				data-preset-action="edit"
				:title="t('settings.presetEdit')"
				@click="emit('edit', modelValue ?? '')"
			>
				<Pencil class="size-3.5" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="size-8 text-muted-foreground"
				data-preset-action="unbind"
				:title="t('settings.presetUnbind')"
				@click="emit('unbind')"
			>
				<Unlink class="size-3.5" />
			</Button>
		</template>

		<template v-else-if="naming">
			<Input
				ref="inputRef"
				v-model="draftName"
				:placeholder="t('settings.presetNamePlaceholder')"
				class="h-8 min-w-36 text-xs"
				@keydown.enter="confirmSave"
				@keydown.esc="cancelNaming"
			/>
			<Button
				variant="ghost"
				size="icon"
				class="size-8"
				:title="t('settings.presetSave')"
				@click="confirmSave"
			>
				<Check class="size-3.5" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="size-8"
				:title="t('settings.presetCancel')"
				@click="cancelNaming"
			>
				<X class="size-3.5" />
			</Button>
		</template>

		<Button
			v-else
			variant="ghost"
			size="icon"
			class="size-8"
			data-preset-action="create"
			:title="t('settings.presetSaveHint')"
			@click="startNaming"
		>
			<Plus class="size-3.5" />
		</Button>
	</div>
</template>
