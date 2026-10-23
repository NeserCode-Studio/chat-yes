<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { useDialogStore } from "@/store"
import SettingsView from "@/views/Settings.vue"
import { useChatI18n } from "@/features/chat/i18n"

const dialogs = useDialogStore()
const { t } = useChatI18n()
</script>

<template>
	<Dialog :open="dialogs.settingsOpen" @update:open="(v: boolean) => v ? dialogs.openSettings() : dialogs.closeSettings()">
		<DialogContent
			:hide-close="true"
			class="flex h-[92vh] max-h-[920px] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-6xl"
		>
			<DialogTitle class="sr-only">{{ t("settings.title") }}</DialogTitle>
			<DialogDescription class="sr-only">{{ t("settings.description") }}</DialogDescription>
			<SettingsView class="min-h-0 flex-1" />
		</DialogContent>
	</Dialog>
</template>
