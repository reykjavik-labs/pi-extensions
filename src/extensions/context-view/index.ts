/**
 * context-view — Claude Code-style context window breakdown.
 *
 * Command:
 *   /context   Open an overlay with a colored grid of the active model's
 *              context window, plus a per-category token breakdown
 *              (system prompt, context files, skills, tools, messages,
 *              autocompact buffer, free space).
 *
 * In TUI mode it renders an overlay. In other modes it emits a text
 * notification with the same numbers.
 *
 * Token accounting:
 *   - The context total comes from Pi's own accounting (ctx.getContextUsage()).
 *   - Per-section token figures are estimates (chars / 4), derived from the
 *     system prompt string and tool schemas. The "Messages" row is the
 *     remainder, so the used rows reconcile with Pi's total.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

const RESET = "\x1b[0m";
const fg = (c: number) => `\x1b[38;5;${c}m`;

const COLORS = {
	systemPrompt: 33,
	contextFiles: 45,
	skills: 170,
	builtinTools: 40,
	extTools: 214,
	messages: 203,
	buffer: 244,
	free: 236,
} as const;

const CELL = "■";
const CELLS = 100;
const DEFAULT_RESERVE = 16384;
const BUILTIN_TOOLS = new Set([
	"read",
	"bash",
	"powershell",
	"edit",
	"write",
	"grep",
	"find",
	"ls",
]);

interface Row {
	key: string;
	label: string;
	tokens: number;
	color: number;
	kind: "used" | "buffer" | "free";
}

interface ToolLine {
	name: string;
	tokens: number;
	builtin: boolean;
}

interface ViewData {
	used: number | null;
	window: number;
	reserve: number;
	rows: Row[];
	tools: ToolLine[];
}

function estTokens(chars: number): number {
	return Math.round(chars / 4);
}

function fmtTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
	if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
	return `${Math.round(n)}`;
}

function fmtPercent(n: number, window: number): string {
	if (window <= 0) return "—";
	return `${((n / window) * 100).toFixed(1)}%`;
}

function stripAnsi(s: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: needed to strip ANSI
	return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function fit(line: string, width: number): string {
	const visible = stripAnsi(line);
	if (visible.length <= width) return line;
	// Trim from the plain text; styling is advisory here.
	const cut = visible.slice(0, Math.max(0, width - 1));
	return `${cut}…`;
}

function readReserveTokens(cwd: string, model: string | undefined): number {
	let reserve = DEFAULT_RESERVE;
	const paths = [
		join(homedir(), ".pi", "agent", "settings.json"),
		join(cwd, ".pi", "settings.json"),
	];
	for (const path of paths) {
		try {
			const settings = JSON.parse(readFileSync(path, "utf8")) as {
				compaction?: {
					enabled?: boolean;
					reserveTokens?: number;
					modelOverrides?: Record<string, { reserveTokens?: number }>;
				};
			};
			const compaction = settings.compaction;
			if (!compaction) continue;
			if (compaction.enabled === false) reserve = 0;
			if (typeof compaction.reserveTokens === "number")
				reserve = compaction.reserveTokens;
			if (
				model &&
				typeof compaction.modelOverrides?.[model]?.reserveTokens === "number"
			) {
				reserve = compaction.modelOverrides[model].reserveTokens as number;
			}
		} catch {
			// Missing or unreadable settings: keep defaults.
		}
	}
	return Math.max(0, reserve);
}

function gatherData(pi: ExtensionAPI, ctx: ExtensionCommandContext): ViewData {
	const options = ctx.getSystemPromptOptions() as {
		toolSnippets?: Record<string, string>;
		selectedTools?: string[];
		contextFiles?: Array<{ path: string; content: string }>;
		skills?: Array<{ disableModelInvocation: boolean }>;
	};
	const prompt: string = ctx.getSystemPrompt();
	const usage = ctx.getContextUsage();
	const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;

	const skillsMatch = prompt.match(
		/<available_skills>[\s\S]*?<\/available_skills>/,
	);
	const contextMatch = prompt.match(
		/<project_context>[\s\S]*?<\/project_context>/,
	);

	const guidelinesMatch = prompt.match(/Guidelines:\n([\s\S]*?)\n\n/);

	const skillsChars = skillsMatch?.[0].length ?? 0;
	const contextChars = contextMatch?.[0].length ?? 0;
	const guidelinesChars = guidelinesMatch?.[1]?.length ?? 0;

	let baseChars = prompt.length;
	for (const block of [
		skillsMatch?.[0],
		contextMatch?.[0],
		guidelinesMatch?.[0],
	]) {
		if (block) baseChars -= block.length;
	}
	baseChars = Math.max(0, baseChars);

	// Tool schemas and snippet split.
	const selected = options.selectedTools ?? pi.getActiveTools();
	const snippets = options.toolSnippets ?? {};
	const toolByName = new Map(pi.getAllTools().map((tool) => [tool.name, tool]));
	let builtinChars = 0;
	let extChars = 0;
	let builtinSchemaChars = 0;
	let extSchemaChars = 0;
	const tools: ToolLine[] = [];

	for (const name of selected) {
		const tool = toolByName.get(name);
		const builtin = BUILTIN_TOOLS.has(name);
		const schemaChars = tool
			? JSON.stringify({
					name: tool.name,
					description: tool.description,
					parameters: tool.parameters,
				}).length
			: 0;
		const snippetChars = snippets[name]?.length ?? 0;
		if (builtin) {
			builtinChars += snippetChars;
			builtinSchemaChars += schemaChars;
		} else {
			extChars += snippetChars;
			extSchemaChars += schemaChars;
		}
		tools.push({
			name,
			tokens: estTokens(schemaChars + snippetChars),
			builtin,
		});
	}
	tools.sort((a, b) => b.tokens - a.tokens);

	const systemPromptTokens = estTokens(baseChars + guidelinesChars);
	const contextTokens = estTokens(contextChars);
	const skillsTokens = estTokens(skillsChars);
	const builtinTokens = estTokens(builtinChars + builtinSchemaChars);
	const extTokens = estTokens(extChars + extSchemaChars);

	const window = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
	const actualUsed = usage?.tokens ?? null;
	const reserve = readReserveTokens(ctx.cwd, model);

	const staticTokens =
		systemPromptTokens +
		contextTokens +
		skillsTokens +
		builtinTokens +
		extTokens;
	const used = actualUsed ?? staticTokens;
	const messagesTokens = Math.max(0, used - staticTokens);
	const buffer = Math.min(reserve, Math.max(0, window - used));
	const free = Math.max(0, window - used - buffer);

	const rows: Row[] = [
		{
			key: "systemPrompt",
			label: "System prompt",
			tokens: systemPromptTokens,
			color: COLORS.systemPrompt,
			kind: "used",
		},
		{
			key: "contextFiles",
			label: "Archivos de contexto",
			tokens: contextTokens,
			color: COLORS.contextFiles,
			kind: "used",
		},
		{
			key: "skills",
			label: "Skills",
			tokens: skillsTokens,
			color: COLORS.skills,
			kind: "used",
		},
		{
			key: "builtinTools",
			label: "Herramientas (built-in)",
			tokens: builtinTokens,
			color: COLORS.builtinTools,
			kind: "used",
		},
		{
			key: "extTools",
			label: "Herramientas (extensión)",
			tokens: extTokens,
			color: COLORS.extTools,
			kind: "used",
		},
		{
			key: "messages",
			label: "Mensajes",
			tokens: messagesTokens,
			color: COLORS.messages,
			kind: "used",
		},
		{
			key: "buffer",
			label: "Buffer de autocompact",
			tokens: buffer,
			color: COLORS.buffer,
			kind: "buffer",
		},
		{
			key: "free",
			label: "Espacio libre",
			tokens: free,
			color: COLORS.free,
			kind: "free",
		},
	];

	return { used: actualUsed, window, reserve, rows, tools };
}

class ContextView {
	private data: ViewData;
	private expanded = false;
	private scroll = 0;
	private readonly onClose: () => void;
	private readonly requestRender: () => void;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(data: ViewData, onClose: () => void, requestRender: () => void) {
		this.data = data;
		this.onClose = onClose;
		this.requestRender = requestRender;
	}

	handleInput(data: string): void {
		if (data === "\x1b" || data === "q" || data === "\x03") {
			this.onClose();
			return;
		}
		if (data === "t") {
			this.expanded = !this.expanded;
			this.scroll = 0;
			this.invalidate();
			this.requestRender();
			return;
		}
		if (this.expanded && (data === "\x1b[A" || data === "\x1bOA")) {
			this.scroll = Math.max(0, this.scroll - 1);
			this.invalidate();
			this.requestRender();
			return;
		}
		if (this.expanded && (data === "\x1b[B" || data === "\x1bOB")) {
			this.scroll += 1;
			this.invalidate();
			this.requestRender();
		}
	}

	private grid(width: number): string[] {
		const { used, window, rows } = this.data;
		const total =
			used ??
			rows
				.filter((r) => r.kind !== "free")
				.reduce((acc, r) => acc + r.tokens, 0);
		const perCell = window > 0 ? window / CELLS : 0;
		const cells: number[] = [];
		const thresholds: Array<{ at: number; color: number }> = [];
		let acc = 0;
		for (const row of rows) {
			if (row.kind === "free") continue;
			acc += row.tokens;
			thresholds.push({ at: acc, color: row.color });
		}
		for (let i = 0; i < CELLS; i++) {
			const at = perCell > 0 ? (i + 0.5) * perCell : Number.POSITIVE_INFINITY;
			const hit = thresholds.find((t) => at < t.at);
			cells.push(hit ? hit.color : COLORS.free);
		}
		// Ensure the grid reflects the used total even if estimates drift.
		if (perCell > 0 && total > 0 && total < window) {
			const filled = Math.round(total / perCell);
			for (let i = filled; i < CELLS; i++) cells[i] = COLORS.free;
		}

		const cols = Math.max(10, Math.min(CELLS, width));
		const lines: string[] = [];
		for (let i = 0; i < cells.length; i += cols) {
			const chunk = cells.slice(i, i + cols);
			lines.push(chunk.map((c) => `${fg(c)}${CELL}${RESET}`).join(""));
		}
		return lines;
	}

	private header(width: number): string {
		const { used, window } = this.data;
		const total =
			used ??
			this.data.rows
				.filter((r) => r.kind !== "free")
				.reduce((acc, r) => acc + r.tokens, 0);
		const left = `${fg(COLORS.systemPrompt)}⊞${RESET} Ventana de contexto`;
		const right =
			window > 0
				? `${fmtTokens(total)} / ${fmtTokens(window)} (${fmtPercent(total, window)})`
				: `${fmtTokens(total)} tokens`;
		const pad = Math.max(1, width - stripAnsi(left).length - right.length);
		return `${left}${" ".repeat(pad)}${right}`;
	}

	private rowLine(row: Row, width: number): string {
		const { window } = this.data;
		const marker = `${fg(row.color)}${CELL}${RESET}`;
		const tokenText = fmtTokens(row.tokens);
		const pct = fmtPercent(row.tokens, window);
		const right = `${tokenText.padStart(9)}  ${pct.padStart(6)}`;
		const left = `${marker} ${row.label}`;
		const pad = Math.max(1, width - stripAnsi(left).length - right.length);
		return `${left}${" ".repeat(pad)}${right}`;
	}

	private toolLines(width: number): string[] {
		const header = `${fg(COLORS.extTools)}Herramientas activas${RESET}  ${this.data.tools.length}`;
		const out = [header];
		const limit = 18;
		const end = Math.min(this.data.tools.length, this.scroll + limit);
		for (let i = this.scroll; i < end; i++) {
			const tool = this.data.tools[i];
			if (!tool) continue;
			const color = tool.builtin ? COLORS.builtinTools : COLORS.extTools;
			const left = `  ${fg(color)}•${RESET} ${tool.name}`;
			const right = fmtTokens(tool.tokens);
			const pad = Math.max(1, width - stripAnsi(left).length - right.length);
			out.push(`${left}${" ".repeat(pad)}${right}`);
		}
		if (this.data.tools.length > limit) {
			out.push(
				`  ${fg(244)}(${this.scroll + 1}-${end} de ${this.data.tools.length}; ↑↓)${RESET}`,
			);
		}
		return out;
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
		const lines: string[] = [];
		lines.push(this.header(width));
		lines.push("");
		for (const line of this.grid(width)) lines.push(line);
		lines.push("");
		for (const row of this.data.rows)
			lines.push(fit(this.rowLine(row, width), width));
		if (this.expanded) {
			lines.push("");
			for (const line of this.toolLines(width)) lines.push(fit(line, width));
		}
		lines.push("");
		const hint =
			this.data.used == null
				? `${fg(244)}[estimado]  [t] ${this.expanded ? "ocultar" : "ver"} herramientas  [q] cerrar${RESET}`
				: `${fg(244)}[t] ${this.expanded ? "ocultar" : "ver"} herramientas  [q] cerrar${RESET}`;
		lines.push(hint);
		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

function summaryText(data: ViewData): string {
	const parts = data.rows
		.filter((r) => r.kind !== "free")
		.map((r) => `${r.label}=${fmtTokens(r.tokens)}`)
		.join(" | ");
	const total =
		data.used ??
		data.rows
			.filter((r) => r.kind !== "free")
			.reduce((a, r) => a + r.tokens, 0);
	return `${fmtTokens(total)}/${fmtTokens(data.window)} (${fmtPercent(total, data.window)}) ${parts}`;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("context", {
		description: "Show the context window breakdown (Claude Code style)",
		handler: async (_args, ctx) => {
			const data = gatherData(pi, ctx);

			if (ctx.mode !== "tui") {
				ctx.ui.notify(summaryText(data), "info");
				return;
			}

			await ctx.ui.custom(
				(tui, _theme, _keybindings, done) =>
					new ContextView(
						data,
						() => done(null),
						() => tui.requestRender(),
					),
				{
					overlay: true,
					overlayOptions: {
						width: "80%",
						minWidth: 60,
						maxHeight: "85%",
						anchor: "center",
					},
				},
			);
		},
	});
}
