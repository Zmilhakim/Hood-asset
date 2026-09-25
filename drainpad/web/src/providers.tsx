"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";

import { getConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: ReactNode }) {
  // Built once per browser session rather than at module scope, so a server
  // render never shares a cache with the client that hydrates it.
  const [config] = useState(() => getConfig());
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The catchment fills on its own. Refetching on an interval is what
            // keeps the list current without anybody pressing reload.
            staleTime: 10_000,
            refetchInterval: 20_000,
            retry: 2,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
