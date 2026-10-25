<script setup lang="ts">
import { computed, ref } from "vue"
import { Smile } from "@lucide/vue"
import {
	PopoverContent,
	PopoverPortal,
	PopoverRoot,
	PopoverTrigger,
} from "reka-ui"
import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollAreaInner } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EMOJI_CATEGORIES, type EmojiCategoryId } from "../emoji"
import { useChatI18n } from "../i18n"

const props = withDefaults(
	defineProps<{
		open: boolean
		disabled?: boolean
	}>(),
	{
		disabled: false,
	}
)

const emit = defineEmits<{
	"update:open": [open: boolean]
	select: [emoji: string]
}>()

const { t } = useChatI18n()
const category = ref<EmojiCategoryId>("frequent")
const activeCategory = computed(
	() =>
		EMOJI_CATEGORIES.find((item) => item.id === category.value) ??
		EMOJI_CATEGORIES[0]
)
const activeLabel = computed(() =>
	t.value(`composer.emojiCategory.${activeCategory.value.id}`)
)

function categoryLabel(id: EmojiCategoryId): string {
	return t.value(`composer.emojiCategory.${id}`)
}
</script>

<template>
	<PopoverRoot
		:open="props.open"
		@update:open="emit('update:open', $event)"
	>
		<PopoverTrigger as-child>
			<Button
				variant="ghost"
				class="nextchat-composer__tool"
				:disabled="props.disabled"
				:title="t('composer.emoji')"
				:aria-label="t('composer.emoji')"
			>
				<Smile class="size-4" />
			</Button>
		</PopoverTrigger>
		<PopoverPortal>
			<PopoverContent
				id="composer-emoji-panel"
				side="top"
				align="start"
				:side-offset="8"
				:collision-padding="12"
				class="nextchat-emoji-picker"
				:aria-label="t('composer.emoji')"
			>
				<div class="nextchat-emoji-picker__summary">
					<strong>{{ activeLabel }}</strong>
					<span>{{ activeCategory.emojis.length }}</span>
				</div>
				<Tabs v-model="category" class="nextchat-emoji-picker__categories">
					<TabsList
						class="nextchat-emoji-picker__category-list"
						:aria-label="t('composer.emojiCategories')"
					>
						<TabsTrigger
							v-for="item in EMOJI_CATEGORIES"
							:key="item.id"
							:value="item.id"
							class="nextchat-emoji-picker__category"
							:title="categoryLabel(item.id)"
							:aria-label="categoryLabel(item.id)"
						>
							<span aria-hidden="true">{{ item.emojis[0] }}</span>
						</TabsTrigger>
					</TabsList>
				</Tabs>
				<ScrollArea
					:key="activeCategory.id"
					class="nextchat-emoji-picker__scroll"
				>
					<ScrollAreaInner>
						<div class="nextchat-emoji-picker__grid">
							<Button
								v-for="emoji in activeCategory.emojis"
								:key="emoji"
								variant="ghost"
								size="icon"
								class="nextchat-emoji-picker__item"
								:title="t('composer.insertEmoji', { emoji })"
								:aria-label="t('composer.insertEmoji', { emoji })"
								@mousedown.prevent
								@click="emit('select', emoji)"
							>
								{{ emoji }}
							</Button>
						</div>
					</ScrollAreaInner>
				</ScrollArea>
			</PopoverContent>
		</PopoverPortal>
	</PopoverRoot>
</template>
