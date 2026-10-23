<script setup lang="ts">
import { computed, ref, watch } from "vue"
import {
	Bot,
	Brain,
	Gauge,
	KeyRound,
	Plus,
	Settings2,
	ShieldCheck,
	Trash2,
	X,
} from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useDialogStore } from "@/store"
import { aggregateMessageUsage } from "../domain"
import { useChatI18n } from "../i18n"
import { useChatStore } from "../store"
import type {
	AgentPermissions,
	Conversation,
} from "../types"
import { validateAgent } from "../validation"
import AgentAvatar from "./AgentAvatar.vue"

const props = defineProps<{
	conversation: Conversation
}>()

const emit = defineEmits<{
	close: []
}>()

type InspectorTab = "agents" | "usage" | "memory" | "permissions"
type PermissionKey = keyof AgentPermissions

const store = useChatStore()
const dialogs = useDialogStore()
const { t } = useChatI18n()
const activeTab = ref<InspectorTab>("agents")
const memoryDraft = ref("")

const selectedAgent = computed(() => store.selectedAgent)
const modeLabel = computed(() =>
	props.conversation.mode === "relay"
		? t.value("inspector.modeRelay")
		: t.value("inspector.modeRoundtable")
)
const budgetPercent = computed(() => {
	const budget = Math.max(1, props.conversation.tokenBudget)
	return Math.min(
		100,
		Math.round((props.conversation.usage.totalTokens / budget) * 100)
	)
})
const averageLatency = computed(() => {
	const count = props.conversation.usage.requestCount
	return count ? Math.round(props.conversation.usage.latencyMs / count) : 0
})
const selectedUsage = computed(() => {
	if (!selectedAgent.value) return aggregateMessageUsage([])
	return aggregateMessageUsage(
		(store.messagesByConversation[props.conversation.id] ?? [])
			.filter((message) => message.agentId === selectedAgent.value?.id)
	)
})
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
	() => props.conversation.id,
	() => {
		const firstParticipant = props.conversation.participantIds[0]
		if (
			firstParticipant &&
			(!selectedAgent.value?.id ||
				!props.conversation.participantIds.includes(selectedAgent.value.id))
		) {
			store.selectedAgentId = firstParticipant
		}
	},
	{ immediate: true }
)

function isParticipant(agentId: string): boolean {
	return props.conversation.participantIds.includes(agentId)
}

function configure(agentId: string): void {
	store.selectedAgentId = agentId
	dialogs.openSettings("ai")
}

function setPermission(key: PermissionKey, value: boolean): void {
	if (!selectedAgent.value) return
	selectedAgent.value.permissions[key] = value
	selectedAgent.value.updatedAt = Date.now()
}

