/**
 * Footer layout configuration.
 *
 * Reads the `footer.layout` key from pi's settings files:
 *   ~/.pi/agent/settings.json   (global)
 *   <cwd>/.pi/settings.json     (project, only when the project is trusted)
 *
 * Accepted values: "auto" (default), "single", "stacked". An absent key
 * resolves to "auto"; an invalid value is ignored (falling back to the next
 * source or "auto") and reported so the caller can warn.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";

/** User-selectable footer layout. "auto" keeps the responsive behavior. */
export type FooterLayoutSetting = "auto" | "single" | "stacked";

export const DEFAULT_FOOTER_LAYOUT: FooterLayoutSetting = "auto";

export const FOOTER_LAYOUT_VALUES: readonly FooterLayoutSetting[] = [
	"auto",
	"single",
	"stacked",
];

export type FooterLayoutSource = "global" | "project";

/** Result of looking for `footer.layout` in one parsed settings document. */
export type FooterLayoutParse =
	| { status: "absent" }
	| { status: "valid"; value: FooterLayoutSetting }
	| { status: "invalid"; found: string };

/**
 * Extract `footer.layout` from a parsed settings object. Never throws: an
 * unknown shape is "absent", and a present-but-unusable value is "invalid" so
 * the caller can decide whether to warn.
 */
export function parseFooterLayout(raw: unknown): FooterLayoutParse {
	if (typeof raw !== "object" || raw === null) return { status: "absent" };
	const footer = (raw as Record<string, unknown>).footer;
	if (typeof footer !== "object" || footer === null)
		return { status: "absent" };
	const layout = (footer as Record<string, unknown>).layout;
	if (layout === undefined) return { status: "absent" };
	if (
		typeof layout === "string" &&
		(FOOTER_LAYOUT_VALUES as readonly string[]).includes(layout)
	) {
		return { status: "valid", value: layout as FooterLayoutSetting };
	}
	return { status: "invalid", found: JSON.stringify(layout) };
}

export interface FooterLayoutResolution {
	layout: FooterLayoutSetting;
	/** Sources whose `footer.layout` was present but unusable, in read order. */
	invalidSources: FooterLayoutSource[];
}

/**
 * Resolve the effective layout from the two parsed documents: a valid project
 * value beats a valid global value, which beats the default. Invalid values
 * are skipped but reported.
 */
export function resolveFooterLayout(
	global: FooterLayoutParse,
	project: FooterLayoutParse,
): FooterLayoutResolution {
	const invalidSources: FooterLayoutSource[] = [];
	if (global.status === "invalid") invalidSources.push("global");
	if (project.status === "invalid") invalidSources.push("project");
	const layout =
		(project.status === "valid" ? project.value : undefined) ??
		(global.status === "valid" ? global.value : undefined) ??
		DEFAULT_FOOTER_LAYOUT;
	return { layout, invalidSources };
}

/** Read and parse one settings document; missing files are "absent". */
function readDocument(path: string): FooterLayoutParse {
	let text: string;
	try {
		text = readFileSync(path, "utf-8");
	} catch {
		return { status: "absent" };
	}
	try {
		return parseFooterLayout(JSON.parse(text));
	} catch {
		return { status: "invalid", found: "malformed JSON" };
	}
}

export interface FooterLayoutReadOptions {
	cwd: string;
	projectTrusted: boolean;
	/** Override for tests; defaults to pi's global settings path. */
	globalSettingsPath?: string;
	/** Override for tests; defaults to `<cwd>/.pi/settings.json`. */
	projectSettingsPath?: string;
}

export interface FooterLayoutRead {
	layout: FooterLayoutSetting;
	/** Ready-to-show warning when a settings file was malformed or invalid. */
	warning?: string;
}

/**
 * Synchronously read both settings files and resolve the footer layout. The
 * project file is only consulted when `projectTrusted` matches pi's own rule.
 */
export function readFooterLayout(
	options: FooterLayoutReadOptions,
): FooterLayoutRead {
	const globalPath =
		options.globalSettingsPath ?? join(getAgentDir(), "settings.json");
	const projectPath =
		options.projectSettingsPath ??
		join(options.cwd, CONFIG_DIR_NAME, "settings.json");

	const globalParse = readDocument(globalPath);
	const projectParse: FooterLayoutParse = options.projectTrusted
		? readDocument(projectPath)
		: { status: "absent" };

	const { layout, invalidSources } = resolveFooterLayout(
		globalParse,
		projectParse,
	);
	if (invalidSources.length === 0) return { layout };

	const accepted = FOOTER_LAYOUT_VALUES.map((value) => `"${value}"`).join(", ");
	const details = invalidSources.map((source) => {
		const path = source === "global" ? globalPath : projectPath;
		const parse = source === "global" ? globalParse : projectParse;
		const found = parse.status === "invalid" ? parse.found : "unknown";
		return `${path} must be one of ${accepted} (got ${found})`;
	});
	return {
		layout,
		warning: `Invalid footer.layout: ${details.join("; ")}. Using "${layout}".`,
	};
}
