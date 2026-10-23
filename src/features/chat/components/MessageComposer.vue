<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue"
import {
	ArrowUp,
	AtSign,
	ImagePlus,
	Loader2,
	Smile,
	Square,
	SquareSlash,
	X,
} from "@lucide/vue"
import { Textarea } from "@/components/ui/textarea"
import { useAppearanceStore } from "@/store/appearance"
import { createId } from "../ids"
import { useChatI18n } from "../i18n"
import type {
	AgentProfile,
	ChatAttachment,
	ComposerSendPayload,
} from "../types"

type CommandId = "new" | "stop" | "settings" | "clear"

const props = defineProps<{
	disabled: boolean
	running: boolean
	participantCount: number
	agents: AgentProfile[]
}>()

const emit = defineEmits<{
	send: [payload: ComposerSendPayload]
	stop: []
	command: [command: CommandId]
}>()

const { t } = useChatI18n()
const appearance = useAppearanceStore()
const content = ref("")
const images = ref<ChatAttachment[]>([])
const textarea = ref<{ root: HTMLTextAreaElement | null } | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const emojiOpen = ref(false)
const processingImages = ref(false)
const notice = ref("")
const menuIndex = ref(0)
const caret = ref(0)

const MAX_IMAGES = 2
const MAX_FILE_BYTES = 8 * 1024 * 1024
const MAX_DATA_URL_LENGTH = 520_000
const MAX_IMAGE_EDGE = 1200

const emojis = [
	"😀", "😄", "😁", "😂", "🙂", "😉",
	"😍", "🤔", "😅", "😎", "😭", "😤",
	"👍", "👎", "👏", "🙏", "💪", "👌",
	"❤️", "🔥", "✨", "🎉", "✅", "🚀",
]

const commands = computed<Array<{ id: CommandId; label: string; hint: string }>>(
	() => [
		{
			id: "new",
			label: t.value("composer.command.new"),
			hint: t.value("composer.command.newHint"),
		},
		{
			id: "stop",
			label: t.value("composer.command.stop"),
			hint: t.value("composer.command.stopHint"),
		},
		{
			id: "settings",
			label: t.value("composer.command.settings"),
			hint: t.value("composer.command.settingsHint"),
		},
		{
			id: "clear",
			label: t.value("composer.command.clear"),
			hint: t.value("composer.command.clearHint"),
		},
	]
)

const slashQuery = computed(() => {
	const text = content.value.slice(0, caret.value)
	const match = text.match(/^\/([^\s]*)$/)
	return match ? match[1].toLowerCase() : null
})

const mentionQuery = computed(() => {
	const text = content.value.slice(0, caret.value)
	const match = text.match(/(?:^|\s)@([^\s@]*)$/)
	return match ? match[1].toLowerCase() : null
})

const filteredCommands = computed(() => {
	const query = slashQuery.value
	if (query === null) return []
	return commands.value.filter(
		(command) =>
			command.id.includes(query) ||
			command.label.toLowerCase().includes(query)
	)
})

const filteredAgents = computed(() => {
	const query = mentionQuery.value
	if (query === null) return []
	return props.agents.filter((agent) =>
		agent.name.toLowerCase().includes(query)
	)
})

const showCommandMenu = computed(
	() => slashQuery.value !== null && filteredCommands.value.length > 0
)
const showMentionMenu = computed(
	() =>
		!showCommandMenu.value &&
		mentionQuery.value !== null &&
		filteredAgents.value.length > 0
)
const menuItems = computed(() =>
	showCommandMenu.value
		? filteredCommands.value.map((command) => command.id)
		: filteredAgents.value.map((agent) => agent.id)
)
const canSend = computed(
	() =>
		!props.disabled &&
		!props.running &&
		props.participantCount > 0 &&
		(content.value.trim().length > 0 || images.value.length > 0)
)

watch([slashQuery, mentionQuery], () => {
	menuIndex.value = 0
	emojiOpen.value = false
})

function resize(): void {
	const el = textarea.value?.root
	if (!el) return
	el.style.height = "0px"
	el.style.height = `${Math.min(el.scrollHeight, 180)}px`
}

