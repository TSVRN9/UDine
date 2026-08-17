import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals: { safeGetSession } }) => {
	const { session } = await safeGetSession();
	return { session };
};
