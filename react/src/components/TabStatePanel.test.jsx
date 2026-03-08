import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import TabStatePanel from "./TabStatePanel.jsx";

describe("TabStatePanel", () => {
  it("renders loading and no-fresh variants from props", () => {
    const { rerender } = render(
      <TabStatePanel
        variant="loading"
        title="피드 로딩"
        message="최신 인텔 데이터를 가져오는 중입니다"
      />
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("피드 로딩")).toBeInTheDocument();
    expect(screen.getByText("최신 인텔 데이터를 가져오는 중입니다")).toBeInTheDocument();

    rerender(
      <TabStatePanel
        variant="no-fresh"
        message="반복 감지(repeated) 항목만 표시 중입니다."
        detail="반복(repeated): 2"
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("신규 시그널 없음");
    expect(screen.getByText("반복 감지(repeated) 항목만 표시 중입니다.")).toBeInTheDocument();
    expect(screen.getByText("반복(repeated): 2")).toBeInTheDocument();
  });

  it("uses alert role for error variant", () => {
    render(<TabStatePanel variant="error" message="요청에 실패했습니다" />);

    expect(screen.getByRole("alert")).toHaveTextContent("오류");
    expect(screen.getByText("요청에 실패했습니다")).toBeInTheDocument();
  });

  it("supports empty variant with custom detail and action slot", () => {
    render(
      <TabStatePanel
        variant="empty"
        title="표시할 항목이 없습니다"
        detail="필터를 바꾸거나 잠시 후 다시 시도하세요"
        actions={<button type="button">새로고침</button>}
      />
    );

    expect(screen.getByText("표시할 항목이 없습니다")).toBeInTheDocument();
    expect(screen.getByText("필터를 바꾸거나 잠시 후 다시 시도하세요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "새로고침" })).toBeInTheDocument();
  });
});