function updateCaret(): void {
	caret.value = textarea.value?.root?.selectionStart ?? content.value.length
}

function focusAt(position: number): void {
	const el = textarea.value?.root
	if (!el) return
	el.focus()
	el.setSelectionRange(position, position)
}

function insertText(text: string): void {
	const el = textarea.value?.root
	const start = el?.selectionStart ?? content.value.length
	const end = el?.selectionEnd ?? content.value.length
	content.value = `${content.value.slice(0, start)}${text}${content.value.slice(end)}`
	const position = start + text.length
	caret.value = position
	void nextTick(() => {
		focusAt(position)
		resize()
	})
}

function selectMention(agent: AgentProfile): void {
	const before = content.value.slice(0, caret.value)
	const after = content.value.slice(caret.value)
	const match = before.match(/(^|\s)@([^\s@]*)$/)
	if (!match) return

	const start = before.length - match[0].length
	const token = `${match[1] ?? ""}@${agent.name}`
	const suffix = /^\s/.test(after) ? after : ` ${after}`
	content.value = `${before.slice(0, start)}${token}${suffix}`
	const position = start + token.length
	caret.value = position
	void nextTick(() => {
		focusAt(position)
		resize()
	})
}

function runCommand(command: CommandId): void {
	content.value = ""
	caret.value = 0
	if (command === "clear") {
		images.value = []
		notice.value = ""
	}
	emit("command", command)
	void nextTick(() => {
		focusAt(0)
		resize()
	})
}

function chooseMenu(index = menuIndex.value): void {
	if (showCommandMenu.value) {
		const command = filteredCommands.value[index]
		if (command) runCommand(command.id)
		return
	}
	if (showMentionMenu.value) {
		const agent = filteredAgents.value[index]
		if (agent) selectMention(agent)
	}
}

function parseMentions(text: string): string[] {
	return props.agents
		.filter((agent) => {
			const escaped = agent.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
			return new RegExp(`@${escaped}(?=\\s|$|[，。,.!?])`).test(text)
		})
		.map((agent) => agent.id)
}

function send(): void {
	if (!canSend.value) return
	const value = content.value.trim()
	emit("send", {
		content: value,
		mentions: parseMentions(value),
		attachments: [...images.value],
	})
	content.value = ""
	images.value = []
	notice.value = ""
	emojiOpen.value = false
	caret.value = 0
	void nextTick(resize)
}

function keydown(event: KeyboardEvent): void {
	if (event.key === "Escape" && emojiOpen.value) {
		emojiOpen.value = false
		return
	}

	if (menuItems.value.length) {
		if (event.key === "ArrowDown") {
			event.preventDefault()
			menuIndex.value = (menuIndex.value + 1) % menuItems.value.length
			return
		}
		if (event.key === "ArrowUp") {
			event.preventDefault()
			menuIndex.value =
				(menuIndex.value - 1 + menuItems.value.length) %
				menuItems.value.length
			return
		}
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault()
			chooseMenu()
			return
		}
		if (event.key === "Tab" && !event.shiftKey) {
			event.preventDefault()
			chooseMenu()
			return
		}
	}

	if (event.key === "Enter") {
		const submit =
			!event.shiftKey &&
			(appearance.submitKey === "enter"
				? !event.ctrlKey && !event.metaKey
				: event.ctrlKey || event.metaKey)
		if (!submit) return
		event.preventDefault()
		send()
	}
}

function readAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(String(reader.result ?? ""))
		reader.onerror = () => reject(reader.error)
		reader.readAsDataURL(file)
	})
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image()
		image.onload = () => resolve(image)
		image.onerror = () => reject(new Error("image load failed"))
		image.src = dataUrl
	})
}