function addMemory(): void {
	if (!selectedAgent.value) return
	store.addMemory(selectedAgent.value.id, memoryDraft.value)
	memoryDraft.value = ""
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
	<aside class="run-inspector">
		<header class="run-inspector__header">
			<div>
				<p class="chat-eyebrow">LIVE CONTEXT</p>
				<p class="text-sm font-semibold">{{ t("workspace.inspector") }}</p>
			</div>
			<div class="flex items-center gap-2">
				<div class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
					<span
						class="size-1.5 rounded-full"
						:class="conversation.status === 'running' ? 'bg-primary animate-pulse' : 'bg-emerald-500'"
					></span>
					{{ conversation.status }}
				</div>
				<Button
					variant="ghost"
					size="icon"
					class="size-8 rounded-lg"
					:title="t('workspace.closeInspector')"
					@click="emit('close')"
				>
					<X class="size-4" />
				</Button>
			</div>
		</header>

		<nav class="inspector-tabs" aria-label="Inspector sections">
			<button
				v-for="tab in [
					{ id: 'agents', icon: Bot, label: t('inspector.agents') },
					{ id: 'usage', icon: Gauge, label: t('inspector.usage') },
					{ id: 'memory', icon: Brain, label: t('inspector.memory') },
					{ id: 'permissions', icon: ShieldCheck, label: t('inspector.permissions') },
				]"
				:key="tab.id"
				type="button"
				class="inspector-tab"
				:class="{ 'is-active': activeTab === tab.id }"
				@click="activeTab = tab.id as InspectorTab"
			>
				<component :is="tab.icon" class="size-3.5" />
				<span>{{ tab.label }}</span>
			</button>
		</nav>

		<div class="inspector-body">
			<section v-if="activeTab === 'agents'" class="inspector-section">
				<div class="section-heading">
					<div>
						<p class="section-title">{{ t("workspace.participants", { count: conversation.participantIds.length }) }}</p>
						<p class="section-copy">
							{{ modeLabel }} · {{ t("workspace.maxRounds", { count: conversation.roundLimit }) }}
						</p>
					</div>
					<Button variant="ghost" size="icon" class="size-7" @click="dialogs.openSettings('ai')">
						<Plus class="size-3.5" />
					</Button>
				</div>

				<div class="agent-list">
					<div
						v-for="agent in store.agents"
						:key="agent.id"
						class="agent-row"
						:class="{
							'is-selected': isParticipant(agent.id),
							'opacity-70': !agent.enabled,
						}"
					>
						<AgentAvatar :agent="agent" size="md" />
						<button
							type="button"
							class="min-w-0 flex-1 text-left"
							@click="store.selectedAgentId = agent.id"
						>
							<p class="truncate text-xs font-semibold">{{ agent.name }}</p>
							<p class="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
								<span
									class="size-1.5 rounded-full"
									:class="!agent.enabled ? 'bg-neutral-500' : validateAgent(agent).valid ? 'bg-emerald-500' : 'bg-amber-500'"
								></span>
								{{ !agent.enabled ? t("settings.disabled") : validateAgent(agent).valid ? t("inspector.ready") : t("inspector.incomplete") }}
								· {{ agent.model || "No model" }}
							</p>
						</button>
						<Button
							variant="ghost"
							size="icon"
							class="size-7"
							:title="t('workspace.configure')"
							@click="configure(agent.id)"
						>
							<Settings2 class="size-3.5" />
						</Button>
						<button
							type="button"
							class="participant-toggle"
							:class="{ 'is-on': isParticipant(agent.id) }"
							:title="isParticipant(agent.id) ? t('inspector.selected') : t('inspector.addToSession')"
							@click="store.toggleParticipant(conversation.id, agent.id)"
						>
							<span></span>
						</button>
					</div>
				</div>

				<Button variant="outline" class="mt-3 w-full justify-start" @click="dialogs.openSettings('ai')">
					<Plus class="size-4" />
					{{ t("settings.addAgent") }}
				</Button>
			</section>

			<section v-else-if="activeTab === 'usage'" class="inspector-section">
				<div class="section-heading">
					<div>
						<p class="section-title">{{ t("inspector.budget") }}</p>
						<p class="section-copy">{{ formatNumber(conversation.usage.totalTokens) }} / {{ formatNumber(conversation.tokenBudget) }}</p>
					</div>
					<span class="metric-chip">{{ budgetPercent }}%</span>
				</div>
				<div class="budget-track">
					<span :style="{ width: `${budgetPercent}%` }"></span>
				</div>

				<div class="metric-grid">
					<div class="metric-cell">
						<span>{{ t("inspector.requests") }}</span>
						<strong>{{ conversation.usage.requestCount }}</strong>
					</div>
					<div class="metric-cell">
						<span>{{ t("inspector.averageLatency") }}</span>
						<strong>{{ formatDuration(averageLatency) }}</strong>
					</div>
					<div class="metric-cell">
						<span>{{ t("inspector.prompt") }}</span>
						<strong>{{ formatNumber(conversation.usage.promptTokens) }}</strong>
					</div>
					<div class="metric-cell">
						<span>{{ t("inspector.completion") }}</span>
						<strong>{{ formatNumber(conversation.usage.completionTokens) }}</strong>
					</div>
				</div>

				<div v-if="selectedAgent" class="usage-agent">
					<div class="flex items-center gap-2">
						<AgentAvatar :agent="selectedAgent" size="sm" />
						<div class="min-w-0">
							<p class="truncate text-xs font-semibold">{{ selectedAgent.name }}</p>
							<p class="text-xs text-muted-foreground">{{ t("settings.agentUsage") }}</p>
						</div>
					</div>
					<div class="mt-3 grid grid-cols-2 gap-3">
						<div>
							<p class="text-xs text-muted-foreground">{{ t("inspector.total") }}</p>
							<p class="text-sm font-semibold tabular-nums">{{ formatNumber(selectedUsage.totalTokens) }}</p>
						</div>
						<div>
							<p class="text-xs text-muted-foreground">{{ t("inspector.requests") }}</p>
							<p class="text-sm font-semibold tabular-nums">{{ selectedUsage.requestCount }}</p>
						</div>
					</div>
				</div>

				<Button
					variant="outline"
					class="mt-4 w-full justify-start"
					@click="dialogs.openSettings('conversation')"
				>
					<Settings2 class="size-4" />
					{{ t("settings.conversation") }}
				</Button>
			</section>

			<section v-else-if="activeTab === 'memory'" class="inspector-section">
				<div v-if="selectedAgent">
					<div class="flex items-center gap-2">
						<AgentAvatar :agent="selectedAgent" size="sm" />
						<div class="min-w-0">
							<p class="truncate text-xs font-semibold">{{ selectedAgent.name }}</p>
							<p class="text-xs text-muted-foreground">{{ t("inspector.memoryHint") }}</p>
						</div>
					</div>

					<div v-if="selectedAgent.permissions.readMemory" class="mt-4">
						<div class="flex gap-1.5">
							<Input
								v-model="memoryDraft"
								:placeholder="t('inspector.addMemory')"
								class="h-8 text-xs"
								@keydown.enter="addMemory"
							/>
							<Button size="icon" class="size-8" :disabled="!memoryDraft.trim()" @click="addMemory">
								<Plus class="size-3.5" />
							</Button>
						</div>

						<div v-if="selectedAgent.memories.length" class="memory-list">
							<div
								v-for="memory in selectedAgent.memories"
								:key="memory.id"
								class="memory-row"
							>
								<p class="min-w-0 flex-1 text-xs leading-5">{{ memory.content }}</p>
								<Button
									variant="ghost"
									size="icon"
									class="size-6 shrink-0"
									@click="store.removeMemory(selectedAgent.id, memory.id)"
								>
									<Trash2 class="size-3" />
								</Button>
							</div>
						</div>
						<p v-else class="mt-4 rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
							{{ t("inspector.noMemory") }}
						</p>
					</div>
					<div v-else class="mt-4 rounded-md border border-dashed p-4 text-center">
						<KeyRound class="mx-auto size-4 text-muted-foreground" />
						<p class="mt-2 text-xs text-muted-foreground">{{ t("inspector.memoryDisabled") }}</p>
					</div>
				</div>
			</section>

			<section v-else class="inspector-section">
				<div v-if="selectedAgent">
					<div class="flex items-center gap-2">
						<AgentAvatar :agent="selectedAgent" size="sm" />
						<div class="min-w-0">
							<p class="truncate text-xs font-semibold">{{ selectedAgent.name }}</p>
							<p class="text-xs text-muted-foreground">{{ t("settings.permissionBoundary") }}</p>
						</div>
					</div>

					<div class="permission-list">
						<div
							v-for="permission in permissionItems"
							:key="permission.key"
							class="permission-row"
						>
							<div class="min-w-0">
								<p class="text-xs font-semibold">{{ permission.label }}</p>
								<p class="mt-0.5 text-xs leading-5 text-muted-foreground">{{ permission.hint }}</p>
							</div>
							<Switch
								:model-value="selectedAgent.permissions[permission.key]"
								@update:model-value="(value: boolean) => setPermission(permission.key, value)"
							/>
						</div>
					</div>
				</div>
			</section>
		</div>
	</aside>
</template>
