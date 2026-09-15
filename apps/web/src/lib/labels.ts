import type { components } from "../../generated/schema";
import type { Tone } from "../components/StatusBadge";

type Schemas = components["schemas"];

export const VEHICLE_LABEL: Record<Schemas["VehicleClassEnum"], string> = {
	CAR: "Car",
	MOTORBIKE: "Motorbike",
};

export const RESERVATION_STATUS: Record<
	Schemas["ReservationStatusEnum"],
	{ label: string; tone: Tone }
> = {
	HOLD: { label: "On hold", tone: "warning" },
	CONFIRMED: { label: "Confirmed", tone: "available" },
	CHECKED_IN: { label: "Checked in", tone: "occupied" },
	COMPLETED: { label: "Completed", tone: "neutral" },
	EXPIRED: { label: "Hold lapsed", tone: "neutral" },
	CANCELLED: { label: "Cancelled", tone: "neutral" },
	NO_SHOW: { label: "No-show", tone: "error" },
};