async function imageAttachment(file: File): Promise<ChatAttachment> {
	if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
		throw new Error(t.value("composer.imageUnsupported"))
	}
	if (file.size > MAX_FILE_BYTES) {
		throw new Error(t.value("composer.imageTooLarge"))
	}

	const original = await readAsDataUrl(file)
	if (file.type === "image/gif" && original.length <= MAX_DATA_URL_LENGTH) {
		const image = await loadImage(original)
		return {
			id: createId("image"),
			kind: "image",
			name: file.name || "image.gif",
			mimeType: file.type,
			dataUrl: original,
			width: image.naturalWidth,
			height: image.naturalHeight,
			size: file.size,
		}
	}

	const image = await loadImage(original)
	const scale = Math.min(
		1,
		MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight)
	)
	const width = Math.max(1, Math.round(image.naturalWidth * scale))
	const height = Math.max(1, Math.round(image.naturalHeight * scale))
	const canvas = document.createElement("canvas")
	canvas.width = width
	canvas.height = height
	const context = canvas.getContext("2d")
	if (!context) throw new Error(t.value("composer.imageUnsupported"))
	context.drawImage(image, 0, 0, width, height)

	let dataUrl = canvas.toDataURL("image/webp", 0.78)
	if (dataUrl.length > MAX_DATA_URL_LENGTH) {
		dataUrl = canvas.toDataURL("image/jpeg", 0.64)
	}
	if (dataUrl.length > MAX_DATA_URL_LENGTH) {
		throw new Error(t.value("composer.imageTooLarge"))
	}

	return {
		id: createId("image"),
		kind: "image",
		name: file.name || "image.webp",
		mimeType: dataUrl.slice(5, dataUrl.indexOf(";")),
		dataUrl,
		width,
		height,
		size: Math.round(dataUrl.length * 0.75),
	}
}

async function addFiles(files: File[]): Promise<void> {
	const imageFiles = files.filter((file) => file.type.startsWith("image/"))
	if (!imageFiles.length) return
	notice.value = ""
	const slots = MAX_IMAGES - images.value.length
	if (slots <= 0) {
		notice.value = t.value("composer.imageLimit", { count: MAX_IMAGES })
		return
	}

	processingImages.value = true
	try {
		const accepted = imageFiles.slice(0, slots)
		const next = await Promise.all(accepted.map(imageAttachment))
		images.value = [...images.value, ...next]
		if (imageFiles.length > accepted.length) {
			notice.value = t.value("composer.imageLimit", { count: MAX_IMAGES })
		}
	} catch (error) {
		notice.value =
			error instanceof Error
				? error.message
				: t.value("composer.imageUnsupported")
	} finally {
		processingImages.value = false
	}
}

function selectFiles(event: Event): void {
	const input = event.target as HTMLInputElement
	const files = [...(input.files ?? [])]
	input.value = ""
	void addFiles(files)
}

function paste(event: ClipboardEvent): void {
	const files = [...(event.clipboardData?.files ?? [])].filter((file) =>
		file.type.startsWith("image/")
	)
	if (!files.length) return
	event.preventDefault()
	void addFiles(files)
}

function drop(event: DragEvent): void {
	const files = [...(event.dataTransfer?.files ?? [])]
	if (!files.some((file) => file.type.startsWith("image/"))) return
	event.preventDefault()
	void addFiles(files)
}

function removeImage(id: string): void {
	images.value = images.value.filter((image) => image.id !== id)
}
</script>

