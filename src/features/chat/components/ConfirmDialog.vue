<script setup lang="ts">
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog"

defineProps<{
	open: boolean
	title: string
	description: string
	confirmLabel: string
	cancelLabel: string
	destructive?: boolean
}>()

const emit = defineEmits<{
	confirm: []
	cancel: []
}>()
</script>

<template>
	<Dialog :open="open" @update:open="(value: boolean) => !value && emit('cancel')">
		<DialogContent :hide-close="true" class="max-w-md gap-4">
			<div>
				<DialogTitle class="text-base font-semibold">{{ title }}</DialogTitle>
				<DialogDescription class="mt-2 text-sm leading-6">
					{{ description }}
				</DialogDescription>
			</div>
			<div class="flex justify-end gap-2">
				<Button variant="outline" @click="emit('cancel')">
					{{ cancelLabel }}
				</Button>
				<Button :variant="destructive ? 'destructive' : 'default'" @click="emit('confirm')">
					{{ confirmLabel }}
				</Button>
			</div>
		</DialogContent>
	</Dialog>
</template>
