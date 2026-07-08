import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

// The dashboard layout renders under DbProvider while Clerk has loaded but the
// client is not signed in yet (session still resolving, refreshing, or a
// server/client auth desync). Reproduce that exact auth state.
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false, getToken: async () => "" }),
}));

import { tables } from "./index";
import { DbProvider, useTable } from "./react";

function LiveDataChild() {
  const [events] = useTable(tables.event);
  return <span>{events.length}</span>;
}

describe("DbProvider when the client is not signed in", () => {
  test("renders live-data children without crashing", () => {
    const html = renderToString(
      <DbProvider>
        <LiveDataChild />
      </DbProvider>,
    );
    expect(html).toContain("0");
  });
});
