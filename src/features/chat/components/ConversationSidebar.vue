<script setup lang="ts">
import { computed, ref } from "vue"
import {
	Bot,
	MessageSquarePlus,
	MessagesSquare,
	PanelLeftClose,
	PanelLeftOpen,
	Search,
	Trash2,
} from "@lucide/vue"
import { Input } from "@/components/ui/input"
import { useDialogStore } from "@/store"
import { useChatStore } from "../store"
import { useChatI18n } from "../i18n"
import AgentAvatar from "./AgentAvatar.vue"

defineProps<{
	collapsed: boolean
}>()

const emit = defineEmits<{
	create: []
	delete: [conversationId: string]
	toggle: []
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
	<aside class="nextchat-sidebar">
		<header class="nextchat-sidebar__header">
			<div class="nextchat-brand">
				<div class="nextchat-brand__mark" aria-hidden="true">
					<MessagesSquare class="size-5" />
				</div>
				<div class="nextchat-brand__copy">
					<p class="nextchat-brand__title">Chat Yes</p>
					<p class="nextchat-brand__subtitle">{{ t("workspace.brandSubtitle") }}</p>
				</div>
			</div>
			<button
				type="button"
				class="nextchat-collapse"
				:title="collapsed ? t('workspace.expandSidebar') : t('workspace.collapseSidebar')"
				@click="emit('toggle')"
			>
				<PanelLeftOpen v-if="collapsed" class="size-4" />
				<PanelLeftClose v-else class="size-4" />
			</button>
		</header>

		<div class="nextchat-sidebar__tools">
			<button type="button" class="nextchat-sidebar__new" @click="emit('create')">
				<MessageSquarePlus class="size-4 shrink-0" />
				<span>{{ t("workspace.newSession") }}</span>
			</button>

			<div class="nextchat-sidebar__search">
				<Search />
				<Input
					v-model="query"
					:placeholder="t('workspace.search')"
					class="nextchat-sidebar__search-input text-xs"
				/>
			</div>
		</div>

		<div class="nextchat-sidebar__body">
			<div
				v-for="conversation in filteredConversations"
				:key="conversation.id"
				role="button"
				tabindex="0"
				class="nextchat-session"
				:class="{
					'is-active': store.activeConversationId === conversation.id,
				}"
				@click="store.selectConversation(conversation.id)"
				@keydown.enter.prevent="store.selectConversation(conversation.id)"
				@keydown.space.prevent="store.selectConversation(conversation.id)"
			>
				<div class="nextchat-session__content">
					<div class="nextchat-session__avatars">
						<AgentAvatar
							v-for="agent in participantsFor(conversation.id)"
							:key="agent?.id"
							:agent="agent"
							size="sm"
						/>
					</div>
					<div class="nextchat-session__copy">
						<p class="nextchat-session__title">{{ conversation.title }}</p>
						<p class="nextchat-session__preview">
							{{ conversation.lastMessagePreview || t("workspace.noMessagesHint") }}
						</p>
						<div class="nextchat-session__meta">
							<span
								class="nextchat-session__status"
								:data-status="conversation.status"
							></span>
							<span>{{ conversation.usage.requestCount }} req</span>
							<span>·</span>
							<span>{{ conversation.participantIds.length }} agents</span>
						</div>
					</div>
				</div>
				<button
					type="button"
					class="nextchat-session__delete inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"
					:title="t('workspace.deleteSession')"
					@click.stop="emit('delete', conversation.id)"
				>
					<Trash2 class="size-3.5" />
				</button>
			</div>

			<div v-if="!filteredConversations.length" class="nextchat-sidebar__empty">
				<MessagesSquare class="size-5" />
				<strong>{{ t("workspace.noSessions") }}</strong>
				<p>{{ t("workspace.noSessionsHint") }}</p>
			</div>
		</div>

		<footer class="nextchat-sidebar__footer">
			<button
				type="button"
				class="nextchat-sidebar__agents"
				:title="t('workspace.settings')"
				@click="dialogs.openSettings()"
			>
				<div class="nextchat-session__avatars">
					<AgentAvatar
						v-for="agent in store.agents.slice(0, 4)"
						:key="agent.id"
						:agent="agent"
						size="sm"
					/>
				</div>
				<span class="text-xs text-muted-foreground">
					{{ t("workspace.totalAgents", { count: store.agents.length }) }}
				</span>
				<Bot class="size-4" />
			</button>
		</footer>
	</aside>
</template>
