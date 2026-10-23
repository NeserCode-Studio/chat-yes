<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue"
import { AlertTriangle, MessageSquareText } from "@lucide/vue"
import type { AgentProfile, ChatMessage } from "../types"
import { useChatI18n } from "../i18n"
import AgentAvatar from "./AgentAvatar.vue"

const props = defineProps<{
	messages: ChatMessage[]
	agents: AgentProfile[]
	running: boolean
}>()

const { t } = useChatI18n()
const scrollElement = ref<HTMLElement | null>(null)

const lastMessageSignature = computed(() => {
	const last = props.messages[props.messages.length - 1]
	return `${props.messages.length}:${last?.id ?? ""}:${last?.content.length ?? 0}:${last?.status ?? ""}`
})

watch(
	lastMessageSignature,
	async () => {
		await nextTick()
		const element = scrollElement.value
		if (element) element.scrollTop = element.scrollHeight
	}
)

function agentFor(message: ChatMessage): AgentProfile | undefined {
	return props.agents.find((agent) => agent.id === message.agentId)
}

function formatTime(timestamp: number): string {
	return new Intl.DateTimeFormat(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	}).format(timestamp)
}

function contentParts(message: ChatMessage): Array<{
	text: string
	mention: boolean
}> {
	const names = props.agents
		.map((agent) => agent.name)
		.filter(Boolean)
		.sort((left, right) => right.length - left.length)
	if (!names.length || !message.content) {
		return [{ text: message.content, mention: false }]
	}
	const escaped = names.map((name) =>
		name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	)
	const pattern = new RegExp(`(@(?:${escaped.join("|")}))`, "g")
	const mentions = new Set(names.map((name) => `@${name}`))
	return message.content
		.split(pattern)
		.filter(Boolean)
		.map((text) => ({ text, mention: mentions.has(text) }))
}
</script>

<template>
	<div ref="scrollElement" class="chat-transcript">
		<div v-if="!messages.length" class="transcript-empty">
			<div class="empty-signal" aria-hidden="true">
				<span></span><span></span><span></span>
			</div>
			<MessageSquareText class="size-5 text-muted-foreground" />
			<p class="text-sm font-semibold">{{ t("workspace.noMessages") }}</p>
			<p class="max-w-sm text-center text-xs leading-5 text-muted-foreground">
				{{ t("workspace.noMessagesHint") }}
			</p>
		</div>

		<div v-else class="transcript-stack">
			<template v-for="message in messages" :key="message.id">
				<div v-if="message.role === 'event'" class="event-row">
					<span class="event-line"></span>
					<span class="inline-flex items-center gap-1.5">
						<AlertTriangle class="size-3" />
						{{ message.content }}
					</span>
					<span class="event-line"></span>
				</div>

				<div
					v-else
					class="message-row"
					:class="{ 'is-user': message.role === 'user' }"
				>
					<AgentAvatar
						v-if="message.role === 'assistant'"
						:agent="agentFor(message)"
						size="md"
					/>
					<div v-else class="user-avatar">Y</div>

					<div class="message-column">
						<div class="message-meta">
							<span class="font-semibold">
								{{
									message.role === "user"
										? t("workspace.you")
										: (agentFor(message)?.name ?? "Agent")
								}}
							</span>
							<span v-if="agentFor(message)?.role" class="agent-role">
								{{ agentFor(message)?.role }}
							</span>
							<span class="tabular-nums">{{ formatTime(message.createdAt) }}</span>
							<span v-if="message.status === 'streaming'" class="stream-indicator">
								<span></span><span></span><span></span>
							</span>
						</div>

						<div
							class="message-bubble"
							:class="{
								'is-user': message.role === 'user',
								'is-error': message.status === 'error',
								'is-stopped': message.status === 'stopped',
							}"
						>
							<div v-if="message.attachments?.length" class="message-images">
								<img
									v-for="attachment in message.attachments"
									:key="attachment.id"
									:src="attachment.dataUrl"
									:alt="attachment.name"
									loading="lazy"
								/>
							</div>
							<p v-if="message.content" class="message-content">
								<span
									v-for="(part, index) in contentParts(message)"
									:key="`${message.id}-${index}`"
									:class="part.mention ? 'message-mention' : ''"
								>{{ part.text }}</span>
							</p>
							<p v-else-if="message.status === 'streaming'" class="thinking-copy">
								{{ t("workspace.round", { current: 1 }) }}
							</p>
							<p v-if="message.error" class="mt-2 text-xs text-red-600 dark:text-red-400">
								{{ message.error }}
							</p>
						</div>
					</div>
				</div>
			</template>
		</div>
	</div>
</template>
