<script setup lang="ts">
import { ref, unref } from "vue"
import { ScrollAreaViewport, ScrollAreaScrollbar, ScrollAreaThumb } from "reka-ui"

const viewport = ref<InstanceType<typeof ScrollAreaViewport> | null>(null)

function scrollToBottom(): void {
  const element = unref(viewport.value?.viewportElement)
  if (!element) return
  element.scrollTop = element.scrollHeight
}

function scrollToElement(target: HTMLElement | null): void {
  const element = unref(viewport.value?.viewportElement)
  if (!element || !target) return
  const top =
    target.getBoundingClientRect().top -
    element.getBoundingClientRect().top +
    element.scrollTop -
    12
  element.scrollTo({ top: Math.max(0, top), behavior: "smooth" })
}

defineExpose({ scrollToBottom, scrollToElement })
</script>

<template>
  <ScrollAreaViewport
    ref="viewport"
    class="size-full rounded-[inherit]"
  >
    <slot />
  </ScrollAreaViewport>
  <ScrollAreaScrollbar
    orientation="vertical"
    class="flex w-2.5 touch-none select-none border-l border-l-transparent p-[1px] transition-colors"
  >
    <ScrollAreaThumb class="bg-border relative flex-1 rounded-full" />
  </ScrollAreaScrollbar>
</template>
