import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import registerFooter from "./footer.ts";

export default function (pi: ExtensionAPI): void {
	registerFooter(pi);
}
