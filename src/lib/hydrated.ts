// False on the server and during the first (hydrating) render in the browser; true right after. The signed-in portal
// renders who the person is (role, office, brand, dates in their time zone) and the server cannot know any of it:
// rendering it only once hydrated keeps the server HTML and the first browser render identical, so React never
// reports "Hydration failed" on a reload or on entering by a link.
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export const useHydrated = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
