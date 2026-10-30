import type { Page } from "@playwright/test";

// Synthetic records for layout/keyboard checks; these do not replace live API integration tests.
const now = new Date().toISOString();
const location = {
	id: "loc",
	name: "North Gate Central",
	organisationName: "North Gate Parking",
	address: "Durbar Marg, Kathmandu",
	receiptPrefix: "NGC",
	timezone: "Asia/Kathmandu",
	latitude: 27.712,
	longitude: 85.3178,
	enabled: true,
	createdAt: now,
	reservableBays: 6,
};
const bays = Array.from({ length: 18 }, (_, index) => ({
	id: `bay-${index}`,
	locationId: "loc",
	label: `${index < 12 ? "A" : "R"}${String((index % 12) + 1).padStart(2, "0")}`,
	vehicleClass: index % 3 === 0 ? "MOTORBIKE" : "CAR",
	mode: index < 12 ? "WALK_IN" : "RESERVABLE",
	state: index === 11 ? "OUT_OF_SERVICE" : "ACTIVE",
	revision: 1,
	createdAt: now,
}));
const visits = bays.slice(0, 6).map((bay, index) => ({
	id: `visit-${index}`,
	bayId: bay.id,
	bayLabel: bay.label,
	locationId: "loc",
	vehicleClass: bay.vehicleClass,
	plate: index === 0 ? "बा २ प ३४५६" : `BA 12 PA ${1234 + index}`,
	status: "PARKED",
	enteredAt: new Date(Date.now() - (index + 1) * 1800000).toISOString(),
	stage: "PARKED",
}));
const reservation = {
	id: "reservation-1",
	reference: "K7M2Q9XA",
	organisationName: "North Gate Parking",
	locationId: "loc",
	locationName: location.name,
	locationAddress: location.address,
	timezone: location.timezone,
	bayId: "bay-12",
	bayLabel: "R01",
	vehicleClass: "CAR",
	plate: "BA 12 PA 6789",
	customerName: "Asha Sharma",
	startsAt: new Date(Date.now() + 3600000).toISOString(),
	endsAt: new Date(Date.now() + 7200000).toISOString(),
	arrivalOpensAt: new Date(Date.now() + 3000000).toISOString(),
	arrivalClosesAt: new Date(Date.now() + 4500000).toISOString(),
	status: "CONFIRMED",
	holdExpiresAt: null,
	cancelReason: "",
	conflict: false,
	revision: 1,
	createdAt: now,
};
const shift = {
	id: "shift",
	locationId: "loc",
	locationName: location.name,
	operatorName: "Asha Sharma",
	openingFloatPaisa: 100000,
	openedAt: now,
	closedAt: null,
	countedCashPaisa: null,
	expectedCashPaisa: null,
	variancePaisa: null,
};
const invoice = {
	id: "invoice",
	cutoffAt: now,
	billableSeconds: 3600,
	blocks: 2,
	basePaisa: 10000,
	discountPaisa: 0,
	taxPaisa: 0,
	totalPaisa: 10000,
	status: "CONFIRMED",
	createdAt: now,
};
const scope = {
	organisationName: "North Gate Parking",
	locationName: location.name,
	timezone: location.timezone,
	fromDate: now.slice(0, 10),
	toDate: now.slice(0, 10),
	asOf: now,
};
const pass = {
	id: "pass",
	reference: "PASS001",
	customerName: "Asha Sharma",
	customerEmail: "asha@example.test",
	plates: ["बा २ प ३४५६"],
	locationNames: [location.name],
	startsAt: now,
	endsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
	coveredSeconds: 86400,
	maxVehicles: 1,
	pricePaisa: 150000,
	status: "ACTIVE",
	activatedAt: now,
	renewsReference: "",
	invoiceId: "invoice",
	totalPaisa: 150000,
	paidPaisa: 150000,
	duePaisa: 0,
};

