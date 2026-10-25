<script setup lang="ts">
import { computed } from "vue"
import { renderMarkdown } from "../markdown"

const props = defineProps<{
	content: string
	mentionNames?: string[]
}>()

const html = computed(() =>
	renderMarkdown(props.content, {
		mentionNames: props.mentionNames,
	})
)
</script>

<template>
	<div class="nextchat-markdown" v-html="html"></div>
</template>
