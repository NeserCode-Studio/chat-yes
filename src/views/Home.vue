<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useLocalStorage } from "@vueuse/core"
import {
	Bot,
	MessageSquarePlus,
	PanelRight,
	Settings2,
	Sparkles,
} from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea, ScrollAreaInner } from "@/components/ui/scroll-area"
import { useToast } from "@/composables/useToast"
import { useDialogStore } from "@/store"
import ChatTranscript from "@/features/chat/components/ChatTranscript.vue"
import ConversationSidebar from "@/features/chat/components/ConversationSidebar.vue"
import ConfirmDialog from "@/features/chat/components/ConfirmDialog.vue"
import MessageComposer from "@/features/chat/components/MessageComposer.vue"
import RunInspector from "@/features/chat/components/RunInspector.vue"
import { useChatI18n } from "@/features/chat/i18n"
import { createId } from "@/features/chat/ids"
import {
	createConversationExport,
	saveConversationExport,
} from "@/features/chat/export"
import { runConversation } from "@/features/chat/orchestrator"
import { useChatStore } from "@/features/chat/store"
import type { ComposerSendPayload } from "@/features/chat/types"

const store = useChatStore()
const dialogs = useDialogStore()
const { t } = useChatI18n()
const { error: toastError, info, success, warning } = useToast({
	duration: 2800,
})
const activeRun = ref<AbortController | null>(null)
const titleDraft = ref("")
const confirmOpen = ref(false)
const confirmAction = ref<(() => void) | null>(null)
const inspectorOpen = ref(false)
const sidebarCollapsed = useLocalStorage(
	"chat-yes.sidebar-collapsed.v1",
	false
)

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
	window.addEventListener("keydown", handleWindowKeydown)
})

onBeforeUnmount(() => {
	activeRun.value?.abort()
	window.removeEventListener("keydown", handleWindowKeydown)
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
			inspectorOpen.value = false
		}
		store.deleteConversation(conversationId)
	}
	confirmOpen.value = true
}

async function exportSession(conversationId: string): Promise<void> {
	const current = store.getConversation(conversationId)
	if (!current) return

	try {
		const exportData = createConversationExport({
			conversation: current,
			agents: store.agents,
			messages: store.getMessages(conversationId),
		})
		const result = await saveConversationExport(current, exportData)
		if (result === "saved") {
			success(t.value("workspace.exported"))
		} else if (result === "downloaded") {
			info(t.value("workspace.exportedToDownloads"))
		}
	} catch {
		toastError(t.value("workspace.exportFailed"))
	}
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

	for (const message of store.getMessages(current.id)) {
		if (message.role === "assistant" && message.status === "streaming") {
			store.patchMessage(current.id, message.id, { status: "stopped" })
		}
	}
	store.persistMessages(current.id)
	store.setConversationStatus(current.id, "stopped")
}

function handleComposerCommand(command: "new" | "stop" | "settings" | "clear"): void {
	if (command === "new") createSession()
	else if (command === "stop") stopRun()
	else if (command === "settings") dialogs.openSettings()
}

function configureAgent(agentId?: string): void {
	if (agentId) store.selectedAgentId = agentId
	inspectorOpen.value = false
	dialogs.openSettings()
}

function handleWindowKeydown(event: KeyboardEvent): void {
	if (event.key === "Escape" && inspectorOpen.value) {
		inspectorOpen.value = false
	}
}
</script>

<template>
	<div
		class="nextchat-shell"
		:class="{ 'is-sidebar-collapsed': sidebarCollapsed }"
	>
		<ConversationSidebar
			:collapsed="sidebarCollapsed"
			@create="createSession"
			@delete="deleteSession"
			@export="exportSession"
			@toggle="sidebarCollapsed = !sidebarCollapsed"
		/>

		<section class="nextchat-main">
			<template v-if="conversation">
				<header class="nextchat-header">
					<div class="nextchat-header__title">
						<p class="nextchat-header__eyebrow">{{ t("workspace.brandSubtitle") }}</p>
						<Input
							v-model="titleDraft"
							class="nextchat-header__name"
							@blur="renameSession"
							@keydown.enter="renameSession"
						/>
						<div class="nextchat-header__subtitle">
							<span>{{ t("workspace.messageCount", { count: store.activeMessages.length }) }}</span>
							<span>·</span>
							<span>{{ t("workspace.participants", { count: participantCount }) }}</span>
							<span class="nextchat-header__status" :data-status="conversation.status">
								<span
									class="size-1.5 rounded-full"
									:class="conversation.status === 'running' ? 'bg-primary animate-pulse' : 'bg-muted-foreground/50'"
								></span>
								{{ conversation.status }}
							</span>
						</div>
					</div>

					<div class="nextchat-header__actions">
						<button
							type="button"
							class="nextchat-icon-button"
							:title="t('workspace.newSession')"
							@click="createSession"
						>
							<MessageSquarePlus class="size-4" />
						</button>
						<button
							type="button"
							class="nextchat-icon-button"
							:title="t('workspace.settings')"
							@click="dialogs.openSettings()"
						>
							<Settings2 class="size-4" />
						</button>
						<button
							type="button"
							class="nextchat-icon-button"
							:class="{ 'is-active': inspectorOpen }"
							:title="t('workspace.inspector')"
							@click="inspectorOpen = !inspectorOpen"
						>
							<PanelRight class="size-4" />
						</button>
					</div>
				</header>

				<ChatTranscript
					:key="conversation.id"
					:messages="store.activeMessages"
					:agents="store.activeAgents"
					:running="conversation.status === 'running'"
					@configure="configureAgent"
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

			<template v-else>
				<header class="nextchat-header">
					<div class="nextchat-header__title">
						<p class="nextchat-header__eyebrow">{{ t("workspace.brandSubtitle") }}</p>
						<p class="nextchat-header__name flex items-center">Chat Yes</p>
						<p class="nextchat-header__subtitle">{{ t("workspace.noSessionsHint") }}</p>
					</div>
					<div class="nextchat-header__actions">
						<button
							type="button"
							class="nextchat-icon-button"
							:title="t('workspace.settings')"
							@click="dialogs.openSettings()"
						>
							<Settings2 class="size-4" />
						</button>
					</div>
				</header>

				<ScrollArea class="nextchat-transcript">
					<ScrollAreaInner>
						<div class="nextchat-welcome">
							<div class="nextchat-welcome__logo">
								<Sparkles class="size-5" />
							</div>
							<h1 class="nextchat-welcome__title">
								{{ canStartConversation ? t("workspace.noSessions") : t("workspace.noAgents") }}
							</h1>
							<p class="nextchat-welcome__subtitle">
								{{ canStartConversation ? t("workspace.noSessionsHint") : t("workspace.noAgentsHint") }}
							</p>
							<Button class="mt-5 rounded-[10px]" @click="createSession">
								<Bot v-if="!canStartConversation" class="size-4" />
								<MessageSquarePlus v-else class="size-4" />
								{{ canStartConversation ? t("workspace.newSession") : t("workspace.noAgents") }}
							</Button>
						</div>
					</ScrollAreaInner>
				</ScrollArea>
			</template>
		</section>

		<Transition name="nextchat-drawer">
			<div v-if="conversation && inspectorOpen" class="nextchat-inspector-layer">
				<button
					type="button"
					class="nextchat-inspector-backdrop"
					:aria-label="t('workspace.closeInspector')"
					@click="inspectorOpen = false"
				></button>
				<div class="nextchat-inspector-drawer">
					<RunInspector
						:conversation="conversation"
						@close="inspectorOpen = false"
					/>
				</div>
			</div>
		</Transition>

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
