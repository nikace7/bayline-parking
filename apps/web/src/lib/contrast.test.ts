import { describe, expect, it } from "vitest";
import styles from "../../styles.css?raw";

// Guards the colour tokens (D52): a palette change that breaks WCAG AA fails here, not in review.
const tokens = new Map(
	[...styles.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6});/gi)].map(
		([, name, hex]) => [name, hex] as const,
	),
);

function token(name: string): string {
	const hex = tokens.get(name);
	if (!hex) throw new Error(`Missing colour token --color-${name}`);
	return hex;
}

function luminance(hex: string): number {
	const channel = (offset: number) => {
		const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
		return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(foreground: string, background: string): number {
	const [light, dark] = [
		luminance(token(foreground)),
		luminance(token(background)),
	].sort((a, b) => b - a) as [number, number];
	return (light + 0.05) / (dark + 0.05);
}

const TEXT: [string, string][] = [
	["ink", "canvas"],
	["ink", "surface"],
	["ink", "inset"],
	["ink-muted", "canvas"],
	["ink-muted", "surface"],
	["ink-muted", "inset"],
	["brand", "canvas"],
	["brand", "surface"],
	["brand", "inset"],
	["on-brand", "brand"],
	["on-brand", "brand-strong"],
	["on-brand", "error"],
	["on-brand", "error-strong"],
	["available", "available-bg"],
	["occupied", "occupied-bg"],
	["warning", "warning-bg"],
	["error", "error-bg"],
	["on-rail", "rail"],
	["on-rail", "rail-active"],
	["rail-muted", "rail"],
];

const CONTROL_BORDERS: [string, string][] = [
	["control", "canvas"],
	["control", "surface"],
	["control", "inset"],
];

// Panel and table borders are decorative, so WCAG's 3:1 does not apply. This floor keeps them
// visible: the old inset borders measured 1.05–1.16:1 and would fail it.
const DECORATIVE_BORDERS: [string, string][] = [
	["line", "canvas"],
	["line", "surface"],
];

describe("colour tokens", () => {
	it.each(TEXT)("%s text on %s meets 4.5:1", (foreground, background) => {
		expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
	});

	it.each(CONTROL_BORDERS)(
		"%s border on %s meets 3:1",
		(border, background) => {
			expect(contrast(border, background)).toBeGreaterThanOrEqual(3);
		},
	);

	it.each(DECORATIVE_BORDERS)(
		"%s border on %s stays visible at 1.25:1",
		(border, background) => {
			expect(contrast(border, background)).toBeGreaterThanOrEqual(1.25);
		},
	);
});
