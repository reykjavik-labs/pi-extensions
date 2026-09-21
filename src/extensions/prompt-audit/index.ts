/**
 * prompt-audit — inspect what Pi actually sends as system prompt.
 *
 * Commands:
 *   /prompt-audit         Write a full report to .pi/prompt-audit.md
 *   /prompt-audit report  Same as above.
 *   /prompt-audit watch   Toggle per-turn metrics logging (.pi/prompt-audit-history.jsonl)
 *   /prompt-audit status  Show current state and context usage.
 *
 * The report includes: the full system prompt, a per-section size breakdown,
 * every loaded skill (name, scope, source, path, whether it enters the prompt),
 * every loaded context file, and the live context usage of the active model.
 *
 * Token figures for sections are estimates (chars / 4). Context usage comes
 * from Pi's own accounting (ctx.getContextUsage()) and is authoritative.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const REPORT_FILE = "prompt-audit.md";
const HISTORY_FILE = "prompt-audit-history.jsonl";

interface AuditSkill {
	name: string;
	description: string;
	filePath: string;
	baseDir: string;
	disableModelInvocation: boolean;
	sourceInfo?: { source?: string; scope?: string };
}

interface AuditOptions {
	customPrompt?: string;
	selectedTools?: string[];
	toolSnippets?: Record<string, string>;
	promptGuidelines?: string[];
	appendSystemPrompt?: string;
	cwd: string;
	contextFiles?: Array<{ path: string; content: string }>;
	skills?: AuditSkill[];
}

function estTokens(chars: number): number {
	return Math.round(chars / 4);
}

function fmt(n: number): string {
	return n.toLocaleString("en-US");
}

function mdCell(value: string): string {
	return value.replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

export default function (pi: ExtensionAPI) {
	let watch = false;

	pi.registerCommand("prompt-audit", {
		description:
			"Report the generated system prompt, loaded skills, and context usage",
		getArgumentCompletions: (prefix: string) => {
			const items = ["report", "watch", "status"]
				.filter((v) => v.startsWith(prefix))
				.map((v) => ({ value: v, label: v }));
			return items.length > 0 ? items : null;
		},
		handler: async (args, ctx) => {
			const action = (args ?? "").trim().split(/\s+/)[0] || "report";

			if (action === "watch") {
				watch = !watch;
				ctx.ui.notify(`prompt-audit watch: ${watch ? "ON" : "OFF"}`, "info");
				return;
			}

			if (action === "status") {
				const usage = ctx.getContextUsage();
				const model = ctx.model
					? `${ctx.model.provider}/${ctx.model.id}`
					: "unknown";
				const used =
					usage?.tokens == null ? "unknown" : `${fmt(usage.tokens)} tokens`;
				const pct =
					usage?.percent == null ? "unknown" : `${usage.percent.toFixed(1)}%`;
				ctx.ui.notify(
					`${model} | context ${used} (${pct} of ${usage ? fmt(usage.contextWindow) : "?"}) | watch ${watch ? "ON" : "OFF"}`,
					"info",
				);
				return;
			}

			// report
			const options = ctx.getSystemPromptOptions() as unknown as AuditOptions;
			const systemPrompt = ctx.getSystemPrompt();
			const usage = ctx.getContextUsage();
			const outDir = join(ctx.cwd, ".pi");
			const outPath = join(outDir, REPORT_FILE);
			const lines: string[] = [];

			const skills = options.skills ?? [];
			const inPrompt = skills.filter((s) => !s.disableModelInvocation);
			const hidden = skills.filter((s) => s.disableModelInvocation);
			const contextFiles = options.contextFiles ?? [];
			const contextChars = contextFiles.reduce(
				(acc, f) => acc + f.content.length,
				0,
			);

			const model = ctx.model
				? `${ctx.model.provider}/${ctx.model.id}`
				: "unknown";

			lines.push("# System prompt audit", "");
			lines.push(`- Generated: ${new Date().toISOString()}`);
			lines.push(`- Model: ${model}`);
			lines.push(`- CWD: ${ctx.cwd}`);
			lines.push(
				`- Skills loaded: ${skills.length} (${inPrompt.length} in prompt, ${hidden.length} hidden)`,
			);
			lines.push(`- Context files: ${contextFiles.length}`);
			lines.push("");

			lines.push("## Context usage (authoritative, Pi accounting)", "");
			if (usage && usage.tokens != null) {
				lines.push(
					`- Used: ${fmt(usage.tokens)} tokens (${usage.percent?.toFixed(1)}%)`,
				);
				lines.push(`- Window: ${fmt(usage.contextWindow)} tokens`);
				lines.push(`- Free: ${fmt(usage.contextWindow - usage.tokens)} tokens`);
			} else {
				lines.push(
					"- Usage not available yet (e.g. right after compaction). Send a message, then re-run.",
				);
			}
			lines.push("");

			lines.push("## System prompt size", "");
			lines.push(
				"Token figures are estimates (chars / 4), except the context usage above.",
			);
			lines.push("");
			lines.push("| Section | Chars | ~Tokens |");
			lines.push("| --- | ---: | ---: |");
			const sections: Array<[string, number]> = [
				["Custom prompt", (options.customPrompt ?? "").length],
				["Appended system prompt", (options.appendSystemPrompt ?? "").length],
				["Tool snippets", JSON.stringify(options.toolSnippets ?? {}).length],
				[
					"Prompt guidelines",
					(options.promptGuidelines ?? []).join("\n").length,
				],
				["Context files", contextChars],
			];
			for (const [label, chars] of sections) {
				lines.push(`| ${label} | ${fmt(chars)} | ${fmt(estTokens(chars))} |`);
			}
			lines.push(
				`| **Full system prompt (incl. skills)** | ${fmt(systemPrompt.length)} | ${fmt(estTokens(systemPrompt.length))} |`,
			);
			lines.push("");

			lines.push("## Active tools", "");
			lines.push(
				options.selectedTools?.length
					? options.selectedTools.map((t) => `\`${t}\``).join(", ")
					: "(none reported)",
			);
			lines.push("");

			lines.push("## Skills", "");
			if (skills.length === 0) {
				lines.push("(none loaded)");
			} else {
				lines.push("| In prompt | Name | Scope | Source | Path |");
				lines.push("| --- | --- | --- | --- | --- |");
				for (const s of [...inPrompt, ...hidden]) {
					const scope = s.sourceInfo?.scope ?? "?";
					const source = s.sourceInfo?.source ?? "?";
					lines.push(
						`| ${s.disableModelInvocation ? "no" : "yes"} | ${mdCell(s.name)} | ${mdCell(scope)} | ${mdCell(source)} | ${mdCell(s.filePath)} |`,
					);
				}
				lines.push("");
				lines.push("### Skill descriptions", "");
				for (const s of [...inPrompt, ...hidden]) {
					lines.push(
						`- **${s.name}**${s.disableModelInvocation ? " (hidden from prompt)" : ""}: ${mdCell(s.description)}`,
					);
				}
			}
			lines.push("");

			lines.push("## Context files", "");
			if (contextFiles.length === 0) {
				lines.push("(none loaded)");
			} else {
				lines.push("| Chars | ~Tokens | Path |");
				lines.push("| ---: | ---: | --- |");
				for (const f of contextFiles) {
					lines.push(
						`| ${fmt(f.content.length)} | ${fmt(estTokens(f.content.length))} | ${mdCell(f.path)} |`,
					);
				}
			}
			lines.push("");

			lines.push("## Full system prompt", "");
			lines.push("```text");
			lines.push(systemPrompt);
			lines.push("```");
			lines.push("");

			try {
				mkdirSync(outDir, { recursive: true });
				writeFileSync(outPath, lines.join("\n"), "utf8");
				ctx.ui.notify(
					`Report written: ${outPath} (${fmt(systemPrompt.length)} chars, ${skills.length} skills, ` +
						`context ${usage?.tokens != null ? `${fmt(usage.tokens)} tokens` : "unknown"})`,
					"info",
				);
			} catch (error) {
				ctx.ui.notify(
					`prompt-audit failed: ${(error as Error).message}`,
					"error",
				);
			}
		},
	});

	pi.on("before_agent_start", (event, ctx) => {
		if (!watch) return;
		const options = event.systemPromptOptions as unknown as AuditOptions;
		const usage = ctx.getContextUsage();
		const skills = options.skills ?? [];
		const record = {
			timestamp: new Date().toISOString(),
			model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : null,
			systemPromptChars: event.systemPrompt.length,
			estimatedSystemPromptTokens: estTokens(event.systemPrompt.length),
			contextUsedTokens: usage?.tokens ?? null,
			contextPercent: usage?.percent ?? null,
			contextWindow: usage?.contextWindow ?? null,
			skillsInPrompt: skills
				.filter((s) => !s.disableModelInvocation)
				.map((s) => s.name),
			skillsHidden: skills
				.filter((s) => s.disableModelInvocation)
				.map((s) => s.name),
			contextFileChars: (options.contextFiles ?? []).reduce(
				(acc, f) => acc + f.content.length,
				0,
			),
		};
		try {
			mkdirSync(join(ctx.cwd, ".pi"), { recursive: true });
			appendFileSync(
				join(ctx.cwd, ".pi", HISTORY_FILE),
				`${JSON.stringify(record)}\n`,
				"utf8",
			);
		} catch {
			// Never break a turn for logging.
		}
	});
}
