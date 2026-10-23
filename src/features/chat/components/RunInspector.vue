<script setup lang="ts">
import { computed, ref } from "vue"
import {
	Download,
	Gauge,
	LayoutList,
	Settings2,
	UsersRound,
	X,
} from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollAreaInner } from "@/components/ui/scroll-area"
import { useToast } from "@/composables/useToast"
import { useDialogStore } from "@/store"
import { aggregateMessageUsage } from "../domain"
import {
	createConversationExport,
	saveConversationExport,
} from "../export"
import { useChatI18n } from "../i18n"
import { useChatStore } from "../store"
import type { Conversation } from "../types"
import { validateAgent } from "../validation"
import AgentAvatar from "./AgentAvatar.vue"

const props = defineProps<{
	conversation: Conversation
}>()

const emit = defineEmits<{
	close: []
}>()

type InspectorTab = "overview" | "usage"

const store = useChatStore()
const dialogs = useDialogStore()
const { t } = useChatI18n()
const { error: toastError, info, success } = useToast({ duration: 2800 })
const activeTab = ref<InspectorTab>("overview")
const exporting = ref(false)

const participants = computed(() =>
	props.conversation.participantIds
		.map((id) => store.getAgent(id))
		.filter((agent) => Boolean(agent))
)
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

function usageFor(agentId: string) {
	return aggregateMessageUsage(
		(store.messagesByConversation[props.conversation.id] ?? []).filter(
			(message) => message.agentId === agentId
		)
	)
}

function configure(agentId: string): void {
	store.selectedAgentId = agentId
	dialogs.openSettings("ai")
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

async function exportConversation(): Promise<void> {
	if (exporting.value) return
	exporting.value = true
	try {
		const exportData = createConversationExport({
			conversation: props.conversation,
			agents: store.agents,
			messages: store.getMessages(props.conversation.id),
		})
		const result = await saveConversationExport(props.conversation, exportData)
		if (result === "saved") {
			success(t.value("workspace.exported"))
		} else {
			info(t.value("workspace.exportedToDownloads"))
		}
	} catch {
		toastError(t.value("workspace.exportFailed"))
	} finally {
		exporting.value = false
	}
}
</script>

<template>
	<aside class="run-inspector">
		<header class="run-inspector__header">
			<div class="min-w-0">
				<p class="chat-eyebrow">LIVE CONTEXT</p>
				<p class="run-inspector__title">{{ t("workspace.inspector") }}</p>
			</div>
			<div class="run-inspector__header-actions">
				<div class="run-inspector__live-status">
					<span
						class="run-inspector__live-dot"
						:data-status="conversation.status"
					></span>
					{{ conversation.status }}
				</div>
				<Button
					variant="ghost"
					size="icon"
					class="size-8"
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
					{ id: 'overview', icon: LayoutList, label: t('inspector.overview') },
					{ id: 'usage', icon: Gauge, label: t('inspector.usage') },
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

		<ScrollArea class="inspector-body">
			<ScrollAreaInner>
				<section v-if="activeTab === 'overview'" class="inspector-section">
					<div class="inspector-summary">
						<div>
							<p class="inspector-summary__label">{{ t("inspector.mode") }}</p>
							<p class="inspector-summary__value">{{ modeLabel }}</p>
						</div>
						<div>
							<p class="inspector-summary__label">{{ t("inspector.roundLimit") }}</p>
							<p class="inspector-summary__value">{{ conversation.roundLimit }}</p>
						</div>
						<div>
							<p class="inspector-summary__label">{{ t("inspector.requestLimit") }}</p>
							<p class="inspector-summary__value">{{ conversation.requestLimit }}</p>
						</div>
					</div>

					<div class="section-heading inspector-roster-heading">
						<div>
							<p class="section-title">
								{{ t("workspace.participants", { count: participants.length }) }}
							</p>
							<p class="section-copy">{{ t("inspector.participantHint") }}</p>
						</div>
						<Button
							variant="outline"
							size="sm"
							@click="dialogs.openSettings('conversation')"
						>
							<UsersRound class="size-3.5" />
							{{ t("inspector.manageParticipants") }}
						</Button>
					</div>

					<div class="agent-list">
						<div
							v-for="agent in participants"
							:key="agent?.id"
							class="agent-row"
						>
							<AgentAvatar :agent="agent" size="md" />
							<div class="min-w-0 flex-1">
								<p class="truncate text-xs font-semibold">{{ agent?.name }}</p>
								<p class="agent-row__meta">
									<span
										class="agent-row__dot"
										:class="agent?.enabled && validateAgent(agent).valid ? 'is-ready' : 'is-warning'"
									></span>
									{{ agent?.model || "No model" }}
								</p>
							</div>
							<Button
								variant="ghost"
								size="icon"
								class="size-7"
								:title="t('workspace.configure')"
								@click="configure(agent!.id)"
							>
								<Settings2 class="size-3.5" />
							</Button>
						</div>
					</div>

					<div v-if="!participants.length" class="inspector-empty">
						<UsersRound class="size-5" />
						<p>{{ t("inspector.noParticipants") }}</p>
						<Button variant="outline" size="sm" @click="dialogs.openSettings('conversation')">
							{{ t("inspector.manageParticipants") }}
						</Button>
					</div>
				</section>

				<section v-else class="inspector-section">
					<div class="section-heading">
						<div>
							<p class="section-title">{{ t("inspector.budget") }}</p>
							<p class="section-copy">
								{{ formatNumber(conversation.usage.totalTokens) }} /
								{{ formatNumber(conversation.tokenBudget) }}
							</p>
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

					<p class="inspector-usage-title">{{ t("inspector.byAgent") }}</p>
					<div class="inspector-usage-list">
						<div
							v-for="agent in participants"
							:key="agent?.id"
							class="inspector-usage-row"
						>
							<AgentAvatar :agent="agent" size="sm" />
							<span class="min-w-0 flex-1 truncate text-xs font-semibold">
								{{ agent?.name }}
							</span>
							<span class="text-xs text-muted-foreground">
								{{
									t("inspector.tokens", {
										count: formatNumber(usageFor(agent!.id).totalTokens),
									})
								}}
							</span>
						</div>
					</div>
				</section>
			</ScrollAreaInner>
		</ScrollArea>

		<footer class="run-inspector__footer">
			<Button
				variant="outline"
				class="w-full justify-start"
				:disabled="exporting"
				@click="exportConversation"
			>
				<Download class="size-4" />
				{{ t("workspace.exportSession") }}
			</Button>
			<p>{{ t("inspector.exportHint") }}</p>
		</footer>
	</aside>
</template>
