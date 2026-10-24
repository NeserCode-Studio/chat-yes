<script setup lang="ts">
import { computed, nextTick, ref } from "vue"
import {
	ChevronRight,
	MessageSquarePlus,
	MessagesSquare,
	PanelLeftClose,
	PanelLeftOpen,
	Search,
	Settings2,
	Trash2,
} from "@lucide/vue"
import { Input } from "@/components/ui/input"
import { ScrollArea, ScrollAreaInner } from "@/components/ui/scroll-area"
import { useDialogStore } from "@/store"
import { useChatI18n } from "../i18n"
import { useChatStore } from "../store"
import AgentAvatar from "./AgentAvatar.vue"

const props = defineProps<{
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
const searchInput = ref<{ $el?: HTMLInputElement } | null>(null)

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

function openSearch(): void {
	if (!props.collapsed) {
		searchInput.value?.$el?.focus()
		return
	}
	emit("toggle")
	void nextTick(() => {
		requestAnimationFrame(() => searchInput.value?.$el?.focus())
	})
}
</script>

<template>
	<aside id="nextchat-sidebar" class="nextchat-sidebar">
		<header class="nextchat-sidebar__header">
			<div class="nextchat-brand" aria-hidden="true">
				<div class="nextchat-brand__mark" aria-hidden="true">
					<MessagesSquare class="size-[18px]" />
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
				:aria-expanded="!collapsed"
				aria-controls="nextchat-sidebar"
				@click="emit('toggle')"
			>
				<PanelLeftOpen v-if="collapsed" class="size-4" />
				<PanelLeftClose v-else class="size-4" />
			</button>
		</header>

		<div class="nextchat-sidebar__tools">
			<button
				type="button"
				class="nextchat-sidebar__new"
				:title="t('workspace.newSession')"
				:aria-label="t('workspace.newSession')"
				@click="emit('create')"
			>
				<MessageSquarePlus class="size-4 shrink-0" />
				<span>{{ t("workspace.newSession") }}</span>
			</button>

			<div class="nextchat-sidebar__search">
				<Search />
				<Input
					ref="searchInput"
					v-model="query"
					:placeholder="t('workspace.search')"
					class="nextchat-sidebar__search-input text-xs"
				/>
			</div>

			<button
				type="button"
				class="nextchat-sidebar__search-trigger"
				:title="t('workspace.search')"
				:aria-label="t('workspace.search')"
				@click="openSearch"
			>
				<Search class="size-4" />
			</button>
		</div>

		<div class="nextchat-sidebar__section-heading">
			<span>{{ t("workspace.sessions") }}</span>
			<span class="nextchat-sidebar__count">{{ filteredConversations.length }}</span>
		</div>

		<ScrollArea class="nextchat-sidebar__scroll">
			<ScrollAreaInner>
				<div class="nextchat-sidebar__body">
					<div
						v-for="conversation in filteredConversations"
						:key="conversation.id"
						role="button"
						tabindex="0"
						:title="conversation.title"
						:aria-label="conversation.title"
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
									<span>
										{{
											t("workspace.agentCountShort", {
												count: conversation.participantIds.length,
											})
										}}
									</span>
									<span>·</span>
									<span>
										{{
											t("workspace.requestCountShort", {
												count: conversation.usage.requestCount,
											})
										}}
									</span>
								</div>
							</div>
						</div>
						<div class="nextchat-session__actions">
							<button
								type="button"
								class="nextchat-session__action nextchat-session__delete"
								:title="t('workspace.deleteSession')"
								@click.stop="emit('delete', conversation.id)"
							>
								<Trash2 class="size-3.5" />
							</button>
						</div>
					</div>

					<div v-if="!filteredConversations.length" class="nextchat-sidebar__empty">
						<MessagesSquare class="size-5" />
						<strong>{{ t("workspace.noSessions") }}</strong>
						<p>{{ t("workspace.noSessionsHint") }}</p>
					</div>
				</div>
			</ScrollAreaInner>
		</ScrollArea>

		<footer class="nextchat-sidebar__footer">
			<button
				type="button"
				class="nextchat-sidebar__settings"
				:title="t('workspace.settings')"
				@click="dialogs.openSettings('application')"
			>
				<Settings2 class="size-4 shrink-0" />
				<span class="nextchat-sidebar__settings-copy">
					<strong>{{ t("workspace.settings") }}</strong>
					<small>{{ t("workspace.totalAgents", { count: store.agents.length }) }}</small>
				</span>
				<ChevronRight class="nextchat-sidebar__settings-arrow size-3.5" />
			</button>
		</footer>
	</aside>
</template>
