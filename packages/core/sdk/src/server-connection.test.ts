import { describe, expect, it } from "@effect/vitest";

import {
  apiBaseUrlForServerOrigin,
  getExecutorServerAuthorizationHeader,
  normalizeExecutorServerConnection,
  normalizeExecutorServerOrigin,
  originFromApiBaseUrl,
  parseExecutorLocalServerManifest,
  serializeExecutorLocalServerManifest,
} from "./server-connection";

describe("Executor server connection", () => {
  it("normalizes server origins and API base URLs", () => {
    expect(normalizeExecutorServerOrigin("localhost:4788/")).toBe("http://localhost:4788");
    expect(normalizeExecutorServerOrigin("http://localhost:4788/api")).toBe(
      "http://localhost:4788",
    );
    expect(apiBaseUrlForServerOrigin("http://localhost:4788")).toBe("http://localhost:4788/api");
    expect(originFromApiBaseUrl("http://localhost:4788/api")).toBe("http://localhost:4788");
  });

  it("builds a stable connection from an explicit server origin", () => {
    const connection = normalizeExecutorServerConnection({
      origin: "https://executor.example",
      displayName: "Remote Executor",
    });

    expect(connection).toMatchObject({
      kind: "http",
      key: "http:https://executor.example",
      origin: "https://executor.example",
      apiBaseUrl: "https://executor.example/api",
      displayName: "Remote Executor",
    });
  });

  it("builds authorization headers from server auth", () => {
    expect(
      getExecutorServerAuthorizationHeader(
        normalizeExecutorServerConnection({
          origin: "http://127.0.0.1:4789",
          auth: {
            kind: "basic",
            username: "executor",
            password: "secret",
          },
        }),
      ),
    ).toBe("Basic ZXhlY3V0b3I6c2VjcmV0");

    expect(
      getExecutorServerAuthorizationHeader(
        normalizeExecutorServerConnection({
          origin: "https://executor.example",
          auth: {
            kind: "bearer",
            token: "remote-token",
          },
        }),
      ),
    ).toBe("Bearer remote-token");
  });

  it("round-trips local server owner manifests", () => {
    const manifest = {
      version: 1 as const,
      kind: "desktop-sidecar" as const,
      pid: 1234,
      startedAt: "2026-05-28T00:00:00.000Z",
      dataDir: "/Users/rhys/.executor",
      scopeDir: "/Users/rhys/.executor",
      supervised: false,
      connection: normalizeExecutorServerConnection({
        kind: "desktop-sidecar",
        key: "desktop-sidecar",
        origin: "http://127.0.0.1:4789",
        auth: { kind: "basic", username: "executor", password: "secret" },
      }),
      owner: {
        client: "desktop" as const,
        version: "1.2.3",
        executablePath: "/Applications/Executor.app/Contents/MacOS/Executor",
      },
    };

    expect(
      parseExecutorLocalServerManifest(serializeExecutorLocalServerManifest(manifest)),
    ).toEqual(manifest);
    expect(parseExecutorLocalServerManifest("{")).toBeNull();
    expect(parseExecutorLocalServerManifest(JSON.stringify({ ...manifest, pid: -1 }))).toBeNull();
  });

  it("round-trips an explicit supervised cli-daemon", () => {
    const manifest = {
      version: 1 as const,
      kind: "cli-daemon" as const,
      pid: 4321,
      startedAt: "2026-05-28T00:00:00.000Z",
      dataDir: "/Users/rhys/.executor",
      scopeDir: "/Users/rhys/.executor",
      supervised: true,
      connection: normalizeExecutorServerConnection({
        origin: "http://127.0.0.1:4789",
        auth: { kind: "bearer", token: "secret" },
      }),
      owner: {
        client: "cli" as const,
        version: "1.2.3",
        executablePath: "/usr/local/bin/executor",
      },
    };

    expect(
      parseExecutorLocalServerManifest(serializeExecutorLocalServerManifest(manifest)),
    ).toEqual(manifest);
  });

  it("preserves an explicit non-supervised cli-daemon through a round-trip", () => {
    // A foreground `executor daemon` publishes kind: "cli-daemon" with
    // supervised: false. The legacy `?? kind === "cli-daemon"` default must not
    // override that explicit false, or desktop would drive a user-started
    // daemon with supervised lifecycle semantics again (issue #1113).
    const manifest = {
      version: 1 as const,
      kind: "cli-daemon" as const,
      pid: 4321,
      startedAt: "2026-05-28T00:00:00.000Z",
      dataDir: "/Users/rhys/.executor",
      scopeDir: "/Users/rhys/.executor",
      supervised: false,
      connection: normalizeExecutorServerConnection({
        origin: "http://127.0.0.1:4789",
      }),
      owner: {
        client: "cli" as const,
        version: "1.2.3",
        executablePath: "/usr/local/bin/executor",
      },
    };

    expect(
      parseExecutorLocalServerManifest(serializeExecutorLocalServerManifest(manifest)),
    ).toEqual(manifest);
  });

  it("defaults supervised from kind for manifests written before the field existed", () => {
    const legacy = (kind: "cli-daemon" | "desktop-sidecar" | "foreground") =>
      JSON.stringify({
        version: 1,
        kind,
        pid: 4321,
        startedAt: "2026-05-28T00:00:00.000Z",
        dataDir: "/Users/rhys/.executor",
        scopeDir: "/Users/rhys/.executor",
        connection: { origin: "http://127.0.0.1:4789" },
        owner: { client: "cli", version: "1.2.3", executablePath: "/usr/local/bin/executor" },
      });

    // A legacy cli-daemon manifest keeps the old supervised assumption so an
    // already-running daemon is handled the same way across an upgrade.
    expect(parseExecutorLocalServerManifest(legacy("cli-daemon"))?.supervised).toBe(true);
    // Foreground and desktop-sidecar servers were never supervised.
    expect(parseExecutorLocalServerManifest(legacy("foreground"))?.supervised).toBe(false);
    expect(parseExecutorLocalServerManifest(legacy("desktop-sidecar"))?.supervised).toBe(false);
  });
});
