type ReactQueryClient = import("@tanstack/react-query").QueryClient;

let queryClientPromise: Promise<ReactQueryClient> | null = null;

export const getReactQueryClient = (): Promise<ReactQueryClient> => {
  queryClientPromise ??= import("@tanstack/react-query").then(
    ({ QueryClient: TanStackQueryClient }) =>
      new TanStackQueryClient({
        defaultOptions: {
          queries: {
            gcTime: Infinity,
            retry: false,
            staleTime: Infinity,
          },
        },
      }),
  );
  return queryClientPromise;
};
