<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import {
	Bot,
	CircleDot,
	MessageSquarePlus,
	Settings2,
	Sparkles,
	Users,
} from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/composables/useToast"
import { useDialogStore } from "@/store"
import ChatTranscript from "@/features/chat/components/ChatTranscript.vue"
import ConversationSidebar from "@/features/chat/components/ConversationSidebar.vue"
import ConfirmDialog from "@/features/chat/components/ConfirmDialog.vue"
import MessageComposer from "@/features/chat/components/MessageComposer.vue"
import RunInspector from "@/features/chat/components/RunInspector.vue"
import { useChatI18n } from "@/features/chat/i18n"
import { createId } from "@/features/chat/ids"
import { runConversation } from "@/features/chat/orchestrator"
import { useChatStore } from "@/features/chat/store"
import type { ComposerSendPayload } from "@/features/chat/types"

const store = useChatStore()
const dialogs = useDialogStore()
const { t } = useChatI18n()
const { error: toastError, info, warning } = useToast({ duration: 2800 })
const activeRun = ref<AbortController | null>(null)
const titleDraft = ref("")
const confirmOpen = ref(false)
const confirmAction = ref<(() => void) | null>(null)

const conversation = computed(() => store.activeConversation)
const participantCount = computed(
	() => conversation.value?.participantIds.length ?? 0
)
const canStartConversation = computed(() => store.agents.length > 0)

watch(
	() => conversation.value?.id,
	() => {
		titleDraft.value = conversation.value?.title ?? ""
	},
	{ immediate: true }
)

onMounted(() => {
	store.initialize()
	if (!store.activeConversationId && store.conversations.length) {
		store.selectConversation(store.conversations[0].id)
	}
})

onBeforeUnmount(() => {
	activeRun.value?.abort()
})

function createSession(): void {
	if (!canStartConversation.value) {
		store.addAgent()
		dialogs.openSettings()
		return
	}
	store.addConversation()
}

function deleteSession(conversationId: string): void {
	confirmAction.value = () => {
		if (store.activeConversation?.id === conversationId) {
			activeRun.value?.abort()
		}
		store.deleteConversation(conversationId)
	}
	confirmOpen.value = true
}

function renameSession(): void {
	if (!conversation.value) return
	const title = titleDraft.value.trim()
	if (!title) {
		titleDraft.value = conversation.value.title
		return
	}
	store.renameConversation(conversation.value.id, title)
	titleDraft.value = title
}

async function sendMessage(payload: ComposerSendPayload): Promise<void> {
	const current = conversation.value
	if (!current || current.status === "running") return
	if (!current.participantIds.length) {
		warning(t.value("workspace.emptyAgentHint"))
		return
	}

	store.addMessage(current.id, {
		id: createId("message"),
		role: "user",
		content: payload.content,
		mentions: payload.mentions,
		attachments: payload.attachments,
		status: "complete",
		createdAt: Date.now(),
	})

	const controller = new AbortController()
	activeRun.value = controller
	const result = await runConversation(store, current.id, {
		signal: controller.signal,
		targetAgentIds: payload.mentions,
	})
	activeRun.value = null

	if (result.status === "error") {
		toastError(result.message ?? t.value("run.error"))
	} else if (result.status === "stopped") {
		info(t.value("run.stopped"))
	}
}

function stopRun(): void {
	const current = conversation.value
	if (!current) return
	activeRun.value?.abort()
	store.setConversationStatus(current.id, "stopped")
}

function handleComposerCommand(command: "new" | "stop" | "settings" | "clear"): void {
	if (command === "new") createSession()
	else if (command === "stop") stopRun()
	else if (command === "settings") dialogs.openSettings()
}

function configureAgent(agentId?: string): void {
	if (agentId) store.selectedAgentId = agentId
	dialogs.openSettings()
}
</script>

