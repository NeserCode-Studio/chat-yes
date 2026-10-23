<script setup lang="ts">
import {
	SliderRange,
	SliderRoot,
	SliderThumb,
	SliderTrack,
} from "reka-ui"
import { cn } from "@/lib/utils"
import type { HTMLAttributes } from "vue"

const props = withDefaults(
	defineProps<{
		modelValue: number
		min?: number
		max?: number
		step?: number
		disabled?: boolean
		class?: HTMLAttributes["class"]
	}>(),
	{
		min: 0,
		max: 100,
		step: 1,
		disabled: false,
	}
)

const emits = defineEmits<{
	(event: "update:modelValue", value: number): void
}>()
</script>

<template>
	<SliderRoot
		:model-value="[props.modelValue]"
		:min="props.min"
		:max="props.max"
		:step="props.step"
		:disabled="props.disabled"
		:class="
			cn(
				'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50',
				props.class
			)
		"
		@update:model-value="emits('update:modelValue', Number($event?.[0] ?? props.modelValue))"
	>
		<SliderTrack class="bg-muted relative h-1 w-full grow rounded-full">
			<SliderRange class="bg-primary absolute h-full rounded-full" />
		</SliderTrack>
		<SliderThumb
			class="border-primary/70 bg-background ring-ring block size-4 rounded-full border shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
		/>
	</SliderRoot>
</template>