export async function mockUi(page: Page, signedOut = false) {
	const unexpected: string[] = [];
	const records: Record<string, unknown> = {
		"/auth/session": signedOut
			? { user: null, memberships: [], activeOrganisationId: null }
			: {
					user: {
						id: "user",
						name: "Asha Sharma",
						email: "owner@example.test",
					},
					activeOrganisationId: "org",
					memberships: [
						{
							organisationId: "org",
							organisationName: "North Gate Parking",
							roles: ["OWNER"],
						},
					],
				},
		"/locations": [location],
		"/public/locations": [location],
		"/locations/loc/bays": bays,
		"/locations/loc/tariffs": [
			{
				id: "tariff",
				locationId: "loc",
				vehicleClass: "CAR",
				effectiveFrom: now,
				graceSeconds: 300,
				blockSeconds: 1800,
				blockPaisa: 5000,
				dailyCapPaisa: null,
				taxBps: 0,
				status: "CURRENT",
				createdAt: now,
			},
		],
		"/parking/sessions": visits,
		"/reservations": [reservation],
		"/customer/reservations": [reservation],
		"/customer/reservations/reservation-1": reservation,
		"/memberships": [
			pass,
			{
				...pass,
				id: "pass2",
				reference: "PASS002",
				customerName: "Bina Thapa",
				customerEmail: "bina@example.test",
				plates: ["BA 12 PA 9876"],
				status: "PENDING",
				paidPaisa: 0,
				duePaisa: 150000,
			},
		],
		"/members": ["Asha Sharma", "Bina Thapa", "Ram Shrestha"].map(
			(name, index) => ({
				id: `member-${index}`,
				name,
				email: `staff${index}@example.test`,
				roles: [index === 0 ? "OWNER" : "OPERATOR"],
				enabled: true,
				revision: 1,
				createdAt: now,
			}),
		),
		"/shifts/current": { shift },
		"/shifts/shift/summary": {
			shift,
			captureCount: 3,
			cashCapturedPaisa: 30000,
			expectedCashPaisa: 130000,
		},
		"/shifts": [
			{
				...shift,
				id: "closed-shift",
				closedAt: now,
				expectedCashPaisa: 130000,
				countedCashPaisa: 128000,
				variancePaisa: -2000,
			},
		],
		"/reports/collections": {
			scope,
			rows: [
				{
					postedAt: now,
					receiptNumber: "NGC-000001",
					locationName: location.name,
					plate: "बा २ प ३४५६",
					method: "CASH",
					kind: "CAPTURE",
					amountPaisa: 10000,
					receivedByName: "Asha Sharma",
				},
			],
			byMethod: [{ method: "CASH", count: 1, amountPaisa: 10000 }],
			capturedPaisa: 10000,
			refundedPaisa: 0,
			netPaisa: 10000,
		},
		"/reports/vehicle-log": {
			scope,
			rows: [],
			entries: 6,
			exits: 0,
			stillParked: 6,
		},
		"/receipts/receipt-1": {
			id: "receipt-1",
			number: "NGC-000001",
			issuedAt: now,
			organisationName: "North Gate Parking",
			locationName: location.name,
			locationAddress: location.address,
			timezone: location.timezone,
			plate: "बा २ प ३४५६",
			vehicleClass: "CAR",
			bayLabel: "A01",
			enteredAt: now,
			invoice,
			amountPaisa: 10000,
			method: "CASH",
			receivedByName: "Asha Sharma",
			printedCopies: 0,
		},
	};
	await page.route("**/api/v1/**", async (route) => {
		const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
		if (!(path in records)) {
			unexpected.push(path);
			await route.fulfill({ status: 404, json: {} });
			return;
		}
		const data = records[path];
		await route.fulfill({
			json: {
				data,
				...(Array.isArray(data)
					? { page: { next: null, previous: null } }
					: {}),
			},
		});
	});
	return unexpected;
}
