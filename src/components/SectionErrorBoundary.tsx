import { Component, type ReactNode } from "react";

/**
 * Keeps one section's render error inside that section: the rest of the page stays usable and the section shows
 * `fallback` (with a retry that renders it again). `resetKey` changing (new data) also clears the error.
 */
export class SectionErrorBoundary extends Component<
  { fallback: (retry: () => void) => ReactNode; resetKey?: unknown; children: ReactNode },
  { failed: boolean; key: unknown }
> {
  override state = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: { resetKey?: unknown },
    state: { failed: boolean; key: unknown },
  ) {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }

  private retry = () => this.setState({ failed: false });

  override render() {
    return this.state.failed ? this.props.fallback(this.retry) : this.props.children;
  }
}
