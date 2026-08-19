export function todayIso(): string {
	const d = new Date();
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	return `${d.getFullYear()}-${mm}-${dd}`;
}

// Adds (or, with a negative `days`, subtracts) whole days to an ISO date string. Built from local
// date components rather than `new Date(iso)` for the same reason the /api/menu proxy avoids
// it — parsing "YYYY-MM-DD" via the Date constructor treats it as UTC midnight, which lands on
// the wrong calendar day once read back out under a negative-UTC-offset timezone. Month/year
// rollover (e.g. Aug 31 + 1) is handled for free by the Date constructor's own normalization.
export function addDaysIso(iso: string, days: number): string {
	const [y, m, d] = iso.split("-").map(Number);
	const next = new Date(y, m - 1, d + days);
	const mm = String(next.getMonth() + 1).padStart(2, "0");
	const dd = String(next.getDate()).padStart(2, "0");
	return `${next.getFullYear()}-${mm}-${dd}`;
}