<template>
	<div class="nextchat-composer">
		<div class="nextchat-composer__inner">
			<div class="nextchat-composer__toolbar">
				<button
					type="button"
					class="nextchat-composer__tool"
					:title="t('composer.commands')"
					@click="insertText('/')"
				>
					<SquareSlash class="size-3.5" />
					<span>{{ t("composer.commands") }}</span>
				</button>
				<button
					type="button"
					class="nextchat-composer__tool"
					:title="t('composer.mention')"
					@click="insertText('@')"
				>
					<AtSign class="size-3.5" />
					<span>{{ t("composer.mention") }}</span>
				</button>
				<button
					type="button"
					class="nextchat-composer__tool"
					:title="t('composer.attachImage')"
					:disabled="processingImages || images.length >= MAX_IMAGES"
					@click="fileInput?.click()"
				>
					<Loader2 v-if="processingImages" class="size-3.5 animate-spin" />
					<ImagePlus v-else class="size-3.5" />
					<span>{{ t("composer.attachImage") }}</span>
				</button>
				<button
					type="button"
					class="nextchat-composer__tool"
					:title="t('composer.emoji')"
					:aria-expanded="emojiOpen"
					aria-controls="composer-emoji-panel"
					@click="emojiOpen = !emojiOpen"
				>
					<Smile class="size-3.5" />
					<span>{{ t("composer.emoji") }}</span>
				</button>
			</div>

		<div
			class="nextchat-composer__frame"
			:class="{ 'is-disabled': disabled }"
			@dragover.prevent
			@drop="drop"
		>
			<div v-if="images.length" class="nextchat-composer__attachments">
				<div
					v-for="image in images"
					:key="image.id"
					class="nextchat-composer__attachment"
				>
					<img :src="image.dataUrl" :alt="image.name" />
					<button
						type="button"
						class="nextchat-composer__attachment-remove"
						:title="t('composer.removeImage')"
						@click="removeImage(image.id)"
					>
						<X class="size-3" />
					</button>
				</div>
			</div>

			<div v-if="showCommandMenu || showMentionMenu" class="nextchat-composer__menu">
				<button
					v-for="(command, index) in showCommandMenu ? filteredCommands : []"
					:key="command.id"
					type="button"
					class="nextchat-composer__menu-item"
					:class="{ 'is-active': index === menuIndex }"
					@mousedown.prevent
					@click="runCommand(command.id)"
				>
					<span class="nextchat-composer__menu-key">/{{ command.id }}</span>
					<span class="nextchat-composer__menu-copy">
						<strong>{{ command.label }}</strong>
						<span>{{ command.hint }}</span>
					</span>
				</button>
				<button
					v-for="(agent, index) in showMentionMenu ? filteredAgents : []"
					:key="agent.id"
					type="button"
					class="nextchat-composer__menu-item"
					:class="{ 'is-active': index === menuIndex }"
					@mousedown.prevent
					@click="selectMention(agent)"
				>
					<span
						class="flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white"
						:style="{ backgroundColor: agent.accent }"
					>
						{{ agent.name.slice(0, 1) }}
					</span>
					<span class="nextchat-composer__menu-copy">
						<strong>{{ agent.name }}</strong>
						<span>{{ agent.role }} · {{ agent.model || t("settings.connectionIncomplete") }}</span>
					</span>
				</button>
			</div>

			<div
				v-if="emojiOpen"
				id="composer-emoji-panel"
				class="nextchat-composer__emoji"
				role="dialog"
				:aria-label="t('composer.emoji')"
			>
				<button
					v-for="emoji in emojis"
					:key="emoji"
					type="button"
					@mousedown.prevent
					@click="insertText(emoji)"
				>
					{{ emoji }}
				</button>
			</div>

			<Textarea
				ref="textarea"
				v-model="content"
				rows="1"
				:placeholder="t('workspace.placeholder')"
				:disabled="disabled || running"
				class="nextchat-composer__input"
				@input="resize"
				@click="updateCaret"
				@focus="updateCaret"
				@keyup="updateCaret"
				@keydown="keydown"
				@paste="paste"
			/>

			<p v-if="notice" class="nextchat-composer__notice">
				{{ notice }}
			</p>

			<button
				v-if="running"
				type="button"
				class="nextchat-composer__send is-stop"
				:title="t('workspace.stop')"
				@click="emit('stop')"
			>
				<Square class="size-3.5 fill-current" />
			</button>
			<button
				v-else
				type="button"
				class="nextchat-composer__send"
				:title="t('workspace.send')"
				:disabled="!canSend"
				@click="send"
			>
				<ArrowUp class="size-4" />
			</button>
		</div>

			<div class="nextchat-composer__hint">
				<span>
					{{ appearance.submitKey === "enter" ? t("workspace.hint") : t("workspace.hintCtrl") }}
				</span>
				<span>{{ t("workspace.participants", { count: participantCount }) }}</span>
			</div>

			<input
				ref="fileInput"
				type="file"
				accept="image/png,image/jpeg,image/webp,image/gif"
				multiple
				class="hidden"
				@change="selectFiles"
			/>
		</div>
	</div>
</template>
