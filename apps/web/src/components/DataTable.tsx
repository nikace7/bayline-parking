import type { ReactNode } from "react";

export type DataRow = { key: string; cells: ReactNode[] };

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
		<div className="overflow-x-auto rounded-panel border border-line bg-surface">
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
								className="px-4 py-6 text-center text-ink-muted"
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
		</div>
	);
}
