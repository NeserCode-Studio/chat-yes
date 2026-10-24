<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { Trash2, X } from "@lucide/vue"
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
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useChatI18n } from "../i18n"
import type {
	AgentMemoryEntry,
	AgentPermissions,
	AgentPreset,
	AgentSettingsPreset,
	AgentSettingsPresetValues,
	BehaviorPresetValues,
	ConnectionPresetValues,
	GenerationPresetValues,
	LimitsPresetValues,
	MemoryPresetValues,
	PermissionsPresetValues,
} from "../types"

const props = defineProps<{
	open: boolean
	preset: AgentSettingsPreset | null
	apiKey?: string
	fallbackTimeoutMs?: number
}>()

const emit = defineEmits<{
	"update:open": [value: boolean]
	save: [
		payload: {
			name: string
			values: AgentSettingsPresetValues
			apiKey?: string
		},
	]
	delete: [id: string]
}>()

type PermissionKey = keyof AgentPermissions

const { t } = useChatI18n()
const draftName = ref("")
const draftValues = ref<AgentSettingsPresetValues | null>(null)
const draftApiKey = ref("")
const deleteArmed = ref(false)

const presetOptions: Array<{ value: AgentPreset; label: string }> = [
	{ value: "balanced", label: "Balanced" },
	{ value: "concise", label: "Concise" },
	{ value: "analytical", label: "Analytical" },
	{ value: "creative", label: "Creative" },
]

const group = computed(() => props.preset?.group ?? "")
const connection = computed(
	() => draftValues.value as ConnectionPresetValues
)
const behavior = computed(() => draftValues.value as BehaviorPresetValues)
const generation = computed(() => draftValues.value as GenerationPresetValues)
const memories = computed(
	() => (draftValues.value as MemoryPresetValues | null) ?? []
)
const permissions = computed(
	() => draftValues.value as PermissionsPresetValues
)
const limits = computed(() => draftValues.value as LimitsPresetValues)
const permissionItems = computed<
	Array<{ key: PermissionKey; label: string; hint: string }>
>(() => [
	{
		key: "shareConversation",
		label: t.value("permission.share"),
		hint: t.value("permission.shareHint"),
	},
	{
		key: "autoReply",
		label: t.value("permission.auto"),
		hint: t.value("permission.autoHint"),
	},
	{
		key: "readMemory",
		label: t.value("permission.readMemory"),
		hint: t.value("permission.readMemoryHint"),
	},
	{
		key: "writeMemory",
		label: t.value("permission.writeMemory"),
		hint: t.value("permission.writeMemoryHint"),
	},
])
const groupLabel = computed(() => {
	const labels: Record<string, string> = {
		connection: t.value("settings.presetGroupConnection"),
		behavior: t.value("settings.presetGroupBehavior"),
		generation: t.value("settings.presetGroupGeneration"),
		memory: t.value("settings.presetGroupMemory"),
		permissions: t.value("settings.presetGroupPermissions"),
		limits: t.value("settings.presetGroupLimits"),
	}
	return labels[group.value] ?? ""
})

watch(
	() => [props.open, props.preset?.id] as const,
	([open]) => {
		if (!open) return
		draftName.value = props.preset?.name ?? ""
		draftValues.value = props.preset
			? (JSON.parse(JSON.stringify(props.preset.values)) as AgentSettingsPresetValues)
			: null
		if (props.preset?.group === "connection") {
			const connection = draftValues.value as ConnectionPresetValues
			if (
				typeof connection.timeoutMs !== "number" ||
				!Number.isFinite(connection.timeoutMs)
			) {
				connection.timeoutMs =
					typeof props.fallbackTimeoutMs === "number" &&
					Number.isFinite(props.fallbackTimeoutMs)
						? props.fallbackTimeoutMs
						: 90000
			}
		}
		draftApiKey.value = props.apiKey ?? ""
		deleteArmed.value = false
	},
	{ immediate: true }
)

watch(
	() => props.apiKey,
	(value) => {
		if (props.open) draftApiKey.value = value ?? ""
	}
)

function removeMemoryEntry(id: string): void {
	const list = memories.value
	const index = list.findIndex((item: AgentMemoryEntry) => item.id === id)
	if (index >= 0) list.splice(index, 1)
}

function save(): void {
	const name = draftName.value.trim()
	if (!props.preset || !draftValues.value || !name) return
	emit("save", {
		name,
		values: draftValues.value,
		apiKey: group.value === "connection" ? draftApiKey.value : undefined,
	})
}

function requestDelete(): void {
	if (!props.preset) return
	if (!deleteArmed.value) {
		deleteArmed.value = true
		return
	}
	emit("delete", props.preset.id)
}
</script>

