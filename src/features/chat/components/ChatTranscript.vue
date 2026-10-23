<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
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
import { ScrollArea, ScrollAreaInner } from "@/components/ui/scroll-area"
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
const transcriptScroll = ref<{
	scrollToBottom: () => void
} | null>(null)
const copiedId = ref("")
const reasoningOpenStates = ref<Record<string, boolean>>({})
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

const eventGroupsById = computed(() => {
	const groups = new Map<string, ChatMessage[]>()
	let group: ChatMessage[] | null = null

	for (const message of props.messages) {
		if (!isEventMessage(message)) {
			group = null
			continue
		}
		if (duplicateEventIds.value.has(message.id)) continue

		if (!group) {
			group = []
			groups.set(message.id, group)
		}
		group.push(message)
	}

	return groups
})

const eventGroupStartIds = computed(
	() => new Set(eventGroupsById.value.keys())
)

function scrollToBottom(): void {
	void nextTick(() => {
		transcriptScroll.value?.scrollToBottom()
		requestAnimationFrame(() => {
			transcriptScroll.value?.scrollToBottom()
		})
	})
}

onMounted(scrollToBottom)

watch(lastMessageSignature, scrollToBottom, { flush: "post" })

function agentFor(message: ChatMessage): AgentProfile | undefined {
	return props.agents.find((agent) => agent.id === message.agentId)
}

function formatTime(timestamp: number): string {
	return new Intl.DateTimeFormat(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	}).format(timestamp)
}

function isEventMessage(message: ChatMessage): boolean {
	if (message.role === "event") return true
	if (message.role !== "assistant") return false

	return (
		message.status === "error" ||
		(message.status !== "streaming" &&
			!message.content &&
			!message.reasoning)
	)
}

function reasoningOpen(message: ChatMessage): boolean {
	return (
		reasoningOpenStates.value[message.id] ??
		(message.status === "streaming" && !message.content)
	)
}

function setReasoningOpen(id: string, open: boolean): void {
	reasoningOpenStates.value = {
		...reasoningOpenStates.value,
		[id]: open,
	}
}

function eventGroupFor(message: ChatMessage): ChatMessage[] {
	return eventGroupsById.value.get(message.id) ?? []
}

function eventLabel(messages: ChatMessage[]): string {
	if (messages.length <= 1) return t.value("workspace.event")
	return t.value("workspace.eventsMore", { count: messages.length - 1 })
}

function eventContent(message: ChatMessage): string {
	if (message.role === "event") return message.content

	const name = agentFor(message)?.name ?? "Agent"
	if (message.error) return `${name}: ${message.error}`
	if (message.status === "stopped") {
		return `${name}: ${t.value("workspace.stopped")}`
	}
	return `${name}: ${t.value("workspace.emptyResponse")}`
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
	<ScrollArea class="nextchat-transcript">
		<ScrollAreaInner ref="transcriptScroll">
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
						v-if="eventGroupStartIds.has(message.id)"
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
									<span>{{ eventLabel(eventGroupFor(message)) }}</span>
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
									<div
										v-for="event in eventGroupFor(message)"
										:key="event.id"
										class="nextchat-event-popover__item"
									>
										<p class="nextchat-event-popover__content">
											{{ eventContent(event) }}
										</p>
										<time class="nextchat-event-popover__time">
											{{ formatTime(event.createdAt) }}
										</time>
									</div>
								</PopoverContent>
							</PopoverPortal>
						</PopoverRoot>
					</div>

					<div
						v-else-if="!isEventMessage(message)"
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
								<div
									v-if="message.reasoning"
									class="nextchat-reasoning"
									:class="{ 'is-open': reasoningOpen(message) }"
								>
									<button
										type="button"
										class="nextchat-reasoning__summary"
										:aria-expanded="reasoningOpen(message)"
										@click="setReasoningOpen(message.id, !reasoningOpen(message))"
									>
										<Brain class="size-3.5" />
										<span>{{ t("workspace.thinking") }}</span>
										<ChevronDown class="size-3" />
									</button>
									<p v-if="reasoningOpen(message)" class="nextchat-reasoning__content">
										{{ message.reasoning }}
									</p>
									<p v-else class="nextchat-reasoning__preview line-clamp-4">
										{{ message.reasoning }}
									</p>
								</div>
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
		</ScrollAreaInner>
	</ScrollArea>
</template>
