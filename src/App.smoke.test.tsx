import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "@/App";
import { defaultWorkSettings } from "@/scheduler/workWindows";
import { usePlannerStore } from "@/store/plannerStore";

describe("App smoke", () => {
  beforeEach(() => {
    usePlannerStore.setState({
      jobs: [],
      workSettings: defaultWorkSettings(),
      viewMode: "week",
    });
  });

  it("renders core app chrome", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /auto plan/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /week/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /month/i })[0]).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /add job/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /jobs/i })).toBeInTheDocument();
  });

  it("can add a job from the form", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: "Smoke Test Job" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /add to schedule/i })[0]);
    expect(
      screen.getAllByRole("option", { name: /smoke test job/i })[0],
    ).toBeInTheDocument();
  });

  it("can switch from week to month view", () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: /month/i })[0]);
    expect(
      screen.getAllByText(/drag a job block onto another day/i)[0],
    ).toBeInTheDocument();
  });
});
