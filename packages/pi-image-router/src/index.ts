/**
 * Image Reader Routing Extension
 *
 * Auto-routes prompts containing user-attached images to a configured
 * `imageReaderModel`, then switches back to the previous model when the
 * image-bearing turn ends.
 *
 * Config (in settings.json, global or project):
 *   "imageReaderModel": "provider/modelId"   // e.g. "minimax/MiniMax-M3"
 *
 * Behavior:
 *   - before_agent_start fires; if event.images is non-empty AND current
 *     model is not imageReaderModel → switch in + notify.
 *   - if event.images is empty AND current model IS imageReaderModel AND
 *     previousModel is set (we auto-switched in earlier) → switch back + notify.
 *   - if imageReaderModel is unset or invalid, notify once per session
 *     (remembered via appendEntry) and skip routing.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";

const CONFIG_KEY = "imageReaderModel";
const NOTIFY_ENTRY = "image-reader-no-config-notified";

interface Settings {
	imageReaderModel?: unknown;
	[key: string]: unknown;
}

interface ModelRef {
	provider: string;
	id: string;
}

interface SessionEntry {
	type: string;
	customType?: string;
}

function loadSettings(cwd: string): Settings {
	const candidates = [
		join(getAgentDir(), "settings.json"),
		join(cwd, CONFIG_DIR_NAME, "settings.json"),
	];
	let merged: Settings = {};
	for (const path of candidates) {
		if (!existsSync(path)) continue;
		try {
			const parsed = JSON.parse(readFileSync(path, "utf-8")) as Settings;
			merged = { ...merged, ...parsed };
		} catch {
			// ignore parse errors
		}
	}
	return merged;
}

function parseModelRef(ref: unknown): ModelRef | null {
	if (typeof ref !== "string") return null;
	const slash = ref.indexOf("/");
	if (slash <= 0 || slash === ref.length - 1) return null;
	return { provider: ref.slice(0, slash), id: ref.slice(slash + 1) };
}

export default function imageRouter(pi: ExtensionAPI) {
	let previousModel: ModelRef | null = null;

	pi.on("before_agent_start", async (event, ctx) => {
		const settings = loadSettings(ctx.cwd);
		const ref = parseModelRef(settings.imageReaderModel);

		if (!ref) {
			// No config or invalid format: notify once per session, skip routing.
			const entries = ctx.sessionManager.getEntries() as SessionEntry[];
			const alreadyNotified = entries.some(
				(e) => e.type === "custom" && e.customType === NOTIFY_ENTRY,
			);
			if (!alreadyNotified) {
				ctx.ui.notify(
					`imageReaderModel not configured. Add "${CONFIG_KEY}": "provider/modelId" to settings.json to enable image routing.`,
					"warning",
				);
				pi.appendEntry(NOTIFY_ENTRY, { ts: Date.now() });
			}
			return;
		}

		const target = ctx.modelRegistry.find(ref.provider, ref.id);
		if (!target) {
			ctx.ui.notify(
				`imageReaderModel "${ref.provider}/${ref.id}" not found in registry.`,
				"warning",
			);
			return;
		}

		const current = ctx.model;
		if (!current) return;

		const hasImage = Array.isArray(event.images) && event.images.length > 0;
		const currentIsImageReader = current.id === target.id;

		if (hasImage && !currentIsImageReader) {
			previousModel = { provider: current.provider, id: current.id };
			const ok = await pi.setModel(target);
			if (ok) {
				ctx.ui.notify(`Switching to ${target.id} for image`, "info");
			} else {
				ctx.ui.notify(
					`No API key for ${target.id}. Image will fail this turn.`,
					"error",
				);
				previousModel = null;
			}
		} else if (!hasImage && currentIsImageReader && previousModel) {
			const back = ctx.modelRegistry.find(
				previousModel.provider,
				previousModel.id,
			);
			if (back) {
				await pi.setModel(back);
				ctx.ui.notify(`Switched back to ${back.id}`, "info");
			}
			previousModel = null;
		}
	});
}
