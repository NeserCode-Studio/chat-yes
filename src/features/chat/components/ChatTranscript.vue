<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"
import {
	AlertTriangle,
	Check,
	Copy,
	Brain,
	ChevronDown,
	MessagesSquare,
	Sparkles,
} from "@lucide/vue"
import {
	PopoverContent,
	PopoverPortal,
	PopoverRoot,
	PopoverTrigger,
} from "reka-ui"
import type { AgentProfile, ChatMessage } from "../types"
import { useChatI18n } from "../i18n"
import AgentAvatar from "./AgentAvatar.vue"

const props = defineProps<{
	messages: ChatMessage[]
	agents: AgentProfile[]
	running: boolean
}>()

const emit = defineEmits<{
	configure: [agentId?: string]
}>()

const { t } = useChatI18n()
const scrollElement = ref<HTMLElement | null>(null)
const copiedId = ref("")
let copyTimer: ReturnType<typeof setTimeout> | undefined

const lastMessageSignature = computed(() => {
	const last = props.messages[props.messages.length - 1]
	return `${props.messages.length}:${last?.id ?? ""}:${last?.content.length ?? 0}:${last?.reasoning?.length ?? 0}:${last?.status ?? ""}`
})

const duplicateEventIds = computed(() => {
	const ids = new Set<string>()

	for (const event of props.messages) {
		if (event.role !== "event") continue
		const isDuplicate = props.messages.some((message) => {
			if (message.role !== "assistant" || !message.error) return false
			const agentName = agentFor(message)?.name
			return (
				event.content === message.error ||
				event.content === `${agentName}: ${message.error}`
			)
		})
		if (isDuplicate) ids.add(event.id)
	}

	return ids
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

async function copyMessage(message: ChatMessage): Promise<void> {
	if (!message.content || !navigator.clipboard) return
	await navigator.clipboard.writeText(message.content)
	copiedId.value = message.id
	if (copyTimer) clearTimeout(copyTimer)
	copyTimer = setTimeout(() => {
		copiedId.value = ""
	}, 1400)
}

onBeforeUnmount(() => {
	if (copyTimer) clearTimeout(copyTimer)
})
</script>

<template>
	<div ref="scrollElement" class="nextchat-transcript">
		<div class="nextchat-transcript__inner">
			<div v-if="!messages.length" class="nextchat-welcome">
				<div class="nextchat-welcome__logo">
					<MessagesSquare class="size-6" />
				</div>
				<h1 class="nextchat-welcome__title">{{ t("workspace.startTitle") }}</h1>
				<p class="nextchat-welcome__subtitle">{{ t("workspace.startSubtitle") }}</p>

				<div v-if="agents.length" class="nextchat-welcome__cards">
					<button
						v-for="agent in agents.slice(0, 3)"
						:key="agent.id"
						type="button"
						class="nextchat-welcome__card"
						@click="emit('configure', agent.id)"
					>
						<AgentAvatar :agent="agent" size="md" />
						<span class="nextchat-welcome__card-copy">
							<strong class="nextchat-welcome__card-title">{{ agent.name }}</strong>
							<span class="nextchat-welcome__card-meta">
								{{ agent.model || t("workspace.configure") }}
							</span>
						</span>
					</button>
				</div>
				<button
					v-else
					type="button"
					class="nextchat-welcome__card mt-7 w-full max-w-sm"
					@click="emit('configure')"
				>
					<span class="nextchat-welcome__logo size-10 rounded-xl">
						<Sparkles class="size-4" />
					</span>
					<span class="nextchat-welcome__card-copy">
						<strong class="nextchat-welcome__card-title">{{ t("settings.addAgent") }}</strong>
						<span class="nextchat-welcome__card-meta">{{ t("workspace.noAgentsHint") }}</span>
					</span>
				</button>
			</div>

			<template v-else>
				<template v-for="message in messages" :key="message.id">
					<div
						v-if="message.role === 'event' && !duplicateEventIds.has(message.id)"
						class="nextchat-event"
					>
						<PopoverRoot>
							<PopoverTrigger as-child>
								<button
									type="button"
									class="nextchat-event__trigger"
									:title="t('workspace.event')"
								>
									<AlertTriangle class="size-3" />
									<span>{{ t("workspace.event") }}</span>
									<ChevronDown class="size-3" />
								</button>
							</PopoverTrigger>
							<PopoverPortal>
								<PopoverContent
									side="top"
									align="center"
									:side-offset="8"
									class="nextchat-event-popover"
								>
									<p class="nextchat-event-popover__content">
										{{ message.content }}
									</p>
									<time class="nextchat-event-popover__time">
										{{ formatTime(message.createdAt) }}
									</time>
								</PopoverContent>
							</PopoverPortal>
						</PopoverRoot>
					</div>

					<div
						v-else
						class="nextchat-message"
						:class="{ 'is-user': message.role === 'user' }"
					>
						<div
							v-if="message.role === 'user'"
							class="nextchat-message__avatar"
						>
							{{ t("workspace.you").slice(0, 1) }}
						</div>
						<AgentAvatar
							v-else
							class="nextchat-message__avatar"
							:agent="agentFor(message)"
							size="md"
						/>

						<div class="nextchat-message__container">
							<div class="nextchat-message__header">
								<span class="nextchat-message__name">
									{{
										message.role === "user"
											? t("workspace.you")
											: (agentFor(message)?.name ?? "Agent")
									}}
								</span>
								<span
									v-if="message.role === 'assistant'"
									class="nextchat-message__model"
								>
									{{ agentFor(message)?.model || agentFor(message)?.role }}
								</span>
								<span class="nextchat-message__time">{{ formatTime(message.createdAt) }}</span>
							</div>

							<div
								class="nextchat-message__bubble"
								:class="{
									'is-error': message.status === 'error',
									'is-stopped': message.status === 'stopped',
								}"
							>
								<div v-if="message.attachments?.length" class="nextchat-message__images">
									<img
										v-for="attachment in message.attachments"
										:key="attachment.id"
										:src="attachment.dataUrl"
										:alt="attachment.name"
										loading="lazy"
									/>
								</div>
								<details
									v-if="message.reasoning"
									class="nextchat-reasoning"
									:open="message.status === 'streaming' && !message.content"
								>
									<summary>
										<Brain class="size-3.5" />
										<span>{{ t("workspace.thinking") }}</span>
										<ChevronDown class="size-3" />
									</summary>
									<p class="nextchat-reasoning__content">{{ message.reasoning }}</p>
								</details>
								<p v-if="message.content" class="nextchat-message__content">
									<span
										v-for="(part, index) in contentParts(message)"
										:key="`${message.id}-${index}`"
										:class="part.mention ? 'nextchat-mention' : ''"
									>{{ part.text }}</span>
								</p>
								<p v-else-if="message.status === 'streaming'" class="nextchat-typing">
									<span></span><span></span><span></span>
								</p>
								<p v-else class="nextchat-message__empty">
									{{ message.status === "stopped" ? t("workspace.stopped") : t("workspace.emptyResponse") }}
								</p>
								<p v-if="message.error" class="nextchat-message__error">
									{{ message.error }}
								</p>
							</div>

							<div
								v-if="message.role === 'assistant' && message.content"
								class="nextchat-message__actions"
							>
								<button
									type="button"
									class="nextchat-message__action"
									@click="copyMessage(message)"
								>
									<Check v-if="copiedId === message.id" class="size-3" />
									<Copy v-else class="size-3" />
									{{ copiedId === message.id ? t("workspace.copied") : t("workspace.copy") }}
								</button>
							</div>
						</div>
					</div>
				</template>
			</template>
		</div>
	</div>
</template>
