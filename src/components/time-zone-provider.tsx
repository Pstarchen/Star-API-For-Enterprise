"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { USER_TIME_ZONE_COOKIE, userTimeZone } from "@/lib/timezone";

const TimeZoneContext = createContext("UTC");
const subscribe = () => () => {};

function browserTimeZone() {
  return userTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export function TimeZoneProvider({ initialTimeZone, children }: { initialTimeZone: string; children: React.ReactNode }) {
  const router = useRouter();
  const serverTimeZone = userTimeZone(initialTimeZone);
  const timeZone = useSyncExternalStore(subscribe, browserTimeZone, () => serverTimeZone);

  useEffect(() => {
    document.cookie = `${USER_TIME_ZONE_COOKIE}=${encodeURIComponent(timeZone)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    if (timeZone !== serverTimeZone) router.refresh();
  }, [router, serverTimeZone, timeZone]);

  return <TimeZoneContext.Provider value={timeZone}>{children}</TimeZoneContext.Provider>;
}

export function useTimeZone() {
  return useContext(TimeZoneContext);
}
