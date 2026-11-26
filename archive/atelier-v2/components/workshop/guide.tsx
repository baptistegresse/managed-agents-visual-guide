"use client";

import { createContext, useContext } from "react";
import type { Feature } from "@/lib/workshop/journey";

type Unlocked = (feature: Feature) => boolean;

/** En parcours guidé, une option n'apparaît qu'une fois sa mission atteinte. */
export const GuideContext = createContext<Unlocked>(() => true);

export function useUnlocked(): Unlocked {
  return useContext(GuideContext);
}