<template>
	<div class="chat-workspace">
		<ConversationSidebar @create="createSession" @delete="deleteSession" />

		<section class="chat-stage">
			<template v-if="conversation">
				<header class="chat-header">
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<CircleDot
								class="size-3.5 shrink-0"
								:class="conversation.status === 'running' ? 'text-teal-600 animate-pulse' : 'text-muted-foreground'"
							/>
							<Input
								v-model="titleDraft"
								class="h-8 max-w-md border-transparent bg-transparent px-1 text-base font-semibold shadow-none focus-visible:bg-black/5 dark:focus-visible:bg-white/5"
								@blur="renameSession"
								@keydown.enter="renameSession"
							/>
						</div>
						<div class="mt-1.5 flex items-center gap-2 pl-5">
							<div class="flex -space-x-1.5">
								<button
									v-for="agent in store.activeAgents"
									:key="agent.id"
									type="button"
									class="rounded-md ring-2 ring-background transition-transform hover:-translate-y-0.5"
									:title="agent.name"
									@click="configureAgent(agent.id)"
								>
									<span
										class="flex size-5 items-center justify-center rounded-md text-[0.7rem] font-semibold text-white"
										:style="{ backgroundColor: agent.accent }"
									>
										{{ agent.name.slice(0, 1) }}
									</span>
								</button>
							</div>
							<span class="text-xs text-muted-foreground">
								{{ t("workspace.participants", { count: participantCount }) }}
							</span>
							<span class="text-muted-foreground/40">/</span>
							<span class="text-xs text-muted-foreground">
								{{ conversation.mode }} · {{ conversation.roundLimit }} rounds
							</span>
						</div>
					</div>

					<div class="flex items-center gap-2">
						<span class="chat-status-pill" :data-status="conversation.status">
							{{ conversation.status }}
						</span>
						<Button
							variant="outline"
							size="sm"
							class="h-8 rounded-md bg-transparent"
							@click="dialogs.openSettings()"
						>
							<Settings2 class="size-3.5" />
							{{ t("workspace.settings") }}
						</Button>
					</div>
				</header>

				<ChatTranscript
					:key="conversation.id"
					:messages="store.activeMessages"
					:agents="store.activeAgents"
					:running="conversation.status === 'running'"
				/>

				<MessageComposer
					:disabled="!participantCount"
					:running="conversation.status === 'running'"
					:participant-count="participantCount"
					:agents="store.activeAgents"
					@send="sendMessage"
					@stop="stopRun"
					@command="handleComposerCommand"
				/>
			</template>

			<div v-else class="chat-empty-stage">
				<div class="empty-stage-grid" aria-hidden="true"></div>
				<div class="relative z-10 flex max-w-md flex-col items-center text-center">
					<div class="empty-stage-icon">
						<Sparkles class="size-5" />
					</div>
					<p class="mt-5 text-lg font-semibold">
						{{ canStartConversation ? t("workspace.noSessions") : t("workspace.noAgents") }}
					</p>
					<p class="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
						{{ canStartConversation ? t("workspace.noSessionsHint") : t("workspace.noAgentsHint") }}
					</p>
					<Button class="mt-5" @click="createSession">
						<Bot v-if="!canStartConversation" class="size-4" />
						<MessageSquarePlus v-else class="size-4" />
						{{ canStartConversation ? t("workspace.newSession") : t("workspace.noAgents") }}
					</Button>
				</div>
			</div>
		</section>

		<RunInspector v-if="conversation" :conversation="conversation" />
		<aside v-else class="run-inspector">
			<div class="inspector-section">
				<div class="empty-inspector">
					<Users class="size-5" />
					<p class="font-medium">{{ t("workspace.inspector") }}</p>
					<p>{{ t("workspace.noSessionsHint") }}</p>
				</div>
			</div>
		</aside>

		<ConfirmDialog
			:open="confirmOpen"
			:title="t('workspace.deleteSession')"
			:description="t('workspace.deleteConfirm')"
			:confirm-label="t('workspace.deleteSession')"
			:cancel-label="t('settings.cancel')"
			destructive
			@confirm="confirmOpen = false; confirmAction?.(); confirmAction = null"
			@cancel="confirmOpen = false; confirmAction = null"
		/>
	</div>
</template>
