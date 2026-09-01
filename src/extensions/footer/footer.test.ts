import { describe, expect, test } from "bun:test";
import { icon } from "@xynogen/pix-pretty/icon-catalog";
import { compactStatus, ctxColor, renderThinkingLevel } from "./footer.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	getThinkingBorderColor: (level: string) => (text: string) =>
		`<${level}>${text}</${level}>`,
};

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
	test("branch 1 (window >= 100k) uses absolute token thresholds", () => {
		expect(ctxColor(99_999, 50, 200_000)).toBe("success");
		expect(ctxColor(100_000, 50, 200_000)).toBe("warning");
		expect(ctxColor(140_000, 70, 200_000)).toBe("warning");
		expect(ctxColor(140_001, 71, 200_000)).toBe("error");
		// the percentage thresholds are ignored on this branch
		expect(ctxColor(80_000, 40, 200_000)).toBe("success");
	});

	test("branch 2 (window < 100k) uses percentage thresholds", () => {
		expect(ctxColor(25_599, 39, 64_000)).toBe("success");
		expect(ctxColor(25_600, 40, 64_000)).toBe("warning");
		expect(ctxColor(44_800, 70, 64_000)).toBe("warning");
		expect(ctxColor(44_801, 71, 64_000)).toBe("error");
	});

	test("exactly 100k window falls into branch 1, red unreachable", () => {
		expect(ctxColor(99_999, 99, 100_000)).toBe("success");
		expect(ctxColor(100_000, 100, 100_000)).toBe("warning");
	});

	test("exactly 140k window falls into branch 1, red unreachable", () => {
		expect(ctxColor(139_999, 99, 140_000)).toBe("warning");
		expect(ctxColor(140_000, 100, 140_000)).toBe("warning");
	});
});