<template>
	<Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
		<DialogContent
			:hide-close="true"
			:data-preset-dialog-group="group"
			class="nextchat-preset-dialog max-w-2xl gap-0 p-0"
		>
			<header class="nextchat-preset-dialog__header">
				<div>
					<DialogTitle class="text-base">{{ t("settings.presetEditTitle") }}</DialogTitle>
					<DialogDescription>{{ groupLabel }}</DialogDescription>
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
						<p class="nextchat-preset-dialog__label">{{ t("settings.presetName") }}</p>
					</div>
					<div class="nextchat-preset-dialog__control">
						<Input v-model="draftName" />
					</div>
				</div>

				<template v-if="group === 'connection'">
					<div class="nextchat-preset-dialog__row">
						<div class="nextchat-preset-dialog__copy">
							<p class="nextchat-preset-dialog__label">{{ t("settings.endpoint") }}</p>
							<p class="nextchat-preset-dialog__hint">{{ t("settings.endpointHint") }}</p>
						</div>
						<div class="nextchat-preset-dialog__control">
							<Input v-model="connection.endpoint" />
						</div>
					</div>
					<div class="nextchat-preset-dialog__row">
						<div class="nextchat-preset-dialog__copy">
							<p class="nextchat-preset-dialog__label">{{ t("settings.apiKey") }}</p>
							<p class="nextchat-preset-dialog__hint">{{ t("settings.apiKeyHint") }}</p>
						</div>
						<div class="nextchat-preset-dialog__control">
							<Input v-model="draftApiKey" type="password" autocomplete="off" />
						</div>
					</div>
					<div class="nextchat-preset-dialog__row">
						<div class="nextchat-preset-dialog__copy">
							<p class="nextchat-preset-dialog__label">{{ t("settings.timeout") }}</p>
							<p class="nextchat-preset-dialog__hint">{{ t("settings.timeoutHint") }}</p>
						</div>
						<div class="nextchat-preset-dialog__control">
							<Input
								:model-value="connection.timeoutMs ?? 90000"
								type="number"
								min="1000"
								step="1000"
								@update:model-value="connection.timeoutMs = Number($event)"
							/>
						</div>
					</div>
				</template>

				<template v-else-if="group === 'behavior'">
					<div class="nextchat-preset-dialog__row">
						<div class="nextchat-preset-dialog__copy">
							<p class="nextchat-preset-dialog__label">{{ t("settings.preset") }}</p>
						</div>
						<div class="nextchat-preset-dialog__control">
							<Select v-model="behavior.preset">
								<SelectTrigger class="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem
										v-for="option in presetOptions"
										:key="option.value"
										:value="option.value"
									>
										{{ option.label }}
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
					<div class="nextchat-preset-dialog__row">
						<div class="nextchat-preset-dialog__copy">
							<p class="nextchat-preset-dialog__label">{{ t("settings.temperature") }}</p>
						</div>
						<div class="nextchat-preset-dialog__control">
							<div class="nextchat-preset-dialog__slider">
								<Slider v-model="behavior.temperature" :min="0" :max="2" :step="0.1" />
								<span>{{ behavior.temperature.toFixed(1) }}</span>
							</div>
						</div>
					</div>
					<div class="nextchat-preset-dialog__row">
						<div class="nextchat-preset-dialog__copy">
							<p class="nextchat-preset-dialog__label">{{ t("settings.topP") }}</p>
						</div>
						<div class="nextchat-preset-dialog__control">
							<div class="nextchat-preset-dialog__slider">
								<Slider v-model="behavior.topP" :min="0" :max="1" :step="0.05" />
								<span>{{ behavior.topP.toFixed(2) }}</span>
							</div>
						</div>
					</div>
					<div class="nextchat-preset-dialog__row">
						<div class="nextchat-preset-dialog__copy">
							<p class="nextchat-preset-dialog__label">{{ t("settings.presencePenalty") }}</p>
						</div>
						<div class="nextchat-preset-dialog__control">
							<div class="nextchat-preset-dialog__slider">
								<Slider v-model="behavior.presencePenalty" :min="-2" :max="2" :step="0.1" />
								<span>{{ behavior.presencePenalty.toFixed(1) }}</span>
							</div>
						</div>
					</div>
					<div class="nextchat-preset-dialog__row">
						<div class="nextchat-preset-dialog__copy">
							<p class="nextchat-preset-dialog__label">{{ t("settings.frequencyPenalty") }}</p>
						</div>
						<div class="nextchat-preset-dialog__control">
							<div class="nextchat-preset-dialog__slider">
								<Slider v-model="behavior.frequencyPenalty" :min="-2" :max="2" :step="0.1" />
								<span>{{ behavior.frequencyPenalty.toFixed(1) }}</span>
							</div>
						</div>
					</div>
					<div class="nextchat-preset-dialog__row">
						<div class="nextchat-preset-dialog__copy">
							<p class="nextchat-preset-dialog__label">{{ t("settings.streaming") }}</p>
						</div>
						<div class="nextchat-preset-dialog__control is-inline">
							<Switch v-model="behavior.streaming" />
						</div>
					</div>
				</template>

				<template v-else-if="group === 'generation'">
					<div class="nextchat-preset-dialog__row">
						<div class="nextchat-preset-dialog__copy">
							<p class="nextchat-preset-dialog__label">{{ t("settings.maxTokens") }}</p>
						</div>
						<div class="nextchat-preset-dialog__control">
							<Input
								:model-value="generation.maxTokens"
								type="number"
								min="1"
								step="100"
								@update:model-value="generation.maxTokens = Number($event)"
							/>
						</div>
					</div>
					<div class="nextchat-preset-dialog__row">
						<div class="nextchat-preset-dialog__copy">
							<p class="nextchat-preset-dialog__label">{{ t("settings.contextWindow") }}</p>
						</div>
						<div class="nextchat-preset-dialog__control">
							<Input
								:model-value="generation.contextWindow"
								type="number"
								min="1024"
								step="1024"
								@update:model-value="generation.contextWindow = Number($event)"
							/>
						</div>
					</div>
					<div class="nextchat-preset-dialog__row">
						<div class="nextchat-preset-dialog__copy">
							<p class="nextchat-preset-dialog__label">{{ t("settings.retries") }}</p>
						</div>
						<div class="nextchat-preset-dialog__control">
							<Input
								:model-value="generation.retryCount"
								type="number"
								min="0"
								max="5"
								@update:model-value="generation.retryCount = Number($event)"
							/>
						</div>
					</div>
				</template>

				<template v-else-if="group === 'memory'">
					<div class="nextchat-preset-dialog__memory">
						<div
							v-for="memory in memories"
							:key="memory.id"
							class="nextchat-preset-dialog__memory-item"
						>
							<Textarea v-model="memory.content" rows="2" class="min-h-14 flex-1" />
							<Switch v-model="memory.enabled" />
							<Button
								variant="ghost"
								size="icon"
								class="size-8"
								@click="removeMemoryEntry(memory.id)"
							>
								<Trash2 class="size-3.5" />
							</Button>
						</div>
					</div>
				</template>

				<template v-else-if="group === 'permissions'">
					<div
						v-for="permission in permissionItems"
						:key="permission.key"
						class="nextchat-preset-dialog__row"
					>
						<div class="nextchat-preset-dialog__copy">
							<p class="nextchat-preset-dialog__label">{{ permission.label }}</p>
							<p class="nextchat-preset-dialog__hint">{{ permission.hint }}</p>
						</div>
						<div class="nextchat-preset-dialog__control is-inline">
							<Switch v-model="permissions[permission.key]" />
						</div>
					</div>
				</template>

				<template v-else-if="group === 'limits'">
					<div class="nextchat-preset-dialog__row">
						<div class="nextchat-preset-dialog__copy">
							<p class="nextchat-preset-dialog__label">{{ t("inspector.mode") }}</p>
						</div>
						<div class="nextchat-preset-dialog__control">
							<Select v-model="limits.mode">
								<SelectTrigger class="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="roundtable">{{ t("inspector.modeRoundtable") }}</SelectItem>
									<SelectItem value="relay">{{ t("inspector.modeRelay") }}</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
					<div class="nextchat-preset-dialog__row">
						<div class="nextchat-preset-dialog__copy">
							<p class="nextchat-preset-dialog__label">{{ t("inspector.roundLimit") }}</p>
						</div>
						<div class="nextchat-preset-dialog__control">
							<Input
								:model-value="limits.roundLimit"
								type="number"
								min="1"
								max="10"
								@update:model-value="limits.roundLimit = Number($event)"
							/>
						</div>
					</div>
					<div class="nextchat-preset-dialog__row">
						<div class="nextchat-preset-dialog__copy">
							<p class="nextchat-preset-dialog__label">{{ t("inspector.requestLimit") }}</p>
						</div>
						<div class="nextchat-preset-dialog__control">
							<Input
								:model-value="limits.requestLimit"
								type="number"
								min="1"
								max="50"
								@update:model-value="limits.requestLimit = Number($event)"
							/>
						</div>
					</div>
					<div class="nextchat-preset-dialog__row">
						<div class="nextchat-preset-dialog__copy">
							<p class="nextchat-preset-dialog__label">{{ t("inspector.tokenLimit") }}</p>
						</div>
						<div class="nextchat-preset-dialog__control">
							<Input
								:model-value="limits.tokenBudget"
								type="number"
								min="1000"
								step="1000"
								@update:model-value="limits.tokenBudget = Number($event)"
							/>
						</div>
					</div>
				</template>
			</div>

			<footer class="nextchat-preset-dialog__footer">
				<Button v-if="preset" variant="destructive" @click="requestDelete">
					{{ deleteArmed ? t("settings.presetDeleteConfirm") : t("settings.presetDelete") }}
				</Button>
				<div class="nextchat-preset-dialog__actions">
					<Button variant="outline" @click="emit('update:open', false)">
						{{ t("settings.cancel") }}
					</Button>
					<Button :disabled="!draftName.trim()" @click="save">
						{{ t("settings.presetSave") }}
					</Button>
				</div>
			</footer>
		</DialogContent>
	</Dialog>
</template>
