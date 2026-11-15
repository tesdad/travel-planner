import { handle } from "../_lib.js";

export const onRequestPost = handle((request, m) => m.vercel.plannerFunction("place")(request));
