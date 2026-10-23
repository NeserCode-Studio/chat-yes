import { invoke } from "@tauri-apps/api/core"
import { createLogger } from "@/lib/logger"

const log = createLogger("SecretStorage")

function isTauriRuntime(): boolean {
	return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export async function readStoredSecret(
	agentId: string
): Promise<string | null> {
	if (!isTauriRuntime()) return null
	try {
		return await invoke<string | null>("agent_secret_get", {
			agentId,
		})
	} catch (error) {
		log.warn("failed to read agent secret", { agentId, error })
		return null
	}
}

export async function writeStoredSecret(
	agentId: string,
	secret: string
): Promise<void> {
	if (!isTauriRuntime()) return
	await invoke("agent_secret_set", { agentId, secret })
}

export async function removeStoredSecret(agentId: string): Promise<void> {
	if (!isTauriRuntime()) return
	try {
		await invoke("agent_secret_remove", { agentId })
	} catch (error) {
		log.warn("failed to remove agent secret", { agentId, error })
	}
}
