<script setup lang="ts">
import { computed } from "vue"
import type { AgentProfile } from "../types"

const props = withDefaults(
	defineProps<{
		agent?: AgentProfile | null
		size?: "sm" | "md" | "lg"
	}>(),
	{
		agent: null,
		size: "md",
	}
)

const initials = computed(() => {
	const name = props.agent?.name.trim() || "?"
	const words = name.split(/\s+/).filter(Boolean)
	return words.length > 1
		? `${words[0][0]}${words[1][0]}`
		: name.slice(0, 2)
})

const sizeClass = computed(() => {
	if (props.size === "sm") return "size-7 text-[0.7rem]"
	if (props.size === "lg") return "size-11 text-sm"
	return "size-9 text-xs"
})
</script>

<template>
	<span
		class="inline-flex shrink-0 items-center justify-center rounded-md font-semibold tracking-wide text-white shadow-sm"
		:class="sizeClass"
		:style="{ backgroundColor: agent?.accent ?? '#64748b' }"
		:title="agent?.name"
	>
		{{ initials }}
	</span>
</template>
