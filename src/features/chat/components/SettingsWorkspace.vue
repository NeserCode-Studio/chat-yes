<script setup lang="ts">
import { computed, ref, watch } from "vue"
import {
	Activity,
	BadgeCheck,
	Bot,
	Brain,
	CheckCircle2,
	Gauge,
	Keyboard,
	KeyRound,
	Moon,
	Palette,
	Plus,
	Server,
	Settings2,
	ShieldCheck,
	SlidersHorizontal,
	Sun,
	Trash2,
	Type,
	UserRound,
	X,
} from "@lucide/vue"
import { Button } from "@/components/ui/button"
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
import {
	useDialogStore,
	useI18nStore,
	useThemeStore,
	useTitleStore,
} from "@/store"
import { useAppearanceStore } from "@/store/appearance"
import {
	aggregateMessageUsage,
	applyAgentPreset,
	createMemoryEntry,
} from "../domain"
import { useChatI18n } from "../i18n"
import { useChatStore } from "../store"
import { AGENT_ACCENTS } from "../types"
import type {
	AgentPermissions,
	AgentPreset,
	AgentProfile,
	AgentRole,
} from "../types"
import { validateAgent } from "../validation"
import ConfirmDialog from "./ConfirmDialog.vue"

type SettingsTab = "agents" | "general" | "usage"
type PermissionKey = keyof AgentPermissions

const store = useChatStore()
const i18n = useI18nStore()
const theme = useThemeStore()
const titleStore = useTitleStore()
const appearance = useAppearanceStore()
const dialogs = useDialogStore()
const { t } = useChatI18n()
const activeTab = ref<SettingsTab>("agents")
const memoryDraft = ref("")
const apiKeyDraft = ref("")
const agentDraft = ref<AgentProfile | null>(null)
const confirmOpen = ref(false)
const confirmAction = ref<(() => void) | null>(null)
const confirmTitle = ref("")
const confirmDescription = ref("")
const confirmLabel = ref("")
const confirmDestructive = ref(false)

const selectedAgent = computed(() => store.selectedAgent)
const savedSecret = computed(() => {
	if (!selectedAgent.value) return ""
	return store.getAgentSecret(selectedAgent.value.id)
})
const hasDraftChanges = computed(() => {
	if (!agentDraft.value || !selectedAgent.value) return false
	if (apiKeyDraft.value !== savedSecret.value) return true
	return (
		JSON.stringify(agentDraft.value) !== JSON.stringify(selectedAgent.value)
	)
})
const validation = computed(() =>
	agentDraft.value ? validateAgent(agentDraft.value) : null
)
const selectedAgentUsage = computed(() => {
	if (!selectedAgent.value) return aggregateMessageUsage([])
	const messages = store.conversations.flatMap((conversation) =>
		(store.messagesByConversation[conversation.id] ?? [])
	)
	return aggregateMessageUsage(
		messages.filter((message) => message.agentId === selectedAgent.value?.id)
	)
})
const averageLatency = computed(() => {
	const requests = store.totalUsage.requestCount
	return requests ? Math.round(store.totalUsage.latencyMs / requests) : 0
})

const roles: Array<{ value: AgentRole; label: string }> = [
	{ value: "moderator", label: "Moderator" },
	{ value: "analyst", label: "Analyst" },
	{ value: "builder", label: "Builder" },
	{ value: "reviewer", label: "Reviewer" },
	{ value: "researcher", label: "Researcher" },
	{ value: "custom", label: "Custom" },
]
const presets: Array<{ value: AgentPreset; label: string }> = [
	{ value: "balanced", label: "Balanced" },
	{ value: "concise", label: "Concise" },
	{ value: "analytical", label: "Analytical" },
	{ value: "creative", label: "Creative" },
]
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

function cloneAgentProfile(agent: AgentProfile): AgentProfile {
	return JSON.parse(JSON.stringify(agent)) as AgentProfile
}

watch(
	() => [selectedAgent.value?.id, store.secretVersion],
	() => {
		agentDraft.value = selectedAgent.value
			? cloneAgentProfile(selectedAgent.value)
			: null
		apiKeyDraft.value = selectedAgent.value
			? store.getAgentSecret(selectedAgent.value.id)
			: ""
	},
	{ immediate: true }
)

