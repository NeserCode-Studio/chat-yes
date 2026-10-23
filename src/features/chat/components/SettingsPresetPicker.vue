<script setup lang="ts">
import { nextTick, ref } from "vue"
import { Check, Plus, Trash2, X } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import type {
	AgentSettingsPreset,
	AgentSettingsPresetGroup,
} from "../types"
import { useChatI18n } from "../i18n"

defineProps<{
	group: AgentSettingsPresetGroup
	items: AgentSettingsPreset[]
	modelValue: string
	placeholder: string
}>()

const { t } = useChatI18n()

const emit = defineEmits<{
	"update:modelValue": [value: string]
	save: [name: string]
	delete: [id: string]
}>()

const naming = ref(false)
const draftName = ref("")
const inputRef = ref<HTMLInputElement | null>(null)

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
	<div class="nextchat-preset-picker">
		<template v-if="naming">
			<Input
				ref="inputRef"
				v-model="draftName"
				:placeholder="placeholder"
				class="h-8 min-w-36 text-xs"
				@keydown.enter="confirmSave"
				@keydown.esc="cancelNaming"
			/>
			<Button variant="ghost" size="icon" class="size-8" :title="t('settings.presetSave')" @click="confirmSave">
				<Check class="size-3.5" />
			</Button>
			<Button variant="ghost" size="icon" class="size-8" :title="t('settings.presetCancel')" @click="cancelNaming">
				<X class="size-3.5" />
			</Button>
		</template>

		<template v-else>
			<Select
				:model-value="modelValue"
				@update:model-value="(value: unknown) => emit('update:modelValue', String(value))"
			>
				<SelectTrigger class="nextchat-preset-picker__trigger">
					<SelectValue :placeholder="placeholder" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem
						v-for="item in items"
						:key="item.id"
						:value="item.id"
					>
						{{ item.name }}
					</SelectItem>
				</SelectContent>
			</Select>
			<Button
				variant="ghost"
				size="icon"
				class="size-8"
				:title="t('settings.presetSaveHint')"
				@click="startNaming"
			>
				<Plus class="size-3.5" />
			</Button>
			<Button
				v-if="modelValue"
				variant="ghost"
				size="icon"
				class="size-8 text-muted-foreground hover:text-destructive"
				:title="t('settings.presetDelete')"
				@click="emit('delete', modelValue)"
			>
				<Trash2 class="size-3.5" />
			</Button>
		</template>
	</div>
</template>
