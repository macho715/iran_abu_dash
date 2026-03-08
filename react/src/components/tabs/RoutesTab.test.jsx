import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../RouteMapLeaflet.jsx", () => ({
  default: function RouteMapLeafletMock() {
    return <div>Route map mock</div>;
  }
}));

import RoutesTab from "./RoutesTab.jsx";

describe("RoutesTab", () => {
  it("shows backend effective_h instead of recomputing route ETA", () => {
    render(
      <RoutesTab
        routes={[
          { id: "A", name: "North", base_h: 4.5, status: "OPEN", cong: 0.2, effective_h: 7.4, note: "", newsRefs: [] }
        ]}
        routeGeo={null}
        selectedRouteId={null}
        onSelectRouteId={vi.fn()}
      />
    );

    expect(screen.getByText("7.4h")).toBeInTheDocument();
    expect(screen.getByText(/backend effective_h/i)).toBeInTheDocument();
  });
});