function requestConfirmation(options: {
	title: string
	description: string
	confirmLabel: string
	destructive?: boolean
	action: () => void
}): void {
	confirmTitle.value = options.title
	confirmDescription.value = options.description
	confirmLabel.value = options.confirmLabel
	confirmDestructive.value = Boolean(options.destructive)
	confirmAction.value = options.action
	confirmOpen.value = true
}

function discardChangesAnd(action: () => void): void {
	requestConfirmation({
		title: t.value("settings.unsavedTitle"),
		description: t.value("settings.unsavedDescription"),
		confirmLabel: t.value("settings.discard"),
		destructive: true,
		action,
	})
}

function addAgent(): void {
	const action = () => {
		store.addAgent()
		activeTab.value = "agents"
	}
	if (hasDraftChanges.value) discardChangesAnd(action)
	else action()
}

function deleteAgent(): void {
	const agent = selectedAgent.value
	if (!agent) return
	requestConfirmation({
		title: t.value("settings.deleteAgent"),
		description: t.value("settings.deleteConfirm"),
		confirmLabel: t.value("settings.deleteAgent"),
		destructive: true,
		action: async () => {
			await store.removeAgent(agent.id)
			agentDraft.value = store.selectedAgent
				? cloneAgentProfile(store.selectedAgent)
				: null
		},
	})
}

function selectAgent(agentId: string): void {
	if (selectedAgent.value?.id === agentId) {
		activeTab.value = "agents"
		return
	}
	if (hasDraftChanges.value) {
		discardChangesAnd(() => {
			store.selectedAgentId = agentId
			activeTab.value = "agents"
		})
		return
	}
	store.selectedAgentId = agentId
	activeTab.value = "agents"
}

function setTopTab(tab: SettingsTab): void {
	if (tab === activeTab.value) return
	if (activeTab.value === "agents" && hasDraftChanges.value) {
		discardChangesAnd(() => {
			activeTab.value = tab
		})
		return
	}
	activeTab.value = tab
}

async function saveAgentDraft(): Promise<void> {
	const agent = selectedAgent.value
	const draft = agentDraft.value
	if (!agent || !draft) return
	Object.assign(agent, draft)
	agent.updatedAt = Date.now()
	await store.setAgentSecret(agent.id, apiKeyDraft.value)
	agentDraft.value = cloneAgentProfile(agent)
	apiKeyDraft.value = store.getAgentSecret(agent.id)
}

function resetAgentDraft(): void {
	agentDraft.value = selectedAgent.value
		? cloneAgentProfile(selectedAgent.value)
		: null
	apiKeyDraft.value = selectedAgent.value
		? store.getAgentSecret(selectedAgent.value.id)
		: ""
}

function closeSettings(): void {
	if (activeTab.value === "agents" && hasDraftChanges.value) {
		discardChangesAnd(() => {
			dialogs.closeSettings()
		})
		return
	}
	dialogs.closeSettings()
}

function updatePreset(value: string): void {
	if (!agentDraft.value) return
	agentDraft.value.preset = value as AgentPreset
	applyAgentPreset(agentDraft.value)
}

function setPermission(key: PermissionKey, value: boolean): void {
	if (!agentDraft.value) return
	agentDraft.value.permissions[key] = value
	agentDraft.value.updatedAt = Date.now()
}

function addMemory(): void {
	if (!agentDraft.value || !memoryDraft.value.trim()) return
	agentDraft.value.memories.unshift(createMemoryEntry(memoryDraft.value))
	agentDraft.value.updatedAt = Date.now()
	memoryDraft.value = ""
}

function removeMemory(memoryId: string): void {
	if (!agentDraft.value) return
	agentDraft.value.memories = agentDraft.value.memories.filter(
		(item) => item.id !== memoryId
	)
	agentDraft.value.updatedAt = Date.now()
}

function setTheme(value: string): void {
	theme.setThemeMode(value === "dark" ? "dark" : "light")
}

function formatNumber(value: number): string {
	return new Intl.NumberFormat(undefined, {
		notation: value > 9999 ? "compact" : "standard",
		maximumFractionDigits: 1,
	}).format(value)
}

