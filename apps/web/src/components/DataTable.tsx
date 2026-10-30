import type { ReactNode } from "react";

export type DataRow = { key: string; cells: ReactNode[] };

export function TableScroll({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		// biome-ignore lint/a11y/noNoninteractiveTabindex: Wide tables must be scrollable with the keyboard.
		<section className="table-scroll" aria-label={label} tabIndex={0}>
			{children}
		</section>
	);
}

/** A scrollable table; below its minimum width it scrolls instead of squeezing columns. */
export function DataTable({
	caption,
	headings,
	rows,
	empty,
}: {
	caption: string;
	headings: string[];
	rows: DataRow[];
	empty: string;
}) {
	return (
		<TableScroll label={caption}>
			<table className="w-full min-w-[48rem] text-left text-dense tabular-nums">
				<caption className="sr-only">{caption}</caption>
				<thead className="bg-inset text-ink-muted">
					<tr>
						{headings.map((heading) => (
							<th key={heading} scope="col" className="px-4 py-2 font-medium">
								{heading}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.length === 0 ? (
						<tr>
							<td
								colSpan={headings.length}
								className="px-4 py-12 text-center text-ink-muted"
							>
								{empty}
							</td>
						</tr>
					) : (
						rows.map((row) => (
							<tr key={row.key} className="border-t border-line">
								{row.cells.map((cell, column) => (
									<td key={headings[column]} className="px-4 py-3">
										{cell}
									</td>
								))}
							</tr>
						))
					)}
				</tbody>
			</table>
		</TableScroll>
	);
}
