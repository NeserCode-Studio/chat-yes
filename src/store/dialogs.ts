import { defineStore } from "pinia"
import { ref } from "vue"

export type SettingsSection = "application" | "ai" | "conversation"

/**
 * 弹窗开关全局状态（对齐 rt 的 SettingsDialogContext）。
 * 集中在根组件挂载对应弹窗，通过本 store 控制开关。
 */
export const useDialogStore = defineStore("app-dialogs", () => {
  const settingsOpen = ref(false)
  const settingsSection = ref<SettingsSection>("application")
  const aboutOpen = ref(false)

  function openSettings(section: SettingsSection = "application"): void {
    settingsSection.value = section
    settingsOpen.value = true
  }
  function closeSettings(): void {
    settingsOpen.value = false
  }
  function openAbout(): void {
    aboutOpen.value = true
  }
  function closeAbout(): void {
    aboutOpen.value = false
  }

  return {
    settingsOpen,
    settingsSection,
    aboutOpen,
    openSettings,
    closeSettings,
    openAbout,
    closeAbout,
  }
})