function formatDuration(value: number): string {
	return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`
}
</script>

<template>
	<div class="nextchat-settings">
		<header class="nextchat-settings__header">
			<div class="nextchat-settings__title">
				<h2>{{ t("settings.title") }}</h2>
				<p>{{ t("settings.description") }}</p>
			</div>
			<Button variant="outline" size="sm" class="rounded-[10px]" @click="closeSettings">
				<CheckCircle2 class="size-3.5" />
				{{ t("settings.done") }}
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="size-9 rounded-[10px]"
				:title="t('settings.cancel')"
				@click="closeSettings"
			>
				<X class="size-4" />
			</Button>
		</header>

		<div class="nextchat-settings__body">
			<nav class="nextchat-settings__nav" aria-label="Settings sections">
				<div class="nextchat-settings__nav-group">
					<p class="nextchat-settings__nav-label">{{ t("settings.application") }}</p>
					<button
						type="button"
						class="nextchat-settings__nav-item"
						:class="{ 'is-active': activeTab === 'general' }"
						@click="setTopTab('general')"
					>
						<SlidersHorizontal class="size-4" />
						{{ t("settings.general") }}
					</button>
					<button
						type="button"
						class="nextchat-settings__nav-item"
						:class="{ 'is-active': activeTab === 'usage' }"
						@click="setTopTab('usage')"
					>
						<Gauge class="size-4" />
						{{ t("settings.usage") }}
					</button>
				</div>

				<div class="nextchat-settings__nav-group">
					<p class="nextchat-settings__nav-label">
						<span>{{ t("settings.agents") }}</span>
						<button
							type="button"
							class="inline-flex size-6 items-center justify-center rounded-md hover:bg-card"
							:title="t('settings.addAgent')"
							@click="addAgent"
						>
							<Plus class="size-3.5" />
						</button>
					</p>

					<button
						v-for="agent in store.agents"
						:key="agent.id"
						type="button"
						class="nextchat-settings__agent"
						:class="{ 'is-active': activeTab === 'agents' && selectedAgent?.id === agent.id }"
						@click="selectAgent(agent.id)"
					>
						<span
							class="flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white"
							:style="{ backgroundColor: agent.accent }"
						>
							{{ agent.name.slice(0, 2) }}
						</span>
						<span class="nextchat-settings__agent-copy">
							<strong>{{ agent.name }}</strong>
							<span>{{ agent.model || t("settings.connectionIncomplete") }}</span>
						</span>
						<CheckCircle2
							v-if="validateAgent(agent).valid"
							class="size-3.5 shrink-0 text-emerald-600"
						/>
					</button>

					<button
						v-if="!store.agents.length"
						type="button"
						class="nextchat-settings__nav-item"
						@click="addAgent"
					>
						<Plus class="size-4" />
						{{ t("settings.addAgent") }}
					</button>
				</div>
			</nav>

			<main class="nextchat-settings__content">
				<div class="nextchat-settings__content-inner">
					<template v-if="activeTab === 'agents'">
						<template v-if="selectedAgent && agentDraft">
							<section class="nextchat-settings-list">
								<header class="nextchat-settings-list__header">
									<UserRound class="size-4" />
									<div>
										<p class="nextchat-settings-list__title">{{ t("settings.agentProfile") }}</p>
										<p class="nextchat-settings-list__copy">{{ t("settings.agentProfileHint") }}</p>
									</div>
								</header>

								<div class="nextchat-settings-row">
									<div class="nextchat-settings__agent-summary">
										<div class="nextchat-settings__agent-summary-main">
											<span
												class="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white"
												:style="{ backgroundColor: agentDraft.accent }"
											>
												{{ agentDraft.name.slice(0, 2) }}
											</span>
											<div class="min-w-0">
												<p class="nextchat-settings-row__title">{{ agentDraft.name }}</p>
												<p class="nextchat-settings-row__subtitle">
													{{ validation?.valid ? t("settings.connectionReady") : t("settings.connectionIncomplete") }}
												</p>
											</div>
										</div>
										<div class="nextchat-settings__agent-summary-actions">
											<div class="text-right">
												<p class="nextchat-settings-row__title">
													{{ agentDraft.enabled ? t("settings.enabled") : t("settings.disabled") }}
												</p>
												<p class="nextchat-settings-row__subtitle">{{ t("settings.agentSwitchHint") }}</p>
											</div>
											<Switch v-model="agentDraft.enabled" />
											<Button
												variant="ghost"
												size="icon"
												class="size-8 text-muted-foreground hover:text-destructive"
												:title="t('settings.deleteAgent')"
												@click="deleteAgent"
											>
												<Trash2 class="size-4" />
											</Button>
										</div>
									</div>
								</div>

								<div class="nextchat-settings-row">
									<div class="nextchat-settings-row__copy">
										<p class="nextchat-settings-row__title">{{ t("settings.name") }}</p>
										<p class="nextchat-settings-row__subtitle">{{ t("settings.nameHint") }}</p>
									</div>
									<div class="nextchat-settings-row__control">
										<Input v-model="agentDraft.name" />
									</div>
								</div>

								<div class="nextchat-settings-row">
									<div class="nextchat-settings-row__copy">
										<p class="nextchat-settings-row__title">{{ t("settings.role") }}</p>
										<p class="nextchat-settings-row__subtitle">{{ t("settings.roleHint") }}</p>
									</div>
									<div class="nextchat-settings-row__control">
										<Select v-model="agentDraft.role">
											<SelectTrigger class="w-full">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem v-for="role in roles" :key="role.value" :value="role.value">
													{{ role.label }}
												</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</div>
							</section>

							<section class="nextchat-settings-list">
								<header class="nextchat-settings-list__header">
									<Server class="size-4" />
									<div>
										<p class="nextchat-settings-list__title">{{ t("settings.connection") }}</p>
										<p class="nextchat-settings-list__copy">{{ t("settings.endpointHint") }}</p>
									</div>
								</header>

								<div class="nextchat-settings-row is-stack">
									<div class="nextchat-settings-row__copy">
										<p class="nextchat-settings-row__title">{{ t("settings.endpoint") }}</p>
										<p class="nextchat-settings-row__subtitle">{{ t("settings.endpointHint") }}</p>
									</div>
									<div class="nextchat-settings-row__control is-wide">
										<Input v-model="agentDraft.endpoint" placeholder="http://localhost:1234/v1" />
									</div>
								</div>

								<div class="nextchat-settings-row">
									<div class="nextchat-settings-row__copy">
										<p class="nextchat-settings-row__title">{{ t("settings.modelId") }}</p>
										<p class="nextchat-settings-row__subtitle">{{ t("settings.modelIdHint") }}</p>
									</div>
									<div class="nextchat-settings-row__control">
										<Input v-model="agentDraft.model" placeholder="gpt-4.1-mini" />
									</div>
								</div>

								<div class="nextchat-settings-row">
									<div class="nextchat-settings-row__copy">
										<p class="nextchat-settings-row__title">{{ t("settings.apiKey") }}</p>
										<p class="nextchat-settings-row__subtitle">{{ t("settings.apiKeyHint") }}</p>
									</div>
									<div class="nextchat-settings-row__control">
										<Input
											v-model="apiKeyDraft"
											type="password"
											placeholder="sk-..."
											autocomplete="off"
										/>
										<p class="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
											<KeyRound class="size-3" />
											{{ savedSecret ? t("settings.secretSaved") : t("settings.secretMissing") }}
										</p>
									</div>
								</div>

								<div class="nextchat-settings-row">
									<div class="nextchat-settings-row__copy">
										<p class="nextchat-settings-row__title">{{ t("settings.timeout") }}</p>
										<p class="nextchat-settings-row__subtitle">{{ t("settings.timeoutHint") }}</p>
									</div>
									<div class="nextchat-settings-row__control">
										<Input
											:model-value="agentDraft.timeoutMs"
											type="number"
											min="1000"
											step="1000"
											@update:model-value="agentDraft.timeoutMs = Number($event)"
										/>
									</div>
								</div>

								<div class="nextchat-settings-row is-stack">
									<div class="nextchat-settings-row__copy">
										<p class="nextchat-settings-row__title">{{ t("settings.accent") }}</p>
										<p class="nextchat-settings-row__subtitle">{{ t("settings.accentHint") }}</p>
									</div>
									<div class="nextchat-settings-row__control is-wide">
										<div class="flex flex-wrap items-center gap-2">
											<button
												v-for="accent in AGENT_ACCENTS"
												:key="accent"
												type="button"
												class="size-8 rounded-full border-2"
												:class="agentDraft.accent === accent ? 'border-foreground' : 'border-transparent'"
												:title="accent"
												@click="agentDraft.accent = accent"
											>
												<span class="block size-full rounded-full" :style="{ backgroundColor: accent }"></span>
											</button>
											<Input v-model="agentDraft.accent" class="max-w-36 font-mono text-xs" />
										</div>
									</div>
								</div>

								<div v-if="validation && !validation.valid" class="nextchat-settings-row">
									<div class="nextchat-settings__notice w-full">
										<p v-for="reason in validation.reasons" :key="reason">{{ reason }}</p>
									</div>
								</div>
							</section>

							<section class="nextchat-settings-list">
								<header class="nextchat-settings-list__header">
									<SlidersHorizontal class="size-4" />
									<div>
										<p class="nextchat-settings-list__title">{{ t("settings.model") }}</p>
										<p class="nextchat-settings-list__copy">{{ t("settings.modelHint") }}</p>
									</div>
								</header>

								<div class="nextchat-settings-row">
									<div class="nextchat-settings-row__copy">
										<p class="nextchat-settings-row__title">{{ t("settings.preset") }}</p>
										<p class="nextchat-settings-row__subtitle">{{ t("settings.presetHint") }}</p>
									</div>
									<div class="nextchat-settings-row__control">
										<Select
											:model-value="agentDraft.preset"
											@update:model-value="updatePreset(String($event))"
										>
											<SelectTrigger class="w-full">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem v-for="preset in presets" :key="preset.value" :value="preset.value">
													{{ preset.label }}
												</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</div>

								<div class="nextchat-settings-row">
									<div class="nextchat-settings-row__copy">
										<p class="nextchat-settings-row__title">{{ t("settings.temperature") }}</p>
										<p class="nextchat-settings-row__subtitle">{{ t("settings.temperatureHint") }}</p>
									</div>
									<div class="nextchat-settings-row__control">
										<div class="flex items-center gap-3">
											<Slider
												v-model="agentDraft.temperature"
												:min="0"
												:max="2"
												:step="0.1"
												class="flex-1"
											/>
											<span class="w-10 text-right text-xs font-semibold tabular-nums">
												{{ agentDraft.temperature.toFixed(1) }}
											</span>
										</div>
									</div>
								</div>

								<div class="nextchat-settings-row is-vertical">
									<div class="nextchat-settings-row__copy">
										<p class="nextchat-settings-row__title">{{ t("settings.systemPrompt") }}</p>
										<p class="nextchat-settings-row__subtitle">{{ t("settings.systemPromptHint") }}</p>
									</div>
									<div class="nextchat-settings-row__control">
										<Textarea v-model="agentDraft.systemPrompt" rows="5" class="min-h-32" />
									</div>
								</div>

								<div class="nextchat-settings-row">
									<div class="nextchat-settings-row__copy">
										<p class="nextchat-settings-row__title">{{ t("settings.maxTokens") }}</p>
										<p class="nextchat-settings-row__subtitle">{{ t("settings.maxTokensHint") }}</p>
									</div>
									<div class="nextchat-settings-row__control">
										<Input
											:model-value="agentDraft.maxTokens"
											type="number"
											min="1"
											step="100"
											@update:model-value="agentDraft.maxTokens = Number($event)"
										/>
									</div>
								</div>

								<div class="nextchat-settings-row">
									<div class="nextchat-settings-row__copy">
										<p class="nextchat-settings-row__title">{{ t("settings.contextWindow") }}</p>
										<p class="nextchat-settings-row__subtitle">{{ t("settings.contextWindowHint") }}</p>
									</div>
									<div class="nextchat-settings-row__control">
										<Input
											:model-value="agentDraft.contextWindow"
											type="number"
											min="1024"
											step="1024"
											@update:model-value="agentDraft.contextWindow = Number($event)"
										/>
									</div>
								</div>

								<div class="nextchat-settings-row">
									<div class="nextchat-settings-row__copy">
										<p class="nextchat-settings-row__title">{{ t("settings.retries") }}</p>
										<p class="nextchat-settings-row__subtitle">{{ t("settings.retriesHint") }}</p>
									</div>
									<div class="nextchat-settings-row__control">
										<Input
											:model-value="agentDraft.retryCount"
											type="number"
											min="0"
											max="5"
											@update:model-value="agentDraft.retryCount = Number($event)"
										/>
									</div>
								</div>

								<div class="nextchat-settings-row">
									<div class="nextchat-settings-row__copy">
										<p class="nextchat-settings-row__title">{{ t("settings.streaming") }}</p>
										<p class="nextchat-settings-row__subtitle">{{ t("settings.streamingHint") }}</p>
									</div>
									<div class="nextchat-settings-row__control">
										<div class="nextchat-settings-row__inline">
											<Switch v-model="agentDraft.streaming" />
										</div>
									</div>
								</div>
							</section>

							<section class="nextchat-settings-list">
								<header class="nextchat-settings-list__header">
									<Brain class="size-4" />
									<div>
										<p class="nextchat-settings-list__title">{{ t("settings.memory") }}</p>
										<p class="nextchat-settings-list__copy">{{ t("settings.memoryHint") }}</p>
									</div>
								</header>

								<div class="nextchat-settings-row is-vertical">
									<div class="flex gap-2">
										<Input
											v-model="memoryDraft"
											:placeholder="t('inspector.addMemory')"
											@keydown.enter="addMemory"
										/>
										<Button :disabled="!memoryDraft.trim()" @click="addMemory">
											<Plus class="size-4" />
											{{ t("inspector.add") }}
										</Button>
									</div>

									<div v-if="agentDraft.memories.length" class="nextchat-settings__memory-list">
										<div
											v-for="memory in agentDraft.memories"
											:key="memory.id"
											class="nextchat-settings__memory-item"
										>
											<Brain class="mt-1 size-3.5 shrink-0 text-muted-foreground" />
											<Textarea
												v-model="memory.content"
												rows="2"
												class="min-h-12 flex-1 resize-y border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
											/>
											<Switch v-model="memory.enabled" />
											<Button
												variant="ghost"
												size="icon"
												class="size-7"
												@click="removeMemory(memory.id)"
											>
												<Trash2 class="size-3.5" />
											</Button>
										</div>
									</div>
									<p
										v-else
										class="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground"
									>
										{{ t("settings.memoryEmpty") }}
									</p>
								</div>
							</section>

							<section class="nextchat-settings-list">
								<header class="nextchat-settings-list__header">
									<ShieldCheck class="size-4" />
									<div>
										<p class="nextchat-settings-list__title">{{ t("settings.permissions") }}</p>
										<p class="nextchat-settings-list__copy">{{ t("settings.permissionBoundary") }}</p>
									</div>
								</header>

								<div
									v-for="permission in permissionItems"
									:key="permission.key"
									class="nextchat-settings-row"
								>
									<div class="nextchat-settings-row__copy">
										<p class="nextchat-settings-row__title">{{ permission.label }}</p>
										<p class="nextchat-settings-row__subtitle">{{ permission.hint }}</p>
									</div>
									<div class="nextchat-settings-row__control">
										<div class="nextchat-settings-row__inline">
											<Switch
												:model-value="agentDraft.permissions[permission.key]"
												@update:model-value="(value: boolean) => setPermission(permission.key, value)"
											/>
										</div>
									</div>
								</div>
							</section>

							<div class="nextchat-settings__savebar">
								<div class="min-w-0">
									<p class="nextchat-settings-row__title">
										{{ hasDraftChanges ? t("settings.unsavedTitle") : t("settings.saved") }}
									</p>
									<p class="nextchat-settings-row__subtitle">{{ t("settings.saveHint") }}</p>
								</div>
								<div class="flex shrink-0 gap-2">
									<Button
										variant="outline"
										size="sm"
										:disabled="!hasDraftChanges"
										@click="resetAgentDraft"
									>
										{{ t("settings.discard") }}
									</Button>
									<Button size="sm" :disabled="!hasDraftChanges" @click="saveAgentDraft">
										<BadgeCheck class="size-3.5" />
										{{ t("settings.save") }}
									</Button>
								</div>
							</div>
						</template>

						<section v-else class="nextchat-settings-list">
							<div class="nextchat-settings-row is-vertical">
								<div class="flex flex-col items-center gap-3 py-8 text-center">
									<UserRound class="size-6 text-muted-foreground" />
									<p class="nextchat-settings-row__title">{{ t("settings.noAgent") }}</p>
									<Button @click="addAgent">
										<Plus class="size-4" />
										{{ t("settings.addAgent") }}
									</Button>
								</div>
							</div>
						</section>
					</template>

					<template v-else-if="activeTab === 'general'">
						<section class="nextchat-settings-list">
							<header class="nextchat-settings-list__header">
								<Palette class="size-4" />
								<div>
									<p class="nextchat-settings-list__title">{{ t("settings.appearance") }}</p>
									<p class="nextchat-settings-list__copy">{{ t("settings.appearanceHint") }}</p>
								</div>
							</header>

							<div class="nextchat-settings-row">
								<div class="nextchat-settings-row__copy">
									<p class="nextchat-settings-row__title">{{ t("settings.theme") }}</p>
									<p class="nextchat-settings-row__subtitle">{{ t("settings.themeHint") }}</p>
								</div>
								<div class="nextchat-settings-row__control">
									<Select :model-value="theme.theme" @update:model-value="setTheme(String($event))">
										<SelectTrigger class="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="light">
												<span class="inline-flex items-center gap-2">
													<Sun class="size-3.5" />
													{{ t("settings.themeLight") }}
												</span>
											</SelectItem>
											<SelectItem value="dark">
												<span class="inline-flex items-center gap-2">
													<Moon class="size-3.5" />
													{{ t("settings.themeDark") }}
												</span>
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>

							<div class="nextchat-settings-row">
								<div class="nextchat-settings-row__copy">
									<p class="nextchat-settings-row__title">{{ t("settings.language") }}</p>
									<p class="nextchat-settings-row__subtitle">{{ t("settings.languageHint") }}</p>
								</div>
								<div class="nextchat-settings-row__control">
									<Select
										:model-value="i18n.lang"
										@update:model-value="i18n.setLanguage(String($event) as never)"
									>
										<SelectTrigger class="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="zh-CN">简体中文</SelectItem>
											<SelectItem value="en-US">English (US)</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>

							<div class="nextchat-settings-row">
								<div class="nextchat-settings-row__copy">
									<p class="nextchat-settings-row__title">{{ t("settings.fontSize") }}</p>
									<p class="nextchat-settings-row__subtitle">{{ t("settings.fontSizeHint") }}</p>
								</div>
								<div class="nextchat-settings-row__control">
									<div class="flex items-center gap-3">
										<Type class="size-4 text-muted-foreground" />
										<Slider
											:model-value="appearance.fontSize"
											:min="12"
											:max="24"
											:step="1"
											class="flex-1"
											@update:model-value="appearance.setFontSize(Number($event))"
										/>
										<span class="w-10 text-right text-xs font-semibold tabular-nums">
											{{ appearance.fontSize }}px
										</span>
									</div>
								</div>
							</div>

							<div class="nextchat-settings-row">
								<div class="nextchat-settings-row__copy">
									<p class="nextchat-settings-row__title">{{ t("settings.fontFamily") }}</p>
									<p class="nextchat-settings-row__subtitle">{{ t("settings.fontFamilyHint") }}</p>
								</div>
								<div class="nextchat-settings-row__control is-wide">
									<Input v-model="appearance.fontFamily" />
								</div>
							</div>

							<div class="nextchat-settings-row">
								<div class="nextchat-settings-row__copy">
									<p class="nextchat-settings-row__title">{{ t("settings.sendKey") }}</p>
									<p class="nextchat-settings-row__subtitle">{{ t("settings.sendKeyHint") }}</p>
								</div>
								<div class="nextchat-settings-row__control">
									<Select
										:model-value="appearance.submitKey"
										@update:model-value="appearance.submitKey = String($event) as 'enter' | 'ctrl-enter'"
									>
										<SelectTrigger class="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="enter">
												<span class="inline-flex items-center gap-2">
													<Keyboard class="size-3.5" />
													Enter
												</span>
											</SelectItem>
											<SelectItem value="ctrl-enter">
												<span class="inline-flex items-center gap-2">
													<Keyboard class="size-3.5" />
													Ctrl + Enter
												</span>
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
						</section>

						<section class="nextchat-settings-list">
							<header class="nextchat-settings-list__header">
								<Settings2 class="size-4" />
								<div>
									<p class="nextchat-settings-list__title">{{ t("settings.workspace") }}</p>
									<p class="nextchat-settings-list__copy">{{ t("settings.workspaceHint") }}</p>
								</div>
							</header>

							<div class="nextchat-settings-row">
								<div class="nextchat-settings-row__copy">
									<p class="nextchat-settings-row__title">{{ i18n.t("Settings.items.title.title") }}</p>
									<p class="nextchat-settings-row__subtitle">{{ t("settings.windowTitleHint") }}</p>
								</div>
								<div class="nextchat-settings-row__control is-wide">
									<Input
										:model-value="titleStore.title"
										@update:model-value="(value: string | number) => titleStore.setTitle(String(value))"
									/>
								</div>
							</div>
						</section>
					</template>

					<template v-else>
						<div class="nextchat-settings__metric-grid">
							<div class="nextchat-settings__metric">
								<span class="nextchat-settings__metric-label">
									<Activity class="size-3.5 text-primary" />
									{{ t("settings.totalRequests") }}
								</span>
								<strong class="nextchat-settings__metric-value">
									{{ formatNumber(store.totalUsage.requestCount) }}
								</strong>
							</div>
							<div class="nextchat-settings__metric">
								<span class="nextchat-settings__metric-label">
									<Gauge class="size-3.5 text-primary" />
									{{ t("settings.totalTokens") }}
								</span>
								<strong class="nextchat-settings__metric-value">
									{{ formatNumber(store.totalUsage.totalTokens) }}
								</strong>
							</div>
							<div class="nextchat-settings__metric">
								<span class="nextchat-settings__metric-label">
									<Server class="size-3.5 text-primary" />
									{{ t("inspector.averageLatency") }}
								</span>
								<strong class="nextchat-settings__metric-value">
									{{ formatDuration(averageLatency) }}
								</strong>
							</div>
						</div>

						<section class="nextchat-settings-list mt-5">
							<header class="nextchat-settings-list__header">
								<Bot class="size-4" />
								<div>
									<p class="nextchat-settings-list__title">{{ t("settings.usage") }}</p>
									<p class="nextchat-settings-list__copy">{{ t("settings.usageHint") }}</p>
								</div>
							</header>

							<div v-if="selectedAgent" class="nextchat-settings-row">
								<div class="nextchat-settings__agent-summary-main">
									<span
										class="flex size-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold text-white"
										:style="{ backgroundColor: selectedAgent.accent }"
									>
										{{ selectedAgent.name.slice(0, 2) }}
									</span>
									<div class="min-w-0">
										<p class="nextchat-settings-row__title">{{ selectedAgent.name }}</p>
										<p class="nextchat-settings-row__subtitle">{{ t("settings.agentUsage") }}</p>
									</div>
								</div>
								<div class="text-right">
									<p class="nextchat-settings-row__title tabular-nums">
										{{ formatNumber(selectedAgentUsage.totalTokens) }}
									</p>
									<p class="nextchat-settings-row__subtitle">
										{{ selectedAgentUsage.requestCount }} requests
									</p>
								</div>
							</div>
							<div v-else class="nextchat-settings-row">
								<p class="nextchat-settings-row__subtitle">{{ t("settings.noUsage") }}</p>
							</div>
						</section>
					</template>
				</div>
			</main>
		</div>

		<ConfirmDialog
			:open="confirmOpen"
			:title="confirmTitle"
			:description="confirmDescription"
			:confirm-label="confirmLabel"
			:cancel-label="t('settings.cancel')"
			:destructive="confirmDestructive"
			@confirm="confirmOpen = false; confirmAction?.(); confirmAction = null"
			@cancel="confirmOpen = false; confirmAction = null"
		/>
	</div>
</template>
