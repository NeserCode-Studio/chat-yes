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
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
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
const content = ref("")
const images = ref<ChatAttachment[]>([])
const textarea = ref<{ root: HTMLTextAreaElement | null } | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const emojiOpen = ref(false)
const processingImages = ref(false)
const notice = ref("")
const menuIndex = ref(0)

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
	const match = content.value.match(/^\/([^\s]*)$/)
	return match ? match[1].toLowerCase() : null
})

const mentionQuery = computed(() => {
	const match = content.value.match(/(?:^|\s)@([^\s@]*)$/)
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
	void nextTick(() => {
		focusAt(position)
		resize()
	})
}

function selectMention(agent: AgentProfile): void {
	content.value = content.value.replace(
		/(^|\s)@[^\s@]*$/,
		`$1@${agent.name} `
	)
	const position = content.value.length
	void nextTick(() => {
		focusAt(position)
		resize()
	})
}

function runCommand(command: CommandId): void {
	content.value = ""
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
	}

	if (event.key === "Enter" && !event.shiftKey) {
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
	<div class="composer-shell">
		<div
			class="composer-box relative"
			:class="{ 'is-disabled': disabled }"
			@dragover.prevent
			@drop="drop"
		>
			<div v-if="images.length" class="composer-attachments">
				<div v-for="image in images" :key="image.id" class="composer-attachment">
					<img :src="image.dataUrl" :alt="image.name" />
					<Button
						variant="secondary"
						size="icon"
						class="absolute -top-1.5 -right-1.5 size-5 rounded-full"
						:title="t('composer.removeImage')"
						@click="removeImage(image.id)"
					>
						<X class="size-3" />
					</Button>
				</div>
			</div>

			<div v-if="showCommandMenu || showMentionMenu" class="composer-menu">
				<Button
					v-for="(command, index) in showCommandMenu ? filteredCommands : []"
					:key="command.id"
					variant="ghost"
					class="h-auto w-full justify-start px-2.5 py-2 text-left"
					:class="index === menuIndex ? 'bg-accent text-accent-foreground' : ''"
					@mousedown.prevent
					@click="runCommand(command.id)"
				>
					<span class="w-20 shrink-0 font-mono text-xs font-semibold">/{{ command.id }}</span>
					<span class="min-w-0 flex-1">
						<span class="block text-xs font-medium">{{ command.label }}</span>
						<span class="block text-xs font-normal text-muted-foreground">{{ command.hint }}</span>
					</span>
				</Button>
				<Button
					v-for="(agent, index) in showMentionMenu ? filteredAgents : []"
					:key="agent.id"
					variant="ghost"
					class="h-auto w-full justify-start px-2.5 py-2 text-left"
					:class="index === menuIndex ? 'bg-accent text-accent-foreground' : ''"
					@mousedown.prevent
					@click="selectMention(agent)"
				>
					<span
						class="flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white"
						:style="{ backgroundColor: agent.accent }"
					>
						{{ agent.name.slice(0, 1) }}
					</span>
					<span class="min-w-0 flex-1 truncate text-sm">{{ agent.name }}</span>
					<span class="text-xs text-muted-foreground">{{ agent.role }}</span>
				</Button>
			</div>

			<div v-if="emojiOpen" class="composer-emoji-panel">
				<Button
					v-for="emoji in emojis"
					:key="emoji"
					variant="ghost"
					size="icon"
					class="size-8 text-lg"
					@mousedown.prevent
					@click="insertText(emoji)"
				>
					{{ emoji }}
				</Button>
			</div>

			<Textarea
				ref="textarea"
				v-model="content"
				rows="1"
				:placeholder="t('workspace.placeholder')"
				:disabled="disabled || running"
				class="composer-input min-h-0"
				@input="resize"
				@keydown="keydown"
				@paste="paste"
			/>

			<p v-if="notice" class="px-1 pb-1 text-xs text-amber-700 dark:text-amber-400">
				{{ notice }}
			</p>

			<div class="composer-actions">
				<div class="flex items-center gap-0.5">
					<Button
						variant="ghost"
						size="icon"
						class="size-8"
						:title="t('composer.commands')"
						@click="insertText('/')"
					>
						<SquareSlash class="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						class="size-8"
						:title="t('composer.mention')"
						@click="insertText('@')"
					>
						<AtSign class="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						class="size-8"
						:title="t('composer.attachImage')"
						:disabled="processingImages || images.length >= MAX_IMAGES"
						@click="fileInput?.click()"
					>
						<Loader2 v-if="processingImages" class="size-4 animate-spin" />
						<ImagePlus v-else class="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						class="size-8"
						:title="t('composer.emoji')"
						@click="emojiOpen = !emojiOpen"
					>
						<Smile class="size-4" />
					</Button>
				</div>

				<div class="flex items-center gap-2">
					<span class="hidden text-xs text-muted-foreground sm:inline">
						{{ t("workspace.hint") }}
					</span>
					<Button
						v-if="running"
						variant="destructive"
						size="sm"
						class="h-8 rounded-md px-3"
						@click="emit('stop')"
					>
						<Square class="size-3 fill-current" />
						{{ t("workspace.stop") }}
					</Button>
					<Button
						v-else
						size="sm"
						class="h-8 rounded-md px-3"
						:disabled="!canSend"
						@click="send"
					>
						{{ t("workspace.send") }}
						<ArrowUp class="size-4" />
					</Button>
				</div>
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
