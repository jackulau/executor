import type { ExecutorLocalServerManifest } from "@executor-js/sdk/shared";

type CliDaemonManifest = ExecutorLocalServerManifest & { readonly kind: "cli-daemon" };

type SupervisedDaemonAttachDecision =
  | {
      readonly kind: "attach";
      readonly manifest: CliDaemonManifest;
      readonly authToken: string;
    }
  | { readonly kind: "remove-stale-manifest"; readonly pid: number }
  | { readonly kind: "unavailable" };

export const resolveSupervisedDaemonAttach = async (
  manifest: ExecutorLocalServerManifest | null,
  input: {
    readonly isReachable: (origin: string) => Promise<boolean>;
    readonly isPidAlive: (pid: number) => boolean;
  },
): Promise<SupervisedDaemonAttachDecision> => {
  // A non-supervised cli-daemon (a foreground `executor daemon` a user started)
  // must not be driven with supervised lifecycle semantics, even though it
  // publishes the same kind as an OS-supervised daemon.
  if (!manifest || manifest.kind !== "cli-daemon" || !manifest.supervised) {
    return { kind: "unavailable" };
  }
  const cliManifest = { ...manifest, kind: "cli-daemon" as const };

  if (await input.isReachable(cliManifest.connection.origin)) {
    const auth = cliManifest.connection.auth;
    const authToken = auth && auth.kind === "bearer" ? auth.token : "";
    return { kind: "attach", manifest: cliManifest, authToken };
  }

  if (!input.isPidAlive(cliManifest.pid)) {
    return { kind: "remove-stale-manifest", pid: cliManifest.pid };
  }

  return { kind: "unavailable" };
};
