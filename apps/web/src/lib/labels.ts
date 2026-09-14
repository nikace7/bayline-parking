import type { components } from "../../generated/schema";

export const VEHICLE_LABEL: Record<
	components["schemas"]["VehicleClassEnum"],
	string
> = {
	CAR: "Car",
	MOTORBIKE: "Motorbike",
};
