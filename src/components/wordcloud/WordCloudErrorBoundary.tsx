import { Component, type ReactNode } from "react";
import { MONO } from "../../data/constants";

interface Props { onClose: () => void; children: ReactNode }
interface State { hasError: boolean }

// A single throw inside the cloud must not take down everything mounted after
// it in App's tree — during wireframing an undefined lookup left the controls
// blank and the canvas empty with no visible error. Degrade to a plain message
// with a way out instead.
export class WordCloudErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Word Cloud crashed:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
          <p className="text-[13px] text-muted-foreground" style={{ fontFamily: MONO }}>
            Something went wrong drawing the cloud.
          </p>
          <button onClick={this.props.onClose}
            className="text-[12px] px-3 py-1.5 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            style={{ fontFamily: MONO }}>
            Close
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
