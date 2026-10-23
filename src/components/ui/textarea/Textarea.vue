<script setup lang="ts">
import { cn } from "@/lib/utils"
import { useVModel } from "@vueuse/core"
import { ref, type HTMLAttributes } from "vue"

const props = defineProps<{
	modelValue?: string | number
	class?: HTMLAttributes["class"]
}>()

const emits = defineEmits<{
	(event: "update:modelValue", value: string): void
}>()

const modelValue = useVModel(props, "modelValue", emits, {
	passive: true,
})

const root = ref<HTMLTextAreaElement | null>(null)

defineExpose({ root })
</script>

<template>
	<textarea
		ref="root"
		v-model="modelValue"
		:class="
			cn(
				'border-input placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50',
				props.class
			)
		"
	></textarea>
</template>
