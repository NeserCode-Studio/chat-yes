<script setup lang="ts">
import { computed, ref, watch } from "vue"
import {
	Activity,
	BadgeCheck,
	Bot,
	Brain,
	CheckCircle2,
	ChevronRight,
	Gauge,
	KeyRound,
	Plus,
	Server,
	Settings2,
	ShieldCheck,
	SlidersHorizontal,
	Trash2,
	UserRound,
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
import { useDialogStore } from "@/store"
import { useI18nStore, useTitleStore } from "@/store"
import {
	aggregateMessageUsage,
	applyAgentPreset,
	createMemoryEntry,
} from "@/features/chat/domain"
import { useChatI18n } from "@/features/chat/i18n"
import { useChatStore } from "@/features/chat/store"
import ConfirmDialog from "@/features/chat/components/ConfirmDialog.vue"
import { AGENT_ACCENTS } from "@/features/chat/types"
import type {
	AgentPermissions,
	AgentProfile,
	AgentPreset,
	AgentRole,
} from "@/features/chat/types"
import { validateAgent } from "@/features/chat/validation"

type SettingsTab = "agents" | "general" | "usage"
type AgentTab = "connection" | "model" | "memory" | "permissions"
type PermissionKey = keyof AgentPermissions

const store = useChatStore()
const i18n = useI18nStore()
const titleStore = useTitleStore()
const dialogs = useDialogStore()
const { t } = useChatI18n()
const activeTab = ref<SettingsTab>("agents")
const agentTab = ref<AgentTab>("connection")
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

function cloneAgentProfile(agent: AgentProfile): AgentProfile {
	return JSON.parse(JSON.stringify(agent)) as AgentProfile
}
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
	discardChangesAnd(() => {
		store.addAgent()
		activeTab.value = "agents"
		agentTab.value = "connection"
	})
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
	if (selectedAgent.value?.id === agentId) return
	if (hasDraftChanges.value) {
		discardChangesAnd(() => {
			store.selectedAgentId = agentId
		})
		return
	}
	store.selectedAgentId = agentId
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
	if (!selectedAgent.value) return
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
	if (!agentDraft.value) return
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
	<div class="settings-console">
		<header class="settings-console__header">
			<div class="settings-console__title">
				<span class="settings-console__mark">
					<Settings2 class="size-5" />
				</span>
				<div>
					<p class="chat-eyebrow">CONTROL PLANE</p>
					<p class="text-base font-semibold">{{ t("settings.title") }}</p>
					<p class="mt-0.5 text-xs text-muted-foreground">
						{{ t("settings.description") }}
					</p>
				</div>
			</div>
			<nav class="settings-tabs">
				<button
					v-for="tab in [
						{ id: 'agents', label: t('settings.agents'), icon: Bot },
						{ id: 'general', label: t('settings.general'), icon: SlidersHorizontal },
						{ id: 'usage', label: t('settings.usage'), icon: Gauge },
					]"
					:key="tab.id"
					type="button"
					class="settings-tab"
					:class="{ 'is-active': activeTab === tab.id }"
					@click="setTopTab(tab.id as SettingsTab)"
				>
					<component :is="tab.icon" class="size-3.5" />
					{{ tab.label }}
				</button>
			</nav>
			<Button variant="outline" size="sm" class="ml-1 shrink-0" @click="closeSettings">
				<CheckCircle2 class="size-3.5" />
				{{ t("settings.done") }}
			</Button>
		</header>

		<section v-if="activeTab === 'agents'" class="settings-agents">
			<aside class="settings-agent-list">
				<div class="flex items-center justify-between px-3 py-2">
					<span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						{{ t("settings.agents") }}
					</span>
					<Button size="icon" class="size-7" @click="addAgent">
						<Plus class="size-3.5" />
					</Button>
				</div>
				<button
					v-for="agent in store.agents"
					:key="agent.id"
					type="button"
					class="settings-agent-row"
					:class="{ 'is-active': selectedAgent?.id === agent.id }"
					@click="selectAgent(agent.id)"
				>
					<span
						class="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white"
						:style="{ backgroundColor: agent.accent }"
					>
						{{ agent.name.slice(0, 2) }}
					</span>
					<span class="min-w-0 flex-1 text-left">
						<span class="block truncate text-xs font-semibold">{{ agent.name }}</span>
						<span class="mt-0.5 block truncate text-xs text-muted-foreground">
							{{ agent.model || "No model" }}
						</span>
					</span>
					<ChevronRight class="size-3.5 text-muted-foreground" />
				</button>
				<button v-if="!store.agents.length" type="button" class="settings-agent-empty" @click="addAgent">
					<Plus class="size-4" />
					{{ t("settings.addAgent") }}
				</button>
			</aside>

			<div v-if="selectedAgent && agentDraft" class="settings-agent-editor">
				<div class="settings-agent-summary">
					<div class="flex items-center gap-3">
						<span
							class="flex size-10 items-center justify-center rounded-md text-sm font-semibold text-white"
							:style="{ backgroundColor: selectedAgent.accent }"
						>
							{{ selectedAgent.name.slice(0, 2) }}
						</span>
						<div>
							<p class="text-sm font-semibold">{{ selectedAgent.name }}</p>
							<p class="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
								<CheckCircle2 v-if="validation?.valid" class="size-3 text-emerald-600" />
								<Server v-else class="size-3 text-amber-600" />
								{{ validation?.valid ? t("settings.connectionReady") : t("settings.connectionIncomplete") }}
							</p>
						</div>
					</div>
					<div class="flex items-center gap-3">
						<div class="text-right">
							<p class="text-xs font-semibold">{{ agentDraft.enabled ? t("settings.enabled") : t("settings.disabled") }}</p>
							<p class="text-xs text-muted-foreground">{{ t("settings.agentSwitchHint") }}</p>
						</div>
						<Switch v-model="agentDraft.enabled" />
						<Button variant="ghost" size="icon" class="size-8 text-muted-foreground hover:text-red-600" @click="deleteAgent">
							<Trash2 class="size-4" />
						</Button>
					</div>
				</div>

				<nav class="settings-agent-tabs">
					<button
						v-for="tab in [
							{ id: 'connection', label: t('settings.connection'), icon: Server },
							{ id: 'model', label: t('settings.model'), icon: SlidersHorizontal },
							{ id: 'memory', label: t('settings.memory'), icon: Brain },
							{ id: 'permissions', label: t('settings.permissions'), icon: ShieldCheck },
						]"
						:key="tab.id"
						type="button"
						class="settings-agent-tab"
						:class="{ 'is-active': agentTab === tab.id }"
						@click="agentTab = tab.id as AgentTab"
					>
						<component :is="tab.icon" class="size-3.5" />
						{{ tab.label }}
					</button>
				</nav>

				<div class="settings-agent-body">
					<div v-if="agentTab === 'connection'" class="settings-form">
						<div class="settings-form-grid">
							<label class="settings-field">
								<span>{{ t("settings.name") }}</span>
								<Input v-model="selectedAgent.name" />
							</label>
							<label class="settings-field">
								<span>{{ t("settings.role") }}</span>
								<Select v-model="agentDraft.role">
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem v-for="role in roles" :key="role.value" :value="role.value">
											{{ role.label }}
										</SelectItem>
									</SelectContent>
								</Select>
							</label>
						</div>

						<label class="settings-field">
							<span>{{ t("settings.endpoint") }}</span>
							<Input v-model="agentDraft.endpoint" placeholder="http://localhost:1234/v1" />
							<small>{{ t("settings.endpointHint") }}</small>
						</label>

						<div class="settings-form-grid">
							<label class="settings-field">
								<span>{{ t("settings.modelId") }}</span>
								<Input v-model="agentDraft.model" placeholder="gpt-4.1-mini" />
							</label>
							<label class="settings-field">
								<span>{{ t("settings.apiKey") }}</span>
								<Input
									v-model="apiKeyDraft"
									type="password"
									placeholder="sk-..."
									autocomplete="off"
								/>
							</label>
						</div>

						<small class="settings-secret-status">
							<KeyRound class="size-3 shrink-0" />
							{{ savedSecret ? t("settings.secretSaved") : t("settings.secretMissing") }}
						</small>

						<div class="settings-form-grid">
							<label class="settings-field">
								<span>{{ t("settings.accent") }}</span>
								<div class="flex items-center gap-2">
									<div class="flex items-center gap-1">
										<Button
											v-for="accent in AGENT_ACCENTS"
											:key="accent"
											variant="ghost"
											size="icon"
											class="size-7 rounded-full border p-0"
											:class="agentDraft.accent === accent ? 'ring-2 ring-primary' : ''"
											@click="agentDraft.accent = accent"
										>
											<span class="block size-4 rounded-full" :style="{ backgroundColor: accent }"></span>
										</Button>
									</div>
									<Input v-model="agentDraft.accent" class="font-mono text-xs" />
								</div>
							</label>
							<label class="settings-field">
								<span>{{ t("settings.timeout") }}</span>
								<Input
									:model-value="agentDraft.timeoutMs"
									type="number"
									min="1000"
									step="1000"
									@update:model-value="agentDraft.timeoutMs = Number($event)"
								/>
							</label>
						</div>

						<div v-if="validation && !validation.valid" class="settings-warning">
							<p v-for="reason in validation.reasons" :key="reason">{{ reason }}</p>
						</div>
					</div>

					<div v-else-if="agentTab === 'model'" class="settings-form">
						<div class="settings-form-grid">
							<label class="settings-field">
								<span>{{ t("settings.preset") }}</span>
								<Select :model-value="agentDraft.preset" @update:model-value="updatePreset(String($event))">
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem v-for="preset in presets" :key="preset.value" :value="preset.value">
											{{ preset.label }}
										</SelectItem>
									</SelectContent>
								</Select>
							</label>
							<label class="settings-field">
								<span>{{ t("settings.temperature") }}</span>
								<div class="flex items-center gap-3">
									<Slider
										v-model="agentDraft.temperature"
										:min="0"
										:max="2"
										:step="0.1"
										class="flex-1"
									/>
									<span class="w-9 text-right text-xs font-semibold tabular-nums">{{ selectedAgent.temperature.toFixed(1) }}</span>
								</div>
							</label>
						</div>

						<label class="settings-field">
							<span>{{ t("settings.systemPrompt") }}</span>
							<Textarea v-model="agentDraft.systemPrompt" rows="5" />
						</label>

						<div class="settings-form-grid settings-form-grid--three">
							<label class="settings-field">
								<span>{{ t("settings.maxTokens") }}</span>
								<Input
									:model-value="agentDraft.maxTokens"
									type="number"
									min="1"
									step="100"
									@update:model-value="agentDraft.maxTokens = Number($event)"
								/>
							</label>
							<label class="settings-field">
								<span>{{ t("settings.contextWindow") }}</span>
								<Input
									:model-value="agentDraft.contextWindow"
									type="number"
									min="1024"
									step="1024"
									@update:model-value="agentDraft.contextWindow = Number($event)"
								/>
							</label>
							<label class="settings-field">
								<span>{{ t("settings.retries") }}</span>
								<Input
									:model-value="agentDraft.retryCount"
									type="number"
									min="0"
									max="5"
									@update:model-value="agentDraft.retryCount = Number($event)"
								/>
							</label>
						</div>

						<div class="settings-switch-row">
							<div>
								<p class="text-xs font-semibold">{{ t("settings.streaming") }}</p>
								<p class="mt-0.5 text-xs text-muted-foreground">{{ t("settings.streamingHint") }}</p>
							</div>
							<Switch v-model="agentDraft.streaming" />
						</div>
					</div>

					<div v-else-if="agentTab === 'memory'" class="settings-form">
						<div class="settings-section-heading">
							<div>
								<p class="text-xs font-semibold">{{ t("settings.memory") }}</p>
								<p class="mt-0.5 text-xs text-muted-foreground">{{ t("settings.memoryHint") }}</p>
							</div>
							<Brain class="size-4 text-muted-foreground" />
						</div>

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

						<div v-if="agentDraft.memories.length" class="settings-memory-list">
							<div v-for="memory in agentDraft.memories" :key="memory.id" class="settings-memory-row">
								<Brain class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
								<Textarea
									v-model="memory.content"
									rows="2"
									class="min-h-12 flex-1 resize-y border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
								/>
								<Switch v-model="memory.enabled" />
								<Button variant="ghost" size="icon" class="size-7" @click="removeMemory(memory.id)">
									<Trash2 class="size-3.5" />
								</Button>
							</div>
						</div>
						<p v-else class="rounded-md border border-dashed p-8 text-center text-xs text-muted-foreground">
							{{ t("settings.memoryEmpty") }}
						</p>
					</div>

					<div v-else class="settings-form">
						<div class="settings-section-heading">
							<div>
								<p class="text-xs font-semibold">{{ t("settings.permissions") }}</p>
								<p class="mt-0.5 text-xs text-muted-foreground">{{ t("settings.permissionBoundary") }}</p>
							</div>
							<ShieldCheck class="size-4 text-muted-foreground" />
						</div>

						<div class="settings-permission-list">
							<div v-for="permission in permissionItems" :key="permission.key" class="settings-permission-row">
								<div class="min-w-0">
									<p class="text-xs font-semibold">{{ permission.label }}</p>
									<p class="mt-1 text-xs leading-5 text-muted-foreground">{{ permission.hint }}</p>
								</div>
								<Switch
									:model-value="selectedAgent.permissions[permission.key]"
									@update:model-value="(value: boolean) => setPermission(permission.key, value)"
								/>
							</div>
						</div>

					</div>
				</div>

				<div class="settings-savebar">
					<div class="min-w-0">
						<p class="text-xs font-semibold">
							{{ hasDraftChanges ? t("settings.unsavedTitle") : t("settings.saved") }}
						</p>
						<p class="text-xs text-muted-foreground">{{ t("settings.saveHint") }}</p>
					</div>
					<div class="flex shrink-0 gap-2">
						<Button variant="outline" size="sm" :disabled="!hasDraftChanges" @click="resetAgentDraft">
							{{ t("settings.discard") }}
						</Button>
						<Button size="sm" :disabled="!hasDraftChanges" @click="saveAgentDraft">
							<BadgeCheck class="size-3.5" />
							{{ t("settings.save") }}
						</Button>
					</div>
				</div>
			</div>

			<div v-else class="settings-agent-editor">
				<div class="empty-inspector">
					<UserRound class="size-5" />
					<p class="font-medium">{{ t("settings.noAgent") }}</p>
					<Button class="mt-2" @click="addAgent">
						<Plus class="size-4" />
						{{ t("settings.addAgent") }}
					</Button>
				</div>
			</div>
		</section>

		<section v-else-if="activeTab === 'general'" class="settings-page">
			<div class="settings-page__intro">
				<p class="chat-eyebrow">APPLICATION</p>
				<h2>{{ t("settings.workspace") }}</h2>
				<p>{{ t("settings.workspaceHint") }}</p>
			</div>
			<div class="settings-panel">
				<label class="settings-field">
					<span>{{ i18n.t("Settings.items.title.title") }}</span>
					<Input
						:model-value="titleStore.title"
						@update:model-value="(value: string | number) => titleStore.setTitle(String(value))"
					/>
				</label>
				<label class="settings-field">
					<span>{{ i18n.t("Settings.items.lang.label") }}</span>
					<Select :model-value="i18n.lang" @update:model-value="i18n.setLanguage(String($event) as never)">
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="zh-CN">简体中文</SelectItem>
							<SelectItem value="en-US">English (US)</SelectItem>
						</SelectContent>
					</Select>
				</label>
			</div>
		</section>

		<section v-else class="settings-page">
			<div class="settings-page__intro">
				<p class="chat-eyebrow">OBSERVABILITY</p>
				<h2>{{ t("settings.usage") }}</h2>
				<p>{{ t("settings.usageHint") }}</p>
			</div>
			<div class="usage-overview">
				<div class="usage-overview__metric">
					<Activity class="size-4 text-teal-600" />
					<span>{{ t("settings.totalRequests") }}</span>
					<strong>{{ formatNumber(store.totalUsage.requestCount) }}</strong>
				</div>
				<div class="usage-overview__metric">
					<Gauge class="size-4 text-amber-600" />
					<span>{{ t("settings.totalTokens") }}</span>
					<strong>{{ formatNumber(store.totalUsage.totalTokens) }}</strong>
				</div>
				<div class="usage-overview__metric">
					<Server class="size-4 text-blue-600" />
					<span>{{ t("inspector.averageLatency") }}</span>
					<strong>{{ formatDuration(averageLatency) }}</strong>
				</div>
			</div>
			<div class="settings-panel">
				<div v-if="selectedAgent" class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<span class="flex size-8 items-center justify-center rounded-md text-xs font-semibold text-white" :style="{ backgroundColor: selectedAgent.accent }">
							{{ selectedAgent.name.slice(0, 2) }}
						</span>
						<div>
							<p class="text-xs font-semibold">{{ selectedAgent.name }}</p>
							<p class="text-xs text-muted-foreground">{{ t("settings.agentUsage") }}</p>
						</div>
					</div>
					<div class="text-right">
						<p class="text-lg font-semibold tabular-nums">{{ formatNumber(selectedAgentUsage.totalTokens) }}</p>
						<p class="text-xs text-muted-foreground">{{ selectedAgentUsage.requestCount }} requests</p>
					</div>
				</div>
				<p v-else class="text-xs text-muted-foreground">{{ t("settings.noUsage") }}</p>
			</div>
		</section>

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
