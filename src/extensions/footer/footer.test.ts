import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { icon } from "@xynogen/pix-pretty/icon-catalog";
import {
	buildStackedFooter,
	compactStatus,
	ctxColor,
	decideLayout,
	renderThinkingLevel,
	resolveLayoutMode,
} from "./footer.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	getThinkingBorderColor: (level: string) => (text: string) =>
		`<${level}>${text}</${level}>`,
};

describe("decideLayout", () => {
	test("stays single while the stable line fits", () => {
		expect(decideLayout("single", 100, 80)).toBe("single");
		expect(decideLayout("single", 100, 100)).toBe("single"); // exact fit
	});

	test("stacks when the stable line overflows", () => {
		expect(decideLayout("single", 100, 101)).toBe("stacked");
	});

	test("stays stacked until the stable line fits with slack", () => {
		// 92 + 8 margin = 100 -> collapses only at the margin boundary
		expect(decideLayout("stacked", 100, 92)).toBe("single");
		expect(decideLayout("stacked", 100, 93)).toBe("stacked");
		expect(decideLayout("stacked", 100, 101)).toBe("stacked");
	});

	test("collapses immediately when plenty of room appears", () => {
		expect(decideLayout("stacked", 200, 100)).toBe("single");
	});
});

describe("resolveLayoutMode", () => {
	test("auto delegates to the responsive fit test and its hysteresis", () => {
		expect(resolveLayoutMode("auto", "single", 100, 80)).toBe("single");
		expect(resolveLayoutMode("auto", "single", 100, 120)).toBe("stacked");
		expect(resolveLayoutMode("auto", "stacked", 100, 92)).toBe("single");
		expect(resolveLayoutMode("auto", "stacked", 100, 93)).toBe("stacked");
	});

	test("forced modes ignore the terminal width entirely", () => {
		expect(resolveLayoutMode("single", "stacked", 999, 1)).toBe("single");
		expect(resolveLayoutMode("single", "single", 10, 999)).toBe("single");
		expect(resolveLayoutMode("stacked", "single", 999, 1)).toBe("stacked");
		expect(resolveLayoutMode("stacked", "stacked", 10, 999)).toBe("stacked");
	});
});

describe("buildStackedFooter", () => {
	const sep = " | ";
	const parts = {
		loc: "~/repo (main)",
		markers: "+1 ~2 ?3",
		ctxUsage: "1.2k/200k (1%)",
		tokens: "⇡12k ⇣3k $0.04",
		model: "sonnet (high) · 8/10",
		tps: "142 t/s",
		statuses: ["mcp 3/4", "lsp 3"],
	};

	test("puts every section on its own row, mode on top", () => {
		expect(buildStackedFooter({ ...parts, mode: "plan" }, 120, sep)).toEqual([
			"plan",
			"~/repo (main) +1 ~2 ?3",
			"1.2k/200k (1%) ⇡12k ⇣3k $0.04",
			"sonnet (high) · 8/10 142 t/s",
			"mcp 3/4 | lsp 3",
		]);
	});

	test("drops empty optional sections", () => {
		expect(
			buildStackedFooter(
				{
					loc: "~/repo (main)",
					model: "sonnet (high) · 8/10",
					statuses: [],
				},
				120,
				sep,
			),
		).toEqual(["~/repo (main)", "sonnet (high) · 8/10"]);
	});

	test("splits statuses onto one row each when they do not fit together", () => {
		const verbose = {
			...parts,
			statuses: ["mcp 3/4", "lsp 3", "custom very verbose status"],
		};
		expect(buildStackedFooter(verbose, 40, sep).slice(3)).toEqual(
			verbose.statuses,
		);
	});

	test("never emits a row wider than the terminal", () => {
		for (const row of buildStackedFooter({ ...parts, statuses: [] }, 20, sep)) {
			expect(visibleWidth(row)).toBeLessThanOrEqual(20);
		}
	});
});

describe("renderThinkingLevel", () => {
	test("uses the host theme's canonical thinking-level renderer", () => {
		expect(renderThinkingLevel(theme, "high", "high")).toBe(
			"<high>high</high>",
		);
		expect(renderThinkingLevel(theme, "xhigh", "xhigh")).toBe(
			"<xhigh>xhigh</xhigh>",
		);
	});

	test("renders unknown levels with the neutral muted color", () => {
		const calls: string[] = [];
		const recordingTheme = {
			fg: (color: string, text: string) => {
				calls.push(color);
				return text;
			},
			getThinkingBorderColor: theme.getThinkingBorderColor,
		};
		expect(renderThinkingLevel(recordingTheme, "future", "future")).toBe(
			"future",
		);
		expect(calls).toEqual(["muted"]);
	});
});

describe("compactStatus", () => {
	test("compacts current pi-lens active server lists to a count", () => {
		expect(
			compactStatus("pi-lens-lsp", "LSP Active: json, yaml, typescript", theme),
		).toBe(`${icon("lsp")}  3`);
	});

	test("preserves active and failed counts without listing server names", () => {
		expect(
			compactStatus(
				"pi-lens-lsp",
				"LSP Active: json, yaml · LSP Failed: eslint",
				theme,
			),
		).toBe(`${icon("lsp")}  2 !1`);
	});

	test("keeps compatibility with the older parenthesized count", () => {
		expect(compactStatus("pi-lens-lsp", "LSP Active (4)", theme)).toBe(
			`${icon("lsp")}  4`,
		);
	});
});

describe("ctxColor", () => {
	for (const window of [200_000, 1_000_000]) {
		test(`absolute band edges in a ${window} window`, () => {
			expect(ctxColor(99_999, 99, window)).toBe("success");
			expect(ctxColor(100_000, 1, window)).toBe("warning");
			expect(ctxColor(149_999, 1, window)).toBe("warning");
			expect(ctxColor(150_000, 1, window)).toBe("warning");
			expect(ctxColor(150_001, 1, window)).toBe("error");
		});
	}

	test("high pct stays green below 100k in a large window", () => {
		expect(ctxColor(90_000, 90, 200_000)).toBe("success");
	});

	test("percentage edges in a 64k window", () => {
		expect(ctxColor(31_000, 49, 64_000)).toBe("success");
		expect(ctxColor(32_000, 50, 64_000)).toBe("warning");
		expect(ctxColor(48_000, 75, 64_000)).toBe("warning");
		expect(ctxColor(48_700, 76, 64_000)).toBe("error");
	});

	for (const window of [100_000, 128_000, 150_000]) {
		test(`red is reachable in a ${window} window`, () => {
			expect(ctxColor(window * 0.76, 76, window)).toBe("error");
			expect(ctxColor(window * 0.75, 75, window)).toBe("warning");
		});
	}
});
