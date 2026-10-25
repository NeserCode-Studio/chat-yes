<script setup lang="ts">
import { computed } from "vue"
import { TooltipContent, type TooltipContentProps } from "reka-ui"
import { cn } from "@/lib/utils"

const props = withDefaults(defineProps<Omit<TooltipContentProps, 'class'> & { class?: string, sideOffset?: number }>(), {
  sideOffset: 4,
})

const contentProps = computed(() => {
  const { class: _class, sideOffset, ...rest } = props
  return { ...rest, sideOffset }
})
</script>

<template>
  <TooltipContent
    v-bind="{ ...contentProps, ...$attrs }"
    :class="cn('bg-primary text-primary-foreground animate-in fade-in-0 zoom-in-95 z-50 overflow-hidden rounded-md border px-3 py-1.5 text-xs', props.class)"
  >
    <slot />
  </TooltipContent>
</template>
