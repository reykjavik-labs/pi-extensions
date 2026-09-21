import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_FOOTER_LAYOUT,
	parseFooterLayout,
	readFooterLayout,
	resolveFooterLayout,
} from "./settings.ts";

describe("parseFooterLayout", () => {
	test("absent when the key or its parents are missing or wrongly typed", () => {
		expect(parseFooterLayout({})).toEqual({ status: "absent" });
		expect(parseFooterLayout({ footer: {} })).toEqual({ status: "absent" });
		expect(parseFooterLayout({ footer: "stacked" })).toEqual({
			status: "absent",
		});
		expect(parseFooterLayout(null)).toEqual({ status: "absent" });
		expect(parseFooterLayout("nope")).toEqual({ status: "absent" });
	});

	test("accepts every documented value", () => {
		for (const value of ["auto", "single", "stacked"] as const) {
			expect(parseFooterLayout({ footer: { layout: value } })).toEqual({
				status: "valid",
				value,
			});
		}
	});

	test("marks unknown strings and wrong types invalid", () => {
		expect(parseFooterLayout({ footer: { layout: "stack" } })).toEqual({
			status: "invalid",
			found: '"stack"',
		});
		expect(parseFooterLayout({ footer: { layout: 2 } })).toEqual({
			status: "invalid",
			found: "2",
		});
	});
});

describe("resolveFooterLayout", () => {
	test("defaults to auto when both sources are absent", () => {
		expect(
			resolveFooterLayout({ status: "absent" }, { status: "absent" }),
		).toEqual({ layout: DEFAULT_FOOTER_LAYOUT, invalidSources: [] });
	});

	test("a valid project value overrides a valid global value", () => {
		expect(
			resolveFooterLayout(
				{ status: "valid", value: "stacked" },
				{ status: "valid", value: "single" },
			),
		).toEqual({ layout: "single", invalidSources: [] });
	});

	test("global is used when the project value is absent", () => {
		expect(
			resolveFooterLayout(
				{ status: "valid", value: "stacked" },
				{ status: "absent" },
			),
		).toEqual({ layout: "stacked", invalidSources: [] });
	});

	test("an invalid project value falls back to global and is reported", () => {
		expect(
			resolveFooterLayout(
				{ status: "valid", value: "stacked" },
				{ status: "invalid", found: '"stack"' },
			),
		).toEqual({ layout: "stacked", invalidSources: ["project"] });
	});

	test("reports both invalid sources and falls back to auto", () => {
		expect(
			resolveFooterLayout(
				{ status: "invalid", found: "2" },
				{ status: "invalid", found: '"x"' },
			),
		).toEqual({ layout: "auto", invalidSources: ["global", "project"] });
	});
});

describe("readFooterLayout", () => {
	const withTempDir = (run: (dir: string) => void) => {
		const dir = mkdtempSync(join(tmpdir(), "footer-settings-"));
		try {
			run(dir);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	};

	test("reads both files and lets a trusted project override global", () => {
		withTempDir((dir) => {
			const globalSettingsPath = join(dir, "global.json");
			const projectSettingsPath = join(dir, "project.json");
			writeFileSync(
				globalSettingsPath,
				JSON.stringify({ footer: { layout: "stacked" } }),
			);
			writeFileSync(
				projectSettingsPath,
				JSON.stringify({ footer: { layout: "single" } }),
			);
			expect(
				readFooterLayout({
					cwd: dir,
					projectTrusted: true,
					globalSettingsPath,
					projectSettingsPath,
				}),
			).toEqual({ layout: "single" });
		});
	});

	test("ignores the project file when the project is untrusted", () => {
		withTempDir((dir) => {
			const globalSettingsPath = join(dir, "global.json");
			const projectSettingsPath = join(dir, "project.json");
			writeFileSync(
				globalSettingsPath,
				JSON.stringify({ footer: { layout: "stacked" } }),
			);
			writeFileSync(
				projectSettingsPath,
				JSON.stringify({ footer: { layout: "single" } }),
			);
			expect(
				readFooterLayout({
					cwd: dir,
					projectTrusted: false,
					globalSettingsPath,
					projectSettingsPath,
				}),
			).toEqual({ layout: "stacked" });
		});
	});

	test("warns and falls back when a file is malformed JSON", () => {
		withTempDir((dir) => {
			const globalSettingsPath = join(dir, "global.json");
			const projectSettingsPath = join(dir, "project.json");
			writeFileSync(
				globalSettingsPath,
				JSON.stringify({ footer: { layout: "stacked" } }),
			);
			writeFileSync(projectSettingsPath, "{ not json");
			const result = readFooterLayout({
				cwd: dir,
				projectTrusted: true,
				globalSettingsPath,
				projectSettingsPath,
			});
			expect(result.layout).toBe("stacked");
			expect(result.warning).toContain("malformed JSON");
			expect(result.warning).toContain(projectSettingsPath);
		});
	});

	test("warns and uses auto when an invalid value is the only source", () => {
		withTempDir((dir) => {
			const globalSettingsPath = join(dir, "global.json");
			writeFileSync(
				globalSettingsPath,
				JSON.stringify({ footer: { layout: "stack" } }),
			);
			const result = readFooterLayout({
				cwd: dir,
				projectTrusted: false,
				globalSettingsPath,
				projectSettingsPath: join(dir, "project.json"),
			});
			expect(result.layout).toBe("auto");
			expect(result.warning).toContain('"stack"');
			expect(result.warning).toContain(globalSettingsPath);
		});
	});

	test("missing files resolve to auto with no warning", () => {
		withTempDir((dir) => {
			expect(
				readFooterLayout({
					cwd: dir,
					projectTrusted: true,
					globalSettingsPath: join(dir, "missing-global.json"),
					projectSettingsPath: join(dir, "missing-project.json"),
				}),
			).toEqual({ layout: "auto" });
		});
	});
});
