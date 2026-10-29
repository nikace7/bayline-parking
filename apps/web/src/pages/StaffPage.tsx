import { useQuery } from "@tanstack/react-query";
import { ApiError, allPages, api } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";

const roleLabel = (role: string) =>
	role.charAt(0) + role.slice(1).toLowerCase();

export function StaffPage() {
	const members = useQuery({
		queryKey: ["members"],
		queryFn: ({ signal }) =>
			allPages(
				(cursor) =>
					api.GET("/api/v1/members", {
						params: { query: { cursor, limit: 100 } },
						signal,
					}),
				signal,
			),
	});

	return (
		<section aria-labelledby="staff-heading" className="flex flex-col gap-6">
			<h1 id="staff-heading" className="text-page font-semibold">
				Staff
			</h1>

			{members.isPending && <p className="text-ink-muted">Loading staff…</p>}

			{members.isError && (
				<p role="alert" className="rounded-control bg-error-bg p-3 text-error">
					{members.error instanceof ApiError && members.error.status === 403
						? "Your role cannot view staff for this organisation."
						: "Staff could not be loaded. Retry in a moment."}
				</p>
			)}

			{members.isSuccess && (
				<div className="overflow-x-auto rounded-panel border border-line bg-surface">
					<table className="w-full min-w-[36rem] text-left text-dense">
						<caption className="sr-only">Staff in this organisation</caption>
						<thead className="bg-inset text-ink-muted">
							<tr>
								<th scope="col" className="px-4 py-2 font-medium">
									Name
								</th>
								<th scope="col" className="px-4 py-2 font-medium">
									Email
								</th>
								<th scope="col" className="px-4 py-2 font-medium">
									Roles
								</th>
								<th scope="col" className="px-4 py-2 font-medium">
									Access
								</th>
							</tr>
						</thead>
						<tbody>
							{members.data.map((member) => (
								<tr key={member.id} className="border-t border-line">
									<td className="px-4 py-3 font-medium">{member.name}</td>
									<td className="px-4 py-3">{member.email}</td>
									<td className="px-4 py-3">
										{member.roles.map(roleLabel).join(", ")}
									</td>
									<td className="px-4 py-3">
										{member.enabled ? (
											<StatusBadge tone="available">Enabled</StatusBadge>
										) : (
											<StatusBadge tone="error">Disabled</StatusBadge>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}
