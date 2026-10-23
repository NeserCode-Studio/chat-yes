<script setup lang="ts">
import { computed, ref } from "vue"
import {
	MessageSquarePlus,
	MessagesSquare,
	Search,
	Settings2,
	Trash2,
} from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useDialogStore } from "@/store"
import { useChatStore } from "../store"
import { useChatI18n } from "../i18n"
import AgentAvatar from "./AgentAvatar.vue"

const emit = defineEmits<{
	create: []
	delete: [conversationId: string]
}>()

const store = useChatStore()
const dialogs = useDialogStore()
const { t } = useChatI18n()
const query = ref("")

const filteredConversations = computed(() => {
	const search = query.value.trim().toLowerCase()
	if (!search) return store.conversations
	return store.conversations.filter(
		(conversation) =>
			conversation.title.toLowerCase().includes(search) ||
			conversation.lastMessagePreview.toLowerCase().includes(search)
	)
})

function participantsFor(conversationId: string) {
	const conversation = store.getConversation(conversationId)
	return (conversation?.participantIds ?? [])
		.map((id) => store.getAgent(id))
		.filter((agent) => Boolean(agent))
		.slice(0, 3)
}
</script>

<template>
	<aside class="chat-sidebar">
		<div class="chat-sidebar__brand">
			<div class="chat-mark" aria-hidden="true">
				<span></span><span></span><span></span>
			</div>
			<div class="min-w-0">
				<p class="chat-eyebrow">CHAT YES</p>
				<p class="truncate text-sm font-semibold">{{ t("workspace.sessions") }}</p>
			</div>
			<Button
				variant="ghost"
				size="icon"
				class="ml-auto size-8 rounded-md"
				:title="t('workspace.settings')"
				@click="dialogs.openSettings()"
			>
				<Settings2 class="size-4" />
			</Button>
		</div>

		<div class="px-3">
			<Button class="w-full justify-start" @click="emit('create')">
				<MessageSquarePlus class="size-4" />
				{{ t("workspace.newSession") }}
			</Button>
		</div>

		<div class="relative mt-3 px-3">
			<Search class="pointer-events-none absolute top-1/2 left-6 size-3.5 -translate-y-1/2 text-muted-foreground" />
			<Input
				v-model="query"
				:placeholder="t('workspace.search')"
				class="h-8 rounded-md border-transparent bg-black/5 pl-8 text-xs shadow-none dark:bg-white/5"
			/>
		</div>

		<div class="chat-sidebar__list">
			<div
				v-for="conversation in filteredConversations"
				:key="conversation.id"
				role="button"
				tabindex="0"
				class="conversation-item group"
				:class="{
					'is-active': store.activeConversationId === conversation.id,
				}"
				@click="store.selectConversation(conversation.id)"
				@keydown.enter.prevent="store.selectConversation(conversation.id)"
				@keydown.space.prevent="store.selectConversation(conversation.id)"
			>
				<div class="flex min-w-0 flex-1 items-start gap-2.5">
					<span
						class="mt-1.5 size-1.5 shrink-0 rounded-full"
						:class="{
							'bg-emerald-500': conversation.status === 'idle',
							'bg-teal-500 animate-pulse': conversation.status === 'running',
							'bg-amber-500': conversation.status === 'stopped',
							'bg-red-500': conversation.status === 'error',
						}"
					></span>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">{{ conversation.title }}</p>
						<p class="mt-0.5 truncate text-xs text-muted-foreground">
							{{ conversation.lastMessagePreview || t("workspace.noMessagesHint") }}
						</p>
						<div class="mt-2 flex items-center">
							<div class="flex -space-x-1.5">
								<AgentAvatar
									v-for="agent in participantsFor(conversation.id)"
									:key="agent?.id"
									:agent="agent"
									size="sm"
									class="ring-2 ring-background"
								/>
							</div>
							<span class="ml-auto text-xs tabular-nums text-muted-foreground">
								{{ conversation.usage.requestCount }} req
							</span>
						</div>
					</div>
				</div>
				<Button
					variant="ghost"
					size="icon"
					class="size-7 shrink-0 rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100"
					:title="t('workspace.deleteSession')"
					@click.stop="emit('delete', conversation.id)"
				>
					<Trash2 class="size-3.5" />
				</Button>
			</div>

			<div v-if="!filteredConversations.length" class="empty-sidebar">
				<MessagesSquare class="size-5" />
				<p class="font-medium">{{ t("workspace.noSessions") }}</p>
				<p>{{ t("workspace.noSessionsHint") }}</p>
			</div>
		</div>

		<footer class="chat-sidebar__footer">
			<div class="flex -space-x-1.5">
				<AgentAvatar
					v-for="agent in store.agents.slice(0, 4)"
					:key="agent.id"
					:agent="agent"
					size="sm"
					class="ring-2 ring-background"
				/>
			</div>
			<span class="text-xs text-muted-foreground">
				{{ t("workspace.totalAgents", { count: store.agents.length }) }}
			</span>
			<Button
				variant="ghost"
				size="icon"
				class="ml-auto size-7 rounded-md"
				@click="dialogs.openSettings()"
			>
				<Settings2 class="size-3.5" />
			</Button>
		</footer>
	</aside>
</template>
